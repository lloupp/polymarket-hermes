import {
  readLatestOperatorHistory,
  type OperatorHistoryRecord,
} from '../history/operator-history';
import {
  runSimpleWeatherOperator,
  type RunSimpleWeatherOperatorOptions,
} from '../operator/simple-operator';
import type { PaperPosition } from '../types/market';
import type { PaperWalletSnapshot } from '../types/paper';
import { buildDashboardViewModel, type DashboardViewModel } from './view-model';

export interface DashboardForecastRow {
  marketId: string;
  locationLabel: string;
  nextDate: string;
  precipitationProbability: string;
  precipitationSum: string;
  windSpeed: string;
  forecastSource?: 'live' | 'history_fallback';
  fallbackRunAt?: string;
  fallbackHistoryFilePath?: string;
}

export type DashboardDataSource = 'history' | 'live';

export interface DashboardDataStatus {
  source: DashboardDataSource;
  runAt?: string;
  historyDir?: string;
  historyFilePath?: string;
  message?: string;
}

export interface DashboardData {
  hero: {
    eyebrow: string;
    title: string;
    subtitle: string;
  };
  status: DashboardDataStatus;
  dashboard: DashboardViewModel;
  forecastRows: DashboardForecastRow[];
  outputLines: string[];
}

export interface BuildDashboardDataInput {
  source: DashboardDataSource;
  startingCapital?: number;
  historyDir?: string;
  operatorOptions?: RunSimpleWeatherOperatorOptions;
}

function buildHero(): DashboardData['hero'] {
  return {
    eyebrow: 'Polymarket Hermes',
    title: 'Paper Trading Dashboard',
    subtitle:
      'Visão inicial do operador com foco em mercados de clima, forecasts reais e trilha auditável.',
  };
}

function formatForecastRows(
  enrichment: Awaited<ReturnType<typeof runSimpleWeatherOperator>>['weatherEnrichment'],
): DashboardForecastRow[] {
  return enrichment.map((entry) => {
    const nextDay = entry.forecastDay ?? entry.forecast.days[0];

    return {
      marketId: entry.marketId,
      locationLabel: entry.locationLabel,
      nextDate: nextDay?.date ?? 'n/a',
      precipitationProbability: `${(nextDay?.precipitationProbabilityMax ?? 0).toFixed(0)}%`,
      precipitationSum: `${(nextDay?.precipitationSumMm ?? 0).toFixed(1)} mm`,
      windSpeed: `${(nextDay?.windSpeedMaxKmh ?? 0).toFixed(1)} km/h`,
      forecastSource: entry.forecastSource,
      fallbackRunAt: entry.fallbackRunAt,
      fallbackHistoryFilePath: entry.fallbackHistoryFilePath,
    };
  });
}

function roundToTwoDecimals(value: number): number {
  return Number(value.toFixed(2));
}

function calculateRealizedPnl(position: PaperPosition): number {
  if (typeof position.realizedPnl === 'number') {
    return position.realizedPnl;
  }

  if (typeof position.exitPrice === 'number') {
    return position.exitPrice * position.shares - position.notional;
  }

  return 0;
}

function buildWalletSnapshotFromHistory(
  startingCapital: number,
  positions: PaperPosition[],
): PaperWalletSnapshot {
  const openPositions = positions.filter((position) => position.status === 'OPEN');
  const closedPositions = positions.filter((position) => position.status === 'CLOSED');
  const realizedPnl = roundToTwoDecimals(
    closedPositions.reduce((total, position) => total + calculateRealizedPnl(position), 0),
  );
  const openNotional = openPositions.reduce((total, position) => total + position.notional, 0);
  const cash = roundToTwoDecimals(startingCapital - openNotional + realizedPnl);

  return {
    startingCapital,
    cash,
    realizedPnl,
    openPositions: openPositions.length,
  };
}

function formatDecisionLine(record: OperatorHistoryRecord['decisions'][number]): string {
  return `${record.signal} ${record.marketId} edge=${record.edge.toFixed(2)} size=${record.positionSize.toFixed(2)}`;
}

function buildDashboardFromHistory(
  record: OperatorHistoryRecord,
  startingCapital: number,
): DashboardViewModel {
  const approvedSignals = record.decisions.filter((decision) => decision.signal !== 'HOLD').length;
  const blockedSignals = record.decisions.length - approvedSignals;

  return buildDashboardViewModel({
    wallet: buildWalletSnapshotFromHistory(startingCapital, record.allPositions),
    positions: record.allPositions,
    analyzedMarkets: record.snapshot.weatherMarkets,
    approvedSignals,
    blockedSignals,
    closedPositions: record.closedPositions.length,
    operationalBlocks: record.operationalBlocks,
    recentDecisions: record.decisions.map(formatDecisionLine),
  });
}

function buildEmptyDashboardData(
  startingCapital: number,
  historyDir?: string,
): DashboardData {
  return {
    hero: buildHero(),
    status: {
      source: 'history',
      historyDir,
      message: 'Nenhum histórico encontrado no diretório informado.',
    },
    dashboard: buildDashboardViewModel({
      wallet: {
        startingCapital,
        cash: startingCapital,
        realizedPnl: 0,
        openPositions: 0,
      },
      positions: [],
      analyzedMarkets: [],
      approvedSignals: 0,
      blockedSignals: 0,
      closedPositions: 0,
      operationalBlocks: [],
      recentDecisions: [],
    }),
    forecastRows: [],
    outputLines: ['history_status=empty'],
  };
}

async function buildHistoryDashboardData(input: BuildDashboardDataInput): Promise<DashboardData> {
  const startingCapital = input.startingCapital ?? 1000;
  const historyDir = input.historyDir;

  if (!historyDir) {
    return buildEmptyDashboardData(startingCapital);
  }

  const latestHistory = await readLatestOperatorHistory(historyDir);
  if (!latestHistory) {
    return buildEmptyDashboardData(startingCapital, historyDir);
  }

  return {
    hero: buildHero(),
    status: {
      source: 'history',
      runAt: latestHistory.record.runAt,
      historyDir,
      historyFilePath: latestHistory.filePath,
      message: latestHistory.record.weatherEnrichment.some((entry) => entry.forecastSource === 'history_fallback')
        ? 'Histórico carregado do último ciclo salvo; contém forecast reaproveitado por fallback.'
        : 'Histórico carregado do último ciclo salvo.',
    },
    dashboard: buildDashboardFromHistory(latestHistory.record, startingCapital),
    forecastRows: formatForecastRows(latestHistory.record.weatherEnrichment),
    outputLines: latestHistory.record.outputLines,
  };
}

async function buildLiveDashboardData(input: BuildDashboardDataInput): Promise<DashboardData> {
  if (!input.operatorOptions) {
    throw new Error('live_operator_options_required');
  }

  const result = await runSimpleWeatherOperator(input.operatorOptions);

  return {
    hero: buildHero(),
    status: {
      source: 'live',
      runAt: input.operatorOptions.nowIso,
      historyDir: input.operatorOptions.historyDir,
      historyFilePath: result.historyFilePath,
      message: result.historyFilePath
        ? 'Execução live concluída e histórico salvo.'
        : 'Execução live concluída.',
    },
    dashboard: result.dashboard,
    forecastRows: formatForecastRows(result.weatherEnrichment),
    outputLines: result.outputLines,
  };
}

export async function buildDashboardData(
  input: BuildDashboardDataInput,
): Promise<DashboardData> {
  if (input.source === 'live') {
    return buildLiveDashboardData(input);
  }

  return buildHistoryDashboardData(input);
}
