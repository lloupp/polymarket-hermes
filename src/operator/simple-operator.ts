import { buildDashboardViewModel, type DashboardViewModel } from '../dashboard/view-model';
import { readLatestForecastFallback, writeOperatorHistory } from '../history/operator-history';
import { fetchGammaMarkets } from '../ingestion/polymarket';

import { buildMarketSnapshot, type MarketSnapshot } from './market-snapshot';
import { PaperWallet } from '../paper/paper-wallet';
import type { OperationalBlockReason, PaperPosition, PositionOutcome } from '../types/market';
import type { PaperWalletState } from '../types/paper';
import {
  openMeteoForecastProvider,
  type WeatherForecastProvider,
} from '../weather/forecast-provider';
import type {
  ForecastDay,
  OpenMeteoForecastResponse,
  WeatherForecast,
} from '../weather/open-meteo';
import { resolveWeatherLocation } from '../weather/location-resolver';
import {
  buildWeatherMarketDecision,
  resolveForecastDayForMarket,
  type ForecastDaySelectionStrategy,
  type WeatherMarketDecision,
} from '../weather/weather-score';

export interface WeatherLocationConfig {
  marketId: string;
  latitude: number;
  longitude: number;
  label: string;
}

export interface WeatherMarketEnrichment {
  marketId: string;
  locationLabel: string;
  providerName: string;
  forecast: WeatherForecast;
  forecastDay?: ForecastDay;
  forecastDayStrategy: ForecastDaySelectionStrategy;
  forecastSource?: 'live' | 'history_fallback';
  fallbackRunAt?: string;
  fallbackHistoryFilePath?: string;
}

export interface SeedPaperPositionInput {
  marketId: string;
  outcome: 'YES' | 'NO';
  entryPrice: number;
  shares: number;
  openedAt: string;
}



export interface RunSimpleWeatherOperatorOptions {
  startingCapital: number;
  marketLimit: number;
  forecastDays: number;
  minEdge: number;
  kellyFraction: number;
  maxPositionUsd: number;
  minYesPrice?: number;
  minRepricingEdge?: number;
  takeProfitPct?: number;
  maxHoldingHours?: number;
  nowIso?: string;
  historyDir?: string;
  seedPositions?: SeedPaperPositionInput[];
  walletState?: PaperWalletState;
  weatherLocations: WeatherLocationConfig[];
  searchQueries?: string[];
  gammaFetcher?: () => Promise<unknown>;
  publicSearchFetcher?: (query: string) => Promise<unknown>;
  weatherFetcher?: () => Promise<unknown>;
  forecastProvider?: WeatherForecastProvider;

}

export interface OperationalBlock {
  marketId: string;
  reason: OperationalBlockReason;
  yesPrice: number;
  threshold: number;
  decisionEdge: number;
}

export interface SimpleWeatherOperatorResult {
  snapshot: MarketSnapshot;
  weatherEnrichment: WeatherMarketEnrichment[];
  decisions: WeatherMarketDecision[];
  executedPositions: PaperPosition[];
  closedPositions: PaperPosition[];
  operationalBlocks: OperationalBlock[];
  dashboard: DashboardViewModel;
  outputLines: string[];
  historyFilePath?: string;
  walletState: PaperWalletState;
}

