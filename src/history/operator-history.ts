import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { MarketSnapshot } from '../operator/market-snapshot';
import type { OperationalBlockReason, PaperPosition } from '../types/market';
import type { OpenMeteoForecastResponse, WeatherForecast } from '../weather/open-meteo';
import type { WeatherMarketDecision } from '../weather/weather-score';
import type { WeatherMarketEnrichment } from '../operator/simple-operator';

export interface OperatorHistoryOperationalBlock {
  marketId: string;
  reason: OperationalBlockReason;
  yesPrice: number;
  threshold: number;
  decisionEdge: number;
}

export interface WalletStateSnapshot {
  startingCapital: number;
  cash: number;
  realizedPnl: number;
  openPositions: number;
}

export interface WriteOperatorHistoryInput {
  historyDir: string;
  runAt: string;
  snapshot: MarketSnapshot;
  weatherEnrichment: WeatherMarketEnrichment[];
  decisions: WeatherMarketDecision[];
  executedPositions: PaperPosition[];
  closedPositions: PaperPosition[];
  operationalBlocks: OperatorHistoryOperationalBlock[];
  allPositions: PaperPosition[];
  outputLines: string[];
  walletSnapshot?: WalletStateSnapshot;
}

export interface OperatorHistoryRecord {
  runAt: string;
  snapshot: MarketSnapshot;
  weatherEnrichment: WeatherMarketEnrichment[];
  decisions: WeatherMarketDecision[];
  executedPositions: PaperPosition[];
  closedPositions: PaperPosition[];
  operationalBlocks: OperatorHistoryOperationalBlock[];
  allPositions: PaperPosition[];
  outputLines: string[];
  walletSnapshot?: WalletStateSnapshot;
}

export interface LatestOperatorHistory {
  filePath: string;
  record: OperatorHistoryRecord;
}

export interface ReadLatestForecastFallbackInput {
  historyDir: string;
  latitude: number;
  longitude: number;
  forecastDays: number;
}

export interface ForecastHistoryFallback {
  source: 'history_fallback';
  forecast: WeatherForecast;
  runAt: string;
  historyFilePath: string;
}

function buildHistoryFilename(runAt: string): string {
  return `${runAt.replace(/:/g, '-')}.json`;
}

function isMissingPathError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

export async function writeOperatorHistory(input: WriteOperatorHistoryInput): Promise<string> {
  await mkdir(input.historyDir, { recursive: true });

  const historyRecord: OperatorHistoryRecord = {
    runAt: input.runAt,
    snapshot: input.snapshot,
    weatherEnrichment: input.weatherEnrichment,
    decisions: input.decisions,
    executedPositions: input.executedPositions,
    closedPositions: input.closedPositions,
    operationalBlocks: input.operationalBlocks,
    allPositions: input.allPositions,
    outputLines: input.outputLines,
    walletSnapshot: input.walletSnapshot,
  };

  const filePath = join(input.historyDir, buildHistoryFilename(input.runAt));
  await writeFile(filePath, `${JSON.stringify(historyRecord, null, 2)}\n`, 'utf8');
  return filePath;
}

export async function readOperatorHistory(filePath: string): Promise<OperatorHistoryRecord> {
  const content = await readFile(filePath, 'utf8');
  return JSON.parse(content) as OperatorHistoryRecord;
}

async function readHistoryEntries(historyDir: string): Promise<string[] | undefined> {
  try {
    return await readdir(historyDir);
  } catch (error) {
    if (isMissingPathError(error)) {
      return undefined;
    }

    throw error;
  }
}

function listHistoryJsonFiles(entries: string[]): string[] {
  return entries
    .filter((entry) => entry.endsWith('.json'))
    .sort((left, right) => left.localeCompare(right));
}

export async function readLatestOperatorHistory(historyDir: string): Promise<LatestOperatorHistory | undefined> {
  const entries = await readHistoryEntries(historyDir);
  if (!entries) {
    return undefined;
  }

  const latestFileName = listHistoryJsonFiles(entries).at(-1);

  if (!latestFileName) {
    return undefined;
  }

  const filePath = join(historyDir, latestFileName);
  return {
    filePath,
    record: await readOperatorHistory(filePath),
  };
}

export async function readLatestForecastFallback(
  input: ReadLatestForecastFallbackInput,
): Promise<ForecastHistoryFallback | undefined> {
  const entries = await readHistoryEntries(input.historyDir);
  if (!entries) {
    return undefined;
  }

  const historyFiles = listHistoryJsonFiles(entries).reverse();

  for (const historyFile of historyFiles) {
    const historyFilePath = join(input.historyDir, historyFile);
    const record = await readOperatorHistory(historyFilePath);

    const matchingEnrichment = record.weatherEnrichment.find((entry) => (
      entry.forecast.latitude === input.latitude
      && entry.forecast.longitude === input.longitude
      && entry.forecast.days.length === input.forecastDays
    ));

    if (!matchingEnrichment) {
      continue;
    }

    return {
      source: 'history_fallback',
      forecast: matchingEnrichment.forecast,
      runAt: record.runAt,
      historyFilePath,
    };
  }

  return undefined;
}

export type { OpenMeteoForecastResponse };
