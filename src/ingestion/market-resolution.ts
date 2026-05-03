import type { PositionOutcome } from '../types/market';

export interface MarketResolution {
  marketId: string;
  closed: boolean;
  /** YES price after resolution (1.0 if YES won, 0.0 if NO won, or current price if still open) */
  yesPrice: number;
  /** NO price after resolution (0.0 if YES won, 1.0 if NO won, or current price if still open) */
  noPrice: number;
  /** Which outcome won, if market is resolved */
  winningOutcome?: PositionOutcome;
}

export interface FetchMarketResolutionOptions {
  /** Custom fetcher for testing */
  fetcher?: (marketId: string) => Promise<unknown>;
}

interface GammaMarketDetail {
  closed?: boolean;
  outcomePrices?: string;
  outcomes?: string;
}

function parsePriceArray(raw: string | undefined): number[] {
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value));
  } catch {
    return [];
  }
}

function resolveWinningOutcome(
  closed: boolean,
  yesPrice: number,
  noPrice: number,
  outcomes?: string,
): PositionOutcome | undefined {
  if (!closed) {
    return undefined;
  }

  // outcomePrices after resolution: ["1","0"] = YES won, ["0","1"] = NO won
  if (yesPrice >= 1 && noPrice <= 0) {
    return 'YES';
  }

  if (noPrice >= 1 && yesPrice <= 0) {
    return 'NO';
  }

  // Fallback: parse outcomes labels if available
  // Gamma API returns outcomes like '["Yes","No"]'
  // When closed, price at index 0 = YES, index 1 = NO
  // If neither is 1.0, we can't determine resolution — return undefined
  return undefined;
}

async function defaultMarketDetailFetcher(marketId: string): Promise<unknown> {
  const response = await fetch(`https://gamma-api.polymarket.com/markets/${marketId}`, {
    headers: {
      'User-Agent': 'polymarket-hermes/0.1.0',
    },
  });

  return response.json();
}

function isGammaMarketDetail(input: unknown): input is GammaMarketDetail {
  return typeof input === 'object' && input !== null && 'id' in (input as Record<string, unknown>);
}

/**
 * Fetches resolution status for a single market from the Gamma API.
 * Returns the market's closed status, current prices, and winning outcome if resolved.
 */
export async function fetchMarketResolution(
  marketId: string,
  options?: FetchMarketResolutionOptions,
): Promise<MarketResolution> {
  try {
    const raw = options?.fetcher
      ? await options.fetcher(marketId)
      : await defaultMarketDetailFetcher(marketId);

    if (!isGammaMarketDetail(raw)) {
      return { marketId, closed: false, yesPrice: 0, noPrice: 0 };
    }

    const prices = parsePriceArray(raw.outcomePrices);
    const closed = raw.closed === true;
    const yesPrice = prices[0] ?? 0;
    const noPrice = prices[1] ?? 0;
    const winningOutcome = resolveWinningOutcome(closed, yesPrice, noPrice, raw.outcomes);

    return { marketId, closed, yesPrice, noPrice, winningOutcome };
  } catch (error) {
    console.warn(
      `[market-resolution] failed to fetch resolution for market ${marketId}: ${(error as Error)?.message ?? String(error)}`,
    );
    return { marketId, closed: false, yesPrice: 0, noPrice: 0 };
  }
}

/**
 * Fetches resolution status for multiple markets.
 * Results are returned as a Map keyed by marketId.
 */
export async function fetchMarketResolutions(
  marketIds: string[],
  options?: FetchMarketResolutionOptions,
): Promise<Map<string, MarketResolution>> {
  const resolutionMap = new Map<string, MarketResolution>();

  // Fetch sequentially to avoid rate limits
  for (const marketId of marketIds) {
    const resolution = await fetchMarketResolution(marketId, options);
    resolutionMap.set(marketId, resolution);
  }

  return resolutionMap;
}

/**
 * Determines the exit price for a paper position when its market has resolved.
 * - If we bought YES and market resolved YES → exit price = 1.0 (full payout)
 * - If we bought YES and market resolved NO → exit price = 0.0 (total loss)
 * - If we bought NO and market resolved NO → exit price = 1.0 (full payout)
 * - If we bought NO and market resolved YES → exit price = 0.0 (total loss)
 */
export function getResolutionExitPrice(
  outcome: PositionOutcome,
  resolution: MarketResolution,
): number | undefined {
  if (!resolution.closed || !resolution.winningOutcome) {
    return undefined;
  }

  if (outcome === resolution.winningOutcome) {
    return 1.0;
  }

  return 0.0;
}
