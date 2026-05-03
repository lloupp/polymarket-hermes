import { describe, expect, it } from 'vitest';
import {
  extractGammaMarketsFromPublicSearch,
  fetchGammaMarkets,
  isGammaMarketArray,
  mergeGammaMarketRecords,
  normalizeGammaMarket,
  type GammaMarketRecord,
  type GammaPublicSearchPayload,
} from '../../src/ingestion/polymarket';

const weatherSearchMarket: GammaMarketRecord = {
  id: '2091487',
  slug: 'highest-temperature-in-london-on-april-29-2026-15c',
  question: 'Will the highest temperature in London be 15°C on April 29?',
  endDate: '2026-04-29T12:00:00Z',
  liquidity: '3200',
  volume24hr: '900',
  tags: [{ slug: 'weather', label: 'Weather' }, { slug: 'temperature', label: 'Temperature' }],
  outcomes: '["Yes","No"]',
  outcomePrices: '["0.21","0.79"]',
  category: 'weather',
};

const closedWeatherSearchMarket: GammaMarketRecord & { closed: boolean; active: boolean } = {
  ...weatherSearchMarket,
  id: '2091488',
  slug: 'highest-temperature-in-london-on-april-29-2026-16c',
  question: 'Will the highest temperature in London be 16°C on April 29?',
  closed: true,
  active: true,
};

const openWeatherSearchMarket: GammaMarketRecord & { closed: boolean; active: boolean } = {
  ...weatherSearchMarket,
  closed: false,
  active: true,
};

const inactiveWeatherSearchMarket: GammaMarketRecord & { closed: boolean; active: boolean } = {
  ...weatherSearchMarket,
  id: '2091489',
  slug: 'highest-temperature-in-london-on-april-29-2026-17c',
  question: 'Will the highest temperature in London be 17°C on April 29?',
  closed: false,
  active: false,
};

const publicSearchPayload = {
  events: [
    {
      markets: [openWeatherSearchMarket, closedWeatherSearchMarket],
    },
    {
      markets: [inactiveWeatherSearchMarket],
    },
  ],
};

const newsMarket: GammaMarketRecord = {
  id: 'n1',
  slug: 'btc-news',
  question: 'Will BTC hit 200k this year?',
  endDate: '2026-12-31T00:00:00Z',
  liquidity: '8000',
  volume24hr: '2500',
  tags: [{ slug: 'crypto', label: 'Crypto' }],
  outcomes: '["Yes","No"]',
  outcomePrices: '["0.18","0.82"]',
  category: 'crypto',
};

describe('isGammaMarketArray', () => {
  it('returns true for an array of gamma-like market objects', () => {
    const input = [{ id: '1', question: 'Q?', slug: 'q', endDate: '2026-05-01T00:00:00Z' }];
    expect(isGammaMarketArray(input)).toBe(true);
  });

  it('returns false for unexpected payloads', () => {
    expect(isGammaMarketArray({ data: [] })).toBe(false);
    expect(isGammaMarketArray(null)).toBe(false);
  });
});

describe('normalizeGammaMarket', () => {
  it('normalizes raw gamma payload into internal market shape', () => {
    const raw: GammaMarketRecord = {
      id: '540816',
      slug: 'will-nyc-get-snow',
      question: 'Will NYC get snow this week?',
      endDate: '2026-01-01T00:00:00Z',
      liquidity: '134893.2047',
      volume24hr: '8123.55',
      tags: [{ slug: 'weather', label: 'Weather' }, { slug: 'snow', label: 'Snow' }],
      outcomes: '["Yes","No"]',
      outcomePrices: '["0.41","0.59"]',
      category: 'weather',
      closed: true,
    };

    expect(normalizeGammaMarket(raw)).toEqual({
      id: '540816',
      slug: 'will-nyc-get-snow',
      question: 'Will NYC get snow this week?',
      category: 'weather',
      yesPrice: 0.41,
      noPrice: 0.59,
      liquidity: 134893.2047,
      volume24h: 8123.55,
      closesAt: '2026-01-01T00:00:00Z',
      tags: ['weather', 'snow'],
      closed: true,
    });
  });

  it('falls back safely when tags or prices are partially missing', () => {
    const raw: GammaMarketRecord = {
      id: '2',
      slug: 'fallback-market',
      question: 'Fallback market?',
      endDate: '2026-02-01T00:00:00Z',
      liquidity: '0',
      volume24hr: '0',
      tags: undefined,
      outcomes: undefined,
      outcomePrices: undefined,
      category: 'unknown',
    };

    expect(normalizeGammaMarket(raw)).toEqual({
      id: '2',
      slug: 'fallback-market',
      question: 'Fallback market?',
      category: 'unknown',
      yesPrice: 0,
      noPrice: 0,
      liquidity: 0,
      volume24h: 0,
      closesAt: '2026-02-01T00:00:00Z',
      tags: [],
    });
  });
});

