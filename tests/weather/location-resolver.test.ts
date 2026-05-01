import { describe, expect, it } from 'vitest';
import { resolveWeatherLocation } from '../../src/weather/location-resolver';
import type { Market } from '../../src/types/market';

const baseMarket: Market = {
  id: 'm1',
  slug: 'generic-market',
  question: 'Generic market question',
  category: 'weather',
  yesPrice: 0.5,
  noPrice: 0.5,
  liquidity: 1000,
  volume24h: 500,
  closesAt: '2026-05-01T00:00:00Z',
  tags: ['weather'],
};

describe('resolveWeatherLocation', () => {
  it('resolves current highest-temperature market cities from the market question', () => {
    const location = resolveWeatherLocation(
      {
        ...baseMarket,
        id: '2091487',
        slug: 'highest-temperature-in-london-on-april-29-2026-15c',
        question: 'Will the highest temperature in London be 15°C on April 29?',
        tags: ['weather', 'temperature'],
      },
      [],
    );

    expect(location).toEqual({
      marketId: '2091487',
      latitude: 51.5072,
      longitude: -0.1276,
      label: 'London',
    });
  });

  it('prefers explicit market-id mapping over derived city parsing', () => {
    const location = resolveWeatherLocation(
      {
        ...baseMarket,
        id: '2091487',
        slug: 'highest-temperature-in-london-on-april-29-2026-15c',
        question: 'Will the highest temperature in London be 15°C on April 29?',
        tags: ['weather', 'temperature'],
      },
      [{ marketId: '2091487', latitude: 10, longitude: 20, label: 'Manual Override' }],
    );

    expect(location).toEqual({
      marketId: '2091487',
      latitude: 10,
      longitude: 20,
      label: 'Manual Override',
    });
  });

  it('returns undefined for unsupported weather markets without resolvable location', () => {
    expect(
      resolveWeatherLocation(
        {
          ...baseMarket,
          id: 'space-1',
          slug: 'major-space-weather-event-this-week',
          question: 'Will there be exactly 1 major space weather event this week?',
        },
        [],
      ),
    ).toBeUndefined();
  });
});