async function enrichWeatherMarkets(
  snapshot: MarketSnapshot,
  weatherLocations: WeatherLocationConfig[],
  forecastDays: number,
  historyDir?: string,
  weatherFetcher?: () => Promise<unknown>,
  forecastProvider: WeatherForecastProvider = openMeteoForecastProvider,
): Promise<{
  enrichment: WeatherMarketEnrichment[];
  rateLimitCount: number;
  fallbackCount: number;
  fallbackMissCount: number;
}> {
  const enrichment: WeatherMarketEnrichment[] = [];
  const forecastRequests = new Map<string, Promise<WeatherForecast>>();
  let rateLimitCount = 0;
  let fallbackCount = 0;
  let fallbackMissCount = 0;

  for (const market of snapshot.weatherMarkets) {
    const location = resolveWeatherLocation(market, weatherLocations);

    if (!location) {
      continue;
    }

    const cacheKey = `${location.latitude}:${location.longitude}:${forecastDays}`;
    const forecastRequest = forecastRequests.get(cacheKey)
      ?? forecastProvider.fetchForecast({
        latitude: location.latitude,
        longitude: location.longitude,
        forecastDays,
        fetcher: weatherFetcher,
      });

    forecastRequests.set(cacheKey, forecastRequest);

    let forecast: WeatherForecast | undefined;
    let forecastSource: WeatherMarketEnrichment['forecastSource'] = 'live';
    let fallbackRunAt: string | undefined;
    let fallbackHistoryFilePath: string | undefined;

    try {
      forecast = await forecastRequest;
    } catch (error) {
      if ((error as Error)?.message !== 'open_meteo_rate_limited') {
        continue;
      }

      rateLimitCount += 1;

      const fallback = historyDir
        ? await readLatestForecastFallback({
          historyDir,
          latitude: location.latitude,
          longitude: location.longitude,
          forecastDays,
        })
        : undefined;

      if (!fallback) {
        fallbackMissCount += 1;
        continue;
      }

      forecast = fallback.forecast;
      forecastSource = fallback.source;
      fallbackRunAt = fallback.runAt;
      fallbackHistoryFilePath = fallback.historyFilePath;
      fallbackCount += 1;
    }

    if (!forecast) {
      continue;
    }

    const { forecastDay, strategy } = resolveForecastDayForMarket(market, forecast);

    enrichment.push({
      marketId: market.id,
      locationLabel: location.label,
      providerName: forecastProvider.name,
      forecast,
      forecastDay,
      forecastDayStrategy: strategy,
      forecastSource,
      fallbackRunAt,
      fallbackHistoryFilePath,
    });
  }

  return {
    enrichment,
    rateLimitCount,
    fallbackCount,
    fallbackMissCount,
  };
}

function buildTemperatureLadderGroupKey(question: string): string | undefined {
  const match = question.match(/highest temperature in (.+?) be\s+\d+°?c(?:\s+or\s+(?:below|higher))?\s+on\s+([a-z]+\s+\d+)/i);
  if (!match) {
    return undefined;
  }

  const city = match[1]?.trim().toLowerCase();
  const date = match[2]?.trim().toLowerCase();
  if (!city || !date) {
    return undefined;
  }

  return `${city}::${date}`;
}

function suppressCorrelatedTemperatureLadders(
  decisions: WeatherMarketDecision[],
  snapshot: MarketSnapshot,
): WeatherMarketDecision[] {
  const groups = new Map<string, WeatherMarketDecision[]>();

  for (const decision of decisions) {
    const market = snapshot.weatherMarkets.find((candidate) => candidate.id === decision.marketId);
    if (!market) {
      continue;
    }

    const groupKey = buildTemperatureLadderGroupKey(market.question);
    if (!groupKey) {
      continue;
    }

    groups.set(groupKey, [...(groups.get(groupKey) ?? []), decision]);
  }

  if (groups.size === 0) {
    return decisions;
  }

  const selectedIds = new Set<string>();
  for (const groupDecisions of Array.from(groups.values())) {
    const bestPositive = groupDecisions
      .filter((decision) => decision.signal === 'BUY_YES')
      .sort((left, right) => right.edge - left.edge)[0];

    if (bestPositive) {
      selectedIds.add(bestPositive.marketId);
    }
  }

  return decisions.map((decision) => {
    const market = snapshot.weatherMarkets.find((candidate) => candidate.id === decision.marketId);
    if (!market) {
      return decision;
    }

    const groupKey = buildTemperatureLadderGroupKey(market.question);
    if (!groupKey) {
      return decision;
    }

    if (selectedIds.has(decision.marketId)) {
      return decision;
    }

    return {
      ...decision,
      signal: 'HOLD',
      positionSize: 0,
      reason: 'temperature_ladder_suppressed_correlated_candidate',
    };
  });
}

function buildDecisions(
  snapshot: MarketSnapshot,
  weatherEnrichment: WeatherMarketEnrichment[],
  options: Pick<RunSimpleWeatherOperatorOptions, 'minEdge' | 'kellyFraction'>,
): WeatherMarketDecision[] {
  const rawDecisions = weatherEnrichment.flatMap((entry) => {
    const market = snapshot.weatherMarkets.find((candidate) => candidate.id === entry.marketId);

    if (!market) {
      return [];
    }

    return [
      buildWeatherMarketDecision({
        market,
        forecast: entry.forecast,
        forecastDay: entry.forecastDay,
        minEdge: options.minEdge,
        kellyFraction: options.kellyFraction,
      }),
    ];
  });

  return suppressCorrelatedTemperatureLadders(rawDecisions, snapshot);
}