describe('extractGammaMarketsFromPublicSearch', () => {
  it('flattens active search markets and keeps closed entries for position settlement', () => {
    expect(extractGammaMarketsFromPublicSearch(publicSearchPayload)).toEqual([
      openWeatherSearchMarket,
      closedWeatherSearchMarket,
    ]);
  });

  it('returns empty array for unexpected payloads', () => {
    expect(extractGammaMarketsFromPublicSearch({ data: [] })).toEqual([]);
    expect(extractGammaMarketsFromPublicSearch(null)).toEqual([]);
  });
});

describe('mergeGammaMarketRecords', () => {
  it('deduplicates supplemental weather search hits while preserving primary order', () => {
    expect(mergeGammaMarketRecords([newsMarket], [openWeatherSearchMarket, newsMarket])).toEqual([
      newsMarket,
      openWeatherSearchMarket,
    ]);
  });

  it('respects the requested limit after merge', () => {
    expect(mergeGammaMarketRecords([newsMarket], [openWeatherSearchMarket], 1)).toEqual([newsMarket]);
  });
});

describe('fetchGammaMarkets', () => {
  it('merges primary markets with supplemental public search weather hits', async () => {
    const payload: GammaMarketRecord[] = [newsMarket];
    const publicSearchPayload: GammaPublicSearchPayload = {
      events: [{ markets: [openWeatherSearchMarket] }],
    };

    const markets = await fetchGammaMarkets({
      fetcher: async () => payload,
      publicSearchFetcher: async () => publicSearchPayload,
      searchQueries: ['highest temperature in'],
      limit: 5,
    });

    expect(markets.map((market) => market.id)).toEqual(['2091487', 'n1']);
    expect(markets[0]?.tags).toEqual(['weather', 'temperature']);
    expect(markets[0]?.discoverySource).toBe('public_search');
    expect(markets[0]?.discoveryQuery).toBe('highest temperature in');
    expect(markets[1]?.discoverySource).toBe('base');
  });

  it('deduplicates repeated markets across multiple search queries while preserving first query priority', async () => {
    const payload: GammaMarketRecord[] = [newsMarket];
    const rainMarket: GammaMarketRecord = {
      ...weatherSearchMarket,
      id: '2091490',
      slug: 'rain-in-london-on-april-29-2026',
      question: 'Will it rain in London on April 29?',
      tags: [{ slug: 'weather', label: 'Weather' }, { slug: 'rain', label: 'Rain' }],
    };

    const markets = await fetchGammaMarkets({
      fetcher: async () => payload,
      publicSearchFetcher: async (query) => {
        if (query === 'highest temperature in') {
          return { events: [{ markets: [openWeatherSearchMarket, rainMarket] }] };
        }

        if (query === 'rain in') {
          return { events: [{ markets: [rainMarket, openWeatherSearchMarket] }] };
        }

        return { events: [] };
      },
      searchQueries: ['highest temperature in', 'rain in'],
      limit: 5,
    });

    expect(markets.map((market) => market.id)).toEqual(['2091487', '2091490', 'n1']);
    expect(markets[0]?.discoveryQuery).toBe('highest temperature in');
    expect(markets[1]?.discoveryQuery).toBe('highest temperature in');
    expect(markets[2]?.discoverySource).toBe('base');
  });

  it('prioritizes supplemental weather search hits when the base market list already fills the limit', async () => {
    const payload: GammaMarketRecord[] = [
      newsMarket,
      { ...newsMarket, id: 'n2', slug: 'btc-news-2' },
    ];
    const publicSearchPayload: GammaPublicSearchPayload = {
      events: [{ markets: [openWeatherSearchMarket] }],
    };

    const markets = await fetchGammaMarkets({
      fetcher: async () => payload,
      publicSearchFetcher: async () => publicSearchPayload,
      searchQueries: ['highest temperature in'],
      limit: 2,
    });

    expect(markets.map((market) => market.id)).toEqual(['2091487', 'n1']);
  });

  it('round-robins supplemental query hits before truncation so one query cannot monopolize the limit', async () => {
    const payload: GammaMarketRecord[] = [newsMarket];
    const queryOneMarketA: GammaMarketRecord = {
      ...weatherSearchMarket,
      id: 'q1a',
      slug: 'highest-temperature-in-london-a',
      question: 'Will the highest temperature in London be 15°C on April 29?',
    };
    const queryOneMarketB: GammaMarketRecord = {
      ...weatherSearchMarket,
      id: 'q1b',
      slug: 'highest-temperature-in-london-b',
      question: 'Will the highest temperature in London be 16°C on April 29?',
    };
    const queryTwoMarketA: GammaMarketRecord = {
      ...weatherSearchMarket,
      id: 'q2a',
      slug: 'highest-temperature-in-seoul-a',
      question: 'Will the highest temperature in Seoul be 18°C on April 29?',
    };
    const queryTwoMarketB: GammaMarketRecord = {
      ...weatherSearchMarket,
      id: 'q2b',
      slug: 'highest-temperature-in-seoul-b',
      question: 'Will the highest temperature in Seoul be 19°C on April 29?',
    };

    const markets = await fetchGammaMarkets({
      fetcher: async () => payload,
      publicSearchFetcher: async (query) => {
        if (query === 'highest temperature in') {
          return { events: [{ markets: [queryOneMarketA, queryOneMarketB] }] };
        }

        if (query === 'temperature in seoul') {
          return { events: [{ markets: [queryTwoMarketA, queryTwoMarketB] }] };
        }

        return { events: [] };
      },
      searchQueries: ['highest temperature in', 'temperature in seoul'],
      limit: 3,
    });

    expect(markets.map((market) => market.id)).toEqual(['q1a', 'q2a', 'q1b']);
    expect(markets.map((market) => market.discoveryQuery)).toEqual([
      'highest temperature in',
      'temperature in seoul',
      'highest temperature in',
    ]);
  });

  it('expands generic climate queries into diversified query variants while preserving first-query attribution', async () => {
    const payload: GammaMarketRecord[] = [newsMarket];
    const seoulMarket: GammaMarketRecord = {
      ...weatherSearchMarket,
      id: '2091491',
      slug: 'highest-temperature-in-seoul-on-april-29-2026-18c',
      question: 'Will the highest temperature in Seoul be 18°C on April 29?',
    };

    const queriesSeen: string[] = [];
    const markets = await fetchGammaMarkets({
      fetcher: async () => payload,
      publicSearchFetcher: async (query) => {
        queriesSeen.push(query);

        if (query === 'highest temperature in') {
          return { events: [{ markets: [openWeatherSearchMarket] }] };
        }

        if (query === 'temperature in london') {
          return { events: [{ markets: [openWeatherSearchMarket] }] };
        }

        if (query === 'temperature in seoul') {
          return { events: [{ markets: [seoulMarket] }] };
        }

        return { events: [] };
      },
      searchQueries: ['highest temperature in', 'temperature in london', 'temperature in seoul'],
      limit: 5,
    });

    expect(queriesSeen).toEqual(['highest temperature in', 'temperature in london', 'temperature in seoul']);
    expect(markets.map((market) => market.id)).toEqual(['2091487', '2091491', 'n1']);
    expect(markets[0]?.discoveryQuery).toBe('highest temperature in');
    expect(markets[1]?.discoveryQuery).toBe('temperature in seoul');
  });

  it('fetches and normalizes gamma markets from a provided fetcher', async () => {
    const payload: GammaMarketRecord[] = [
      {
        id: '1',
        slug: 'hurricane-market',
        question: 'Will a hurricane form?',
        endDate: '2026-06-01T00:00:00Z',
        liquidity: '1000',
        volume24hr: '250',
        tags: [{ slug: 'weather', label: 'Weather' }],
        outcomes: '["Yes","No"]',
        outcomePrices: '["0.35","0.65"]',
        category: 'weather',
      },
    ];

    const markets = await fetchGammaMarkets({
      fetcher: async () => payload,
      limit: 5,
    });

    expect(markets).toHaveLength(1);
    expect(markets[0]?.yesPrice).toBe(0.35);
    expect(markets[0]?.tags).toEqual(['weather']);
  });

  it('throws a deterministic error when payload shape is invalid', async () => {
    await expect(
      fetchGammaMarkets({
        fetcher: async () => ({ data: [] }),
        limit: 5,
      }),
    ).rejects.toThrowError('invalid_gamma_markets_payload');
  });
});
