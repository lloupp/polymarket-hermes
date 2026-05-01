import { describe, expect, it } from 'vitest';
import { filterWeatherMarkets, isWeatherMarket } from '../../src/markets/weather-filter';
import type { Market } from '../../src/types/market';

const baseMarket: Market = {
  id: 'm1',
  slug: 'generic-market',
  question: 'Generic market question',
  category: 'news',
  yesPrice: 0.5,
  noPrice: 0.5,
  liquidity: 1000,
  volume24h: 500,
  closesAt: '2026-05-01T00:00:00Z',
  tags: [],
};

describe('weather-filter', () => {
  it('detects weather markets by category keyword', () => {
    expect(
      isWeatherMarket({
        ...baseMarket,
        category: 'weather',
      }),
    ).toBe(true);
  });

  it('detects weather markets by tag keyword', () => {
    expect(
      isWeatherMarket({
        ...baseMarket,
        tags: ['sports', 'rain'],
      }),
    ).toBe(true);
  });

  it('detects weather markets by question keyword', () => {
    expect(
      isWeatherMarket({
        ...baseMarket,
        question: 'Will it snow in Chicago this weekend?',
      }),
    ).toBe(true);
  });

  it('ignores non-weather markets with no weather keyword', () => {
    expect(
      isWeatherMarket({
        ...baseMarket,
        question: 'Will BTC hit 200k this year?',
        category: 'crypto',
        tags: ['bitcoin'],
      }),
    ).toBe(false);
  });

  it('filters only weather markets from a mixed list', () => {
    const result = filterWeatherMarkets([
      {
        ...baseMarket,
        id: 'weather-1',
        question: 'Will it rain in Miami tomorrow?',
      },
      {
        ...baseMarket,
        id: 'crypto-1',
        question: 'Will BTC hit 200k this year?',
        category: 'crypto',
      },
    ]);

    expect(result.map((market) => market.id)).toEqual(['weather-1']);
  });

  it('does not classify Carolina Hurricanes sports market as weather', () => {
    expect(
      isWeatherMarket({
        ...baseMarket,
        id: 'sports-1',
        slug: 'carolina-hurricanes-cup',
        question: 'Will the Carolina Hurricanes win the 2026 NHL Stanley Cup?',
        category: 'sports',
      }),
    ).toBe(false);
  });

  it('does not classify ceasefire market as weather just because ukraine contains rain', () => {
    expect(
      isWeatherMarket({
        ...baseMarket,
        id: 'news-1',
        slug: 'russia-ukraine-ceasefire',
        question: 'Russia-Ukraine Ceasefire before GTA VI?',
        category: 'news',
      }),
    ).toBe(false);
  });
});