function executePaperPositions(input: {
  wallet: PaperWallet;
  snapshot: MarketSnapshot;
  decisions: WeatherMarketDecision[];
  maxPositionUsd: number;
  minYesPrice?: number;
  minRepricingEdge?: number;
}): { executedPositions: PaperPosition[]; operationalBlocks: OperationalBlock[] } {
  const executedPositions: PaperPosition[] = [];
  const operationalBlocks: OperationalBlock[] = [];
  const minYesPrice = input.minYesPrice ?? 0;
  const minRepricingEdge = input.minRepricingEdge ?? 0;

  // Build a set of market IDs that already have open positions (dedup)
  const openMarketIds = new Set<string>();
  for (const pos of input.wallet.listPositions()) {
    if (pos.status === 'OPEN') {
      openMarketIds.add(pos.marketId);
    }
  }

  for (const decision of input.decisions) {
    if (decision.signal !== 'BUY_YES' || decision.positionSize <= 0) {
      continue;
    }

    // Dedup: skip if there's already an open position for this market
    if (openMarketIds.has(decision.marketId)) {
      continue;
    }

    const market = input.snapshot.weatherMarkets.find((candidate) => candidate.id === decision.marketId);

    if (!market || market.yesPrice <= 0 || market.closed === true) {
      continue;
    }

    if (market.yesPrice < minYesPrice) {
      operationalBlocks.push({
        marketId: market.id,
        reason: 'blocked_by_min_yes_price',
        yesPrice: market.yesPrice,
        threshold: minYesPrice,
        decisionEdge: decision.edge,
      });
      continue;
    }

    if (decision.edge < minRepricingEdge) {
      operationalBlocks.push({
        marketId: market.id,
        reason: 'blocked_by_min_repricing_edge',
        yesPrice: market.yesPrice,
        threshold: minRepricingEdge,
        decisionEdge: decision.edge,
      });
      continue;
    }

    // Cash-aware sizing: cap notional to available cash
    const requestedNotional = Number((decision.positionSize * input.maxPositionUsd).toFixed(2));
    const availableCash = input.wallet.getCash();
    const notional = Math.min(requestedNotional, availableCash);

    if (notional < 1) {
      // Not enough cash to open even a minimum position
      continue;
    }

    const shares = Number((notional / market.yesPrice).toFixed(8));

    const position = input.wallet.openPosition({
      marketId: market.id,
      outcome: 'YES',
      entryPrice: market.yesPrice,
      shares,
      openedAt: market.closesAt,
    });

    executedPositions.push(position);
    openMarketIds.add(market.id); // Track newly opened position for dedup
  }

  return { executedPositions, operationalBlocks };
}

function seedPaperPositions(wallet: PaperWallet, seedPositions: SeedPaperPositionInput[] = []): void {
  for (const position of seedPositions) {
    wallet.openPosition(position);
  }
}

function shouldTakeProfit(position: PaperPosition, market: { yesPrice: number; noPrice: number }, takeProfitPct: number): boolean {
  const currentPrice = position.outcome === 'YES' ? market.yesPrice : market.noPrice;
  return currentPrice >= position.entryPrice * (1 + takeProfitPct);
}

function shouldTimeout(position: PaperPosition, nowIso: string, maxHoldingHours: number): boolean {
  const openedMs = Date.parse(position.openedAt);
  const nowMs = Date.parse(nowIso);
  const holdingMs = nowMs - openedMs;
  return holdingMs >= maxHoldingHours * 60 * 60 * 1000;
}

