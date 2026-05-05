import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import {
 runSimpleWeatherOperator,
 type RunSimpleWeatherOperatorOptions,
 type SimpleWeatherOperatorResult,
 type WeatherLocationConfig,
} from './simple-operator';
import { fetchMarketResolution } from '../ingestion/market-resolution';
import type { PaperWalletState } from '../types/paper';

export interface PaperObserverCliOptions extends RunSimpleWeatherOperatorOptions {
 once: boolean;
 cycles?: number;
 intervalMs: number;
 historyDir?: string;
 runtimeLogPath?: string;
  walletStatePath?: string;
}

export interface PaperObserverCycleRecord {
 runAt: string;
 historyDir?: string;
 runtimeLogPath?: string;
 totalMarkets: number;
 weatherMarkets: number;
 weatherForecasts: number;
 signalsApproved: number;
 signalsBlocked: number;
 positionsOpened: number;
 positionsClosed: number;
 historyFilePath?: string;
 winRate?: number;
 winRateResolved?: number;
 winRateWins?: number;
 winRateLosses?: number;
 winRatePnl?: number;
}

export interface PaperObserverCycleResult {
 record: PaperObserverCycleRecord;
 result: SimpleWeatherOperatorResult;
}

const DEFAULT_WEATHER_LOCATIONS: WeatherLocationConfig[] = [];
const DEFAULT_CLIMATE_SEARCH_QUERIES = [
 'highest temperature in',
 'temperature in london',
 'temperature in seoul',
];

function parseBooleanFlag(value: string | undefined, defaultValue: boolean): boolean {
 if (!value) {
 return defaultValue;
 }

 const normalized = value.trim().toLowerCase();
 if (['1', 'true', 'yes', 'on'].includes(normalized)) {
 return true;
 }
 if (['0', 'false', 'no', 'off'].includes(normalized)) {
 return false;
 }
 return defaultValue;
}

function parseNumberFlag(value: string | undefined, fallback: number): number {
 if (!value) {
 return fallback;
 }

 const parsed = Number(value);
 return Number.isFinite(parsed) ? parsed : fallback;
}

function parseOptionalNumberFlag(value: string | undefined): number | undefined {
 if (!value) {
 return undefined;
 }

 const parsed = Number(value);
 return Number.isFinite(parsed) ? parsed : undefined;
}

function parseArgValue(arg: string): [string, string | undefined] {
 const [key, ...rest] = arg.split('=');
 return [key, rest.length > 0 ? rest.join('=') : undefined];
}

function resolveRuntimeLogPath(values: Map<string, string | undefined>): string {
 return values.get('--runtime-log-path') ?? values.get('--ndjson-log') ?? 'operator-runtime/paper-observer.ndjson';
}

export function buildPaperObserverCliOptions(args: string[]): PaperObserverCliOptions {
 const values = new Map<string, string | undefined>();
 const searchQueries: string[] = [];

 for (let index = 0; index < args.length; index += 1) {
 const arg = args[index];
 if (!arg?.startsWith('--')) {
 continue;
 }

 const [key, inlineValue] = parseArgValue(arg);
 let value = inlineValue;

 if (value === undefined) {
 const nextArg = args[index + 1];
 if (nextArg && !nextArg.startsWith('--')) {
 value = nextArg;
 index += 1;
 }
 }

 if (key === '--search-query' && value) {
 searchQueries.push(value);
 }
 values.set(key, value);
 }

 return {
 once: values.has('--once') || parseBooleanFlag(values.get('--once'), false),
 cycles: parseOptionalNumberFlag(values.get('--cycles')),
 intervalMs: parseNumberFlag(values.get('--interval-ms'), 60_000),
 historyDir: values.get('--history-dir') ?? 'operator-runtime/history',
 runtimeLogPath: resolveRuntimeLogPath(values),
 walletStatePath: values.get('--wallet-state-path'),
 startingCapital: parseNumberFlag(values.get('--starting-capital'), 1000),
 marketLimit: parseNumberFlag(values.get('--market-limit'), 20),
 forecastDays: parseNumberFlag(values.get('--forecast-days'), 2),
 minEdge: parseNumberFlag(values.get('--min-edge'), 0.03),
 kellyFraction: parseNumberFlag(values.get('--kelly-fraction'), 0.5),
 maxPositionUsd: parseNumberFlag(values.get('--max-position-usd'), 100),
 minYesPrice: parseNumberFlag(values.get('--min-yes-price'), 0.02),
 minRepricingEdge: parseNumberFlag(values.get('--min-repricing-edge'), 0.08),
 takeProfitPct: parseOptionalNumberFlag(values.get('--take-profit-pct')),
 maxHoldingHours: parseOptionalNumberFlag(values.get('--max-holding-hours')),
 weatherLocations: DEFAULT_WEATHER_LOCATIONS,
 searchQueries: searchQueries.length > 0 ? searchQueries : DEFAULT_CLIMATE_SEARCH_QUERIES,
 };
}

