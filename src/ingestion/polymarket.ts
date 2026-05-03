import type { Market, MarketDiscoverySource } from '../types/market';

export interface GammaMarketTagRecord {
  slug?: string;
  label?: string;
}

export interface GammaMarketRecord {
  id: string;
  slug: string;
  question: string;
  endDate: string;
  liquidity?: string;
  volume24hr?: string;
  tags?: GammaMarketTagRecord[];
  outcomes?: string;
  outcomePrices?: string;
  category?: string;
  closed?: boolean;
}

export interface GammaSearchMarketRecord extends GammaMarketRecord {
  active?: boolean;
  closed?: boolean;
}

export interface GammaPublicSearchEventRecord {
  markets?: GammaSearchMarketRecord[];
}

export interface GammaPublicSearchPayload {
  events?: GammaPublicSearchEventRecord[];
}

export interface FetchGammaMarketsOptions {
  limit: number;
  fetcher?: () => Promise<unknown>;
  publicSearchFetcher?: (query: string) => Promise<unknown>;
  searchQueries?: string[];
}

interface GammaMarketDiscoveryMetadata {
  source: MarketDiscoverySource;
  query?: string;
}

interface GammaMarketRecordWithDiscovery extends GammaMarketRecord {
  discoverySource?: MarketDiscoverySource;
  discoveryQuery?: string;
}

function interleaveSupplementalRecords(
  recordsByQuery: GammaMarketRecordWithDiscovery[][],
): GammaMarketRecordWithDiscovery[] {
  const merged: GammaMarketRecordWithDiscovery[] = [];
  const reservedByEarlierQuery = new Set<string>();

  const normalizedBuckets = recordsByQuery.map((records) => {
    const bucket: GammaMarketRecordWithDiscovery[] = [];

    for (const market of records) {
      if (reservedByEarlierQuery.has(market.id)) {
        continue;
      }

      reservedByEarlierQuery.add(market.id);
      bucket.push(market);
    }

    return bucket;
  });

  let addedInPass = true;
  while (addedInPass) {
    addedInPass = false;

    for (const records of normalizedBuckets) {
      const market = records.shift();
      if (!market) {
        continue;
      }

      merged.push(market);
      addedInPass = true;
    }
  }

  return merged;
}

function attachDiscoveryMetadata(
  market: GammaMarketRecord,
  metadata: GammaMarketDiscoveryMetadata,
): GammaMarketRecordWithDiscovery {
  return {
    ...market,
    discoverySource: metadata.source,
    discoveryQuery: metadata.query,
  };
}

function parseNumber(value: string | undefined): number {
  if (!value) {
    return 0;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
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

function parseTags(tags: GammaMarketTagRecord[] | undefined): string[] {
  if (!tags) {
    return [];
  }

  return tags
    .map((tag) => tag.slug?.trim() || tag.label?.trim() || '')
    .filter((tag) => tag.length > 0)
    .map((tag) => tag.toLowerCase());
}

export function isGammaMarketArray(input: unknown): input is GammaMarketRecord[] {
  return Array.isArray(input) && input.every((item) => typeof item === 'object' && item !== null && 'id' in item && 'question' in item && 'slug' in item);
}

export function normalizeGammaMarket(raw: GammaMarketRecordWithDiscovery): Market {
  const prices = parsePriceArray(raw.outcomePrices);

  return {
    id: raw.id,
    slug: raw.slug,
    question: raw.question,
    category: raw.category ?? 'unknown',
    yesPrice: prices[0] ?? 0,
    noPrice: prices[1] ?? 0,
    liquidity: parseNumber(raw.liquidity),
    volume24h: parseNumber(raw.volume24hr),
    closesAt: raw.endDate,
    tags: parseTags(raw.tags),
    discoverySource: raw.discoverySource,
    discoveryQuery: raw.discoveryQuery,
    closed: raw.closed,
  };
}

export function extractGammaMarketsFromPublicSearch(payload: unknown): GammaSearchMarketRecord[] {
  if (typeof payload !== 'object' || payload === null || !('events' in payload) || !Array.isArray((payload as GammaPublicSearchPayload).events)) {
    return [];
  }

  return ((payload as GammaPublicSearchPayload).events ?? [])
    .flatMap((event) => event.markets ?? [])
    .filter((market) => market.active !== false);
}

export function mergeGammaMarketRecords(
  primary: GammaMarketRecord[],
  supplemental: GammaMarketRecord[],
  limit?: number,
): GammaMarketRecord[] {
  const merged: GammaMarketRecord[] = [];
  const seen = new Set<string>();

  for (const market of [...primary, ...supplemental]) {
    if (seen.has(market.id)) {
      continue;
    }

    seen.add(market.id);
    merged.push(market);

    if (limit !== undefined && merged.length >= limit) {
      return merged;
    }
  }

  return merged;
}

async function defaultGammaFetcher(limit: number): Promise<unknown> {
  const response = await fetch(`https://gamma-api.polymarket.com/markets?limit=${limit}`, {
    headers: {
      'User-Agent': 'polymarket-hermes/0.1.0',
    },
  });

  return response.json();
}

async function defaultGammaPublicSearchFetcher(query: string): Promise<unknown> {
  const encodedQuery = encodeURIComponent(query);
  const response = await fetch(`https://gamma-api.polymarket.com/public-search?q=${encodedQuery}`, {
    headers: {
      'User-Agent': 'polymarket-hermes/0.1.0',
    },
  });

  return response.json();
}

export async function fetchGammaMarkets({
  limit,
  fetcher,
  publicSearchFetcher,
  searchQueries,
}: FetchGammaMarketsOptions): Promise<Market[]> {
  const payload = await (fetcher ? fetcher() : defaultGammaFetcher(limit));

  if (!isGammaMarketArray(payload)) {
    throw new Error('invalid_gamma_markets_payload');
  }

  const baseRecords = payload.map((market) => attachDiscoveryMetadata(market, { source: 'base' }));
  const supplementalRecordsByQuery: GammaMarketRecordWithDiscovery[][] = [];

  for (const query of searchQueries ?? []) {
    const searchPayload = await (publicSearchFetcher
      ? publicSearchFetcher(query)
      : defaultGammaPublicSearchFetcher(query));

    supplementalRecordsByQuery.push(
      extractGammaMarketsFromPublicSearch(searchPayload).map((market) =>
        attachDiscoveryMetadata(market, { source: 'public_search', query }),
      ),
    );
  }

  const supplementalRecords = interleaveSupplementalRecords(supplementalRecordsByQuery);
  return mergeGammaMarketRecords(supplementalRecords, baseRecords, limit).map(normalizeGammaMarket);
}