function closePaperPositions(input: {
  wallet: PaperWallet;
  snapshot: MarketSnapshot;
  nowIso?: string;
  takeProfitPct?: number;
  maxHoldingHours?: number;
  
}): PaperPosition[] {
  const { nowIso, takeProfitPct, maxHoldingHours } = input;

  if (!nowIso) {
    return [];
  }

  const closed: PaperPosition[] = [];
  const nowMs = Date.parse(nowIso);

  for (const position of input.wallet.listPositions()) {
    if (position.status !== 'OPEN') {
      continue;
    }

    const market = input.snapshot.weatherMarkets.find((candidate) => candidate.id === position.marketId);

    // 1. Check if the market has expired (closesAt in the past) — close at current price
    if (market?.closesAt && Date.parse(market.closesAt) < nowMs) {
      const exitPrice = position.outcome === 'YES' ? market.yesPrice : market.noPrice;
      closed.push(
        input.wallet.closePosition({
          positionId: position.id,
          exitPrice: exitPrice > 0 ? exitPrice : 0.001, // avoid zero exit price
          closedAt: nowIso,
          exitReason: 'market_expired',
        }),
      );
      continue;
    }

    // 2. Check take-profit and timeout (requires takeProfitPct and maxHoldingHours)
    if (takeProfitPct === undefined || maxHoldingHours === undefined) {
      continue;
    }

    if (!market) {
      continue;
    }

    const takeProfitHit = shouldTakeProfit(position, market, takeProfitPct);
    const timeoutHit = shouldTimeout(position, nowIso, maxHoldingHours);

    if (!takeProfitHit && !timeoutHit) {
      continue;
    }

    const exitPrice = position.outcome === 'YES' ? market.yesPrice : market.noPrice;
    const exitReason = takeProfitHit ? 'take_profit' : 'timeout';

    closed.push(
      input.wallet.closePosition({
        positionId: position.id,
        exitPrice,
        closedAt: nowIso,
        exitReason,
      }),
    );
  }

  return closed;
}

function buildClosedExitReasonSummary(closedPositions: PaperPosition[]): string {
  if (closedPositions.length === 0) {
    return 'none';
  }

  const counts = new Map<string, number>();

  for (const position of closedPositions) {
    const reason = position.exitReason ?? 'unknown';
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([reason, count]) => `${reason}:${count}`)
    .join(',');
}