function buildCycleRecord(runAt: string, result: SimpleWeatherOperatorResult): PaperObserverCycleRecord {
 const signalsApproved = result.decisions.filter((decision) => decision.signal !== 'HOLD').length;
 const signalsBlocked = result.decisions.length - signalsApproved;
 const wr = result.winRate;

 return {
 runAt,
 totalMarkets: result.snapshot.totalMarkets,
 weatherMarkets: result.snapshot.weatherMarketCount,
 weatherForecasts: result.weatherEnrichment.length,
 signalsApproved,
 signalsBlocked,
 positionsOpened: result.executedPositions.length,
 positionsClosed: result.closedPositions.length,
 historyFilePath: result.historyFilePath,
 winRate: wr.totalResolved > 0 ? wr.winRate : undefined,
 winRateResolved: wr.totalResolved > 0 ? wr.totalResolved : undefined,
 winRateWins: wr.totalResolved > 0 ? wr.wins : undefined,
 winRateLosses: wr.totalResolved > 0 ? wr.losses : undefined,
 winRatePnl: wr.totalResolved > 0 ? wr.totalPnl : undefined,
 };
}

async function appendCycleRecord(runtimeLogPath: string, record: PaperObserverCycleRecord): Promise<void> {
 await mkdir(dirname(runtimeLogPath), { recursive: true });
 await appendFile(runtimeLogPath, `${JSON.stringify(record)}\n`, 'utf8');
}



async function readWalletState(walletStatePath: string | undefined): Promise<PaperWalletState | undefined> {
 const resolvedPath = walletStatePath ?? './paper-wallet-state.json';

 try {
  const content = await readFile(resolvedPath, 'utf8');
  return JSON.parse(content) as PaperWalletState;
 } catch (error) {
  if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') {
   return undefined;
  }

  throw error;
 }
}

async function writeWalletState(walletStatePath: string | undefined, state: PaperWalletState): Promise<void> {
 const resolvedPath = walletStatePath ?? './paper-wallet-state.json';
 await mkdir(dirname(resolvedPath), { recursive: true });
 await writeFile(resolvedPath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

export async function runPaperObserverCycle(
  options: Omit<PaperObserverCliOptions, 'once' | 'cycles' | 'intervalMs'> & { nowIso?: string },
): Promise<PaperObserverCycleResult> {
 const runAt = options.nowIso ?? new Date().toISOString();

  const walletState = await readWalletState(options.walletStatePath);

 const result = await runSimpleWeatherOperator({
 startingCapital: options.startingCapital,
 marketLimit: options.marketLimit,
 forecastDays: options.forecastDays,
 minEdge: options.minEdge,
 kellyFraction: options.kellyFraction,
 maxPositionUsd: options.maxPositionUsd,
 minYesPrice: options.minYesPrice,
 minRepricingEdge: options.minRepricingEdge,
 takeProfitPct: options.takeProfitPct,
 maxHoldingHours: options.maxHoldingHours,
 nowIso: runAt,
 historyDir: options.historyDir,
 seedPositions: options.seedPositions,
 walletState,
 weatherLocations: options.weatherLocations,
 searchQueries: options.searchQueries,
 gammaFetcher: options.gammaFetcher,
 publicSearchFetcher: options.publicSearchFetcher,
 weatherFetcher: options.weatherFetcher,
 forecastProvider: options.forecastProvider,
 marketResolutionFetcher: options.marketResolutionFetcher ?? fetchMarketResolution,
 });

 const record = buildCycleRecord(runAt, result);
 record.historyDir = options.historyDir;
 record.runtimeLogPath = options.runtimeLogPath;

 if (options.runtimeLogPath) {
 await appendCycleRecord(options.runtimeLogPath, record);
 }

 await writeWalletState(options.walletStatePath, result.walletState);

 return { record, result };
}

export function renderPaperObserverCycleSummary(cycle: PaperObserverCycleResult): string {
 const lines = [
 `run_at=${cycle.record.runAt}`,
 `history_dir=${cycle.record.historyDir ?? ''}`,
 `runtime_log_path=${cycle.record.runtimeLogPath ?? ''}`,
 `markets_total=${cycle.record.totalMarkets}`,
 `weather_markets=${cycle.record.weatherMarkets}`,
 `weather_forecasts=${cycle.record.weatherForecasts}`,
 `signals_approved=${cycle.record.signalsApproved}`,
 `signals_blocked=${cycle.record.signalsBlocked}`,
 `positions_opened=${cycle.record.positionsOpened}`,
 `positions_closed=${cycle.record.positionsClosed}`,
 ];

 if (cycle.record.historyFilePath) {
 lines.push(`history_file=${cycle.record.historyFilePath}`);
 }

 lines.push(...cycle.result.outputLines);
 return lines.join('\n');
}

export function sleep(ms: number): Promise<void> {
 return new Promise((resolve) => {
 setTimeout(resolve, ms);
 });
}
