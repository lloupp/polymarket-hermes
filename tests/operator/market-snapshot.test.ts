import { describe, expect, it } from 'vitest';
import { buildMarketSnapshot } from '../../src/operator/market-snapshot';
import type { Market } from '../../src/types/market';

const markets: Market[] = [
  {
    id: 'w1',
    slug: 'nyc-snow',
    question: 'Will NYC get snow this week?',
    category: 'weather',
    yesPrice: 0.41,
    noPrice: 0.59,
    liquidity: 15000,
    volume24h: 4000,
    closesAt: '2026-05-01T00:00:00Z',
    tags: ['weather', 'snow'],
  },
  {
    id: 'n1',
    slug: 'btc-200k',
    question: 'Will BTC hit 200k this year?',
    category: 'crypto',
    yesPrice: 0.2,
    noPrice: 0.8,
    liquidity: 90000,
    volume24h: 30000,
    closesAt: '2026-12-31T00:00:00Z',
    tags: ['crypto'],
  },
];

describe('buildMarketSnapshot', () => {
  it('summarizes total and weather-filtered markets', () => {
    const snapshot = buildMarketSnapshot(markets);

    expect(snapshot.totalMarkets).toBe(2);
    expect(snapshot.weatherMarkets).toHaveLength(1);
    expect(snapshot.weatherMarkets[0]?.id).toBe('w1');
    expect(snapshot.weatherMarketCount).toBe(1);
  });

  it('sorts weather markets by liquidity descending', () => {
    const moreMarkets: Market[] = [
      ...markets,
      {
        id: 'w2',
        slug: 'miami-hurricane',
        question: 'Will a hurricane hit Miami?',
        category: 'weather',
        yesPrice: 0.3,
        noPrice: 0.7,
        liquidity: 25000,
        volume24h: 7000,
        closesAt: '2026-08-01T00:00:00Z',
        tags: ['weather', 'hurricane'],
      },
    ];

    const snapshot = buildMarketSnapshot(moreMarkets);

    expect(snapshot.weatherMarkets.map((market) => market.id)).toEqual(['w2', 'w1']);
  });
});