function buildOperationalBlockSummary(operationalBlocks: OperationalBlock[]): string {
  if (operationalBlocks.length === 0) {
    return 'none';
  }

  const counts = new Map<OperationalBlockReason, number>();

  for (const block of operationalBlocks) {
    counts.set(block.reason, (counts.get(block.reason) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([reason, count]) => `${reason}:${count}`)
    .join(',');
}

function buildWeatherDiscoveryBreakdown(markets: MarketSnapshot['weatherMarkets']): string {
  if (markets.length === 0) {
    return 'none';
  }

  const counts = new Map<string, number>();
  for (const market of markets) {
    const source = market.discoverySource ?? 'unknown';
    counts.set(source, (counts.get(source) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([source, count]) => `${source}:${count}`)
    .join(',');
}

function buildWeatherDiscoveryQuerySummary(markets: MarketSnapshot['weatherMarkets']): string {
  const discoveredByQuery = markets.filter((market) => market.discoveryQuery);
  if (discoveredByQuery.length === 0) {
    return 'none';
  }

  const counts = new Map<string, number>();
  for (const market of discoveredByQuery) {
    const query = market.discoveryQuery as string;
    counts.set(query, (counts.get(query) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([query, count]) => `${query}:${count}`)
    .join(',');
}

function buildOutputLines(result: {
  snapshot: MarketSnapshot;
  weatherEnrichment: WeatherMarketEnrichment[];
  decisions: WeatherMarketDecision[];
  executedPositions: PaperPosition[];
  closedPositions: PaperPosition[];
  operationalBlocks: OperationalBlock[];
  rateLimitCount: number;
  fallbackCount: number;
  fallbackMissCount: number;
}): string[] {
  const approvedSignals = result.decisions.filter((decision) => decision.signal !== 'HOLD').length;
  const blockedSignals = result.decisions.length - approvedSignals;

  return [
    `markets_total=${result.snapshot.totalMarkets}`,
    `weather_markets=${result.snapshot.weatherMarketCount}`,
    `weather_forecasts=${result.weatherEnrichment.length}`,
    `forecast_rate_limits=${result.rateLimitCount}`,
    `forecast_fallbacks=${result.fallbackCount}`,
    `forecast_fallback_misses=${result.fallbackMissCount}`,
    `weather_discovery_breakdown=${buildWeatherDiscoveryBreakdown(result.snapshot.weatherMarkets)}`,
    `weather_discovery_queries=${buildWeatherDiscoveryQuerySummary(result.snapshot.weatherMarkets)}`,
    `signals_approved=${approvedSignals}`,
    `signals_blocked=${blockedSignals}`,
    `positions_opened=${result.executedPositions.length}`,
    `positions_closed=${result.closedPositions.length}`,
    `closed_position_exit_reasons=${buildClosedExitReasonSummary(result.closedPositions)}`,
    `operational_blocks=${buildOperationalBlockSummary(result.operationalBlocks)}`,
  ];
}

function formatDecisionLine(decision: WeatherMarketDecision): string {
  return `${decision.signal} ${decision.marketId} edge=${decision.edge.toFixed(2)} size=${decision.positionSize.toFixed(2)}`;
}

export async function runSimpleWeatherOperator(
  options: RunSimpleWeatherOperatorOptions,
): Promise<SimpleWeatherOperatorResult> {
  const wallet = options.walletState
    ? new PaperWallet({ startingCapital: options.startingCapital, state: options.walletState })
    : new PaperWallet({ startingCapital: options.startingCapital });
  seedPaperPositions(wallet, options.seedPositions);

  const markets = await fetchGammaMarkets({
    limit: options.marketLimit,
    fetcher: options.gammaFetcher,
    publicSearchFetcher: options.publicSearchFetcher,
    searchQueries: options.searchQueries,
  });
  const snapshot = buildMarketSnapshot(markets);
  const weatherResult = await enrichWeatherMarkets(
    snapshot,
    options.weatherLocations,
    options.forecastDays,
    options.historyDir,
    options.weatherFetcher,
    options.forecastProvider,
  );
  const weatherEnrichment = weatherResult.enrichment;
  const decisions = buildDecisions(snapshot, weatherEnrichment, {
    minEdge: options.minEdge,
    kellyFraction: options.kellyFraction,
  });
  const { executedPositions, operationalBlocks } = executePaperPositions({
    wallet,
    snapshot,
    decisions,
    maxPositionUsd: options.maxPositionUsd,
    minYesPrice: options.minYesPrice,
    minRepricingEdge: options.minRepricingEdge,
  });

  const closedPositions = closePaperPositions({
      wallet,
      snapshot,
      nowIso: options.nowIso,
      takeProfitPct: options.takeProfitPct,
      maxHoldingHours: options.maxHoldingHours,
    });
  const approvedSignals = decisions.filter((decision) => decision.signal !== 'HOLD').length;
  const blockedSignals = decisions.length - approvedSignals;

  const allPositions = wallet.listPositions();
  const dashboard = buildDashboardViewModel({
    wallet: wallet.snapshot(),
    positions: allPositions,
    analyzedMarkets: snapshot.weatherMarkets,
    approvedSignals,
    blockedSignals,
    closedPositions: closedPositions.length,
    operationalBlocks,
    recentDecisions: decisions.map(formatDecisionLine),
  });
  const outputLines = buildOutputLines({
    snapshot,
    weatherEnrichment,
    decisions,
    executedPositions,
    closedPositions,
    operationalBlocks,
    rateLimitCount: weatherResult.rateLimitCount,
    fallbackCount: weatherResult.fallbackCount,
    fallbackMissCount: weatherResult.fallbackMissCount,
  });

  const walletSnapshot = wallet.snapshot();

  const historyFilePath = options.historyDir && options.nowIso
    ? await writeOperatorHistory({
        historyDir: options.historyDir,
        runAt: options.nowIso,
        snapshot,
        weatherEnrichment,
        decisions,
        executedPositions,
        closedPositions,
        operationalBlocks,
        allPositions,
        outputLines,
        walletSnapshot,
      })
    : undefined;

  const result = {
    snapshot,
    weatherEnrichment,
    decisions,
    executedPositions,
    closedPositions,
    operationalBlocks,
    dashboard,
    outputLines,
    historyFilePath,
    walletState: wallet.exportState(),
  } satisfies SimpleWeatherOperatorResult;

  return result;
}


export type { OpenMeteoForecastResponse };
