import { describe, expect, it } from 'vitest';
import {
  buildWeatherMarketDecision,
  calculateWeatherAdjustedScore,
  calculateWeatherPositionSize,
  resolveForecastDayForMarket,
} from '../../src/weather/weather-score';
import type { Market } from '../../src/types/market';
import type { WeatherForecast } from '../../src/weather/open-meteo';

const rainMarket: Market = {
  id: 'w-rain',
  slug: 'nyc-rain',
  question: 'Will it rain in NYC tomorrow?',
  category: 'weather',
  yesPrice: 0.42,
  noPrice: 0.58,
  liquidity: 15000,
  volume24h: 4000,
  closesAt: '2026-05-02T00:00:00Z',
  tags: ['weather', 'rain'],
};

const heatMarket: Market = {
  ...rainMarket,
  id: 'w-heat',
  slug: 'texas-heat',
  question: 'Will Texas hit 40C this week?',
  yesPrice: 0.33,
  noPrice: 0.67,
  tags: ['weather', 'heat'],
};

const wetForecast: WeatherForecast = {
  latitude: 40.71,
  longitude: -74.01,
  timezone: 'America/New_York',
  days: [
    {
      date: '2026-05-01',
      temperatureMaxC: 22,
      temperatureMinC: 15,
      precipitationProbabilityMax: 78,
      precipitationSumMm: 12,
      windSpeedMaxKmh: 25,
    },
  ],
};

const hotForecast: WeatherForecast = {
  latitude: 31.76,
  longitude: -106.48,
  timezone: 'America/Chicago',
  days: [
    {
      date: '2026-07-01',
      temperatureMaxC: 42,
      temperatureMinC: 29,
      precipitationProbabilityMax: 12,
      precipitationSumMm: 0,
      windSpeedMaxKmh: 14,
    },
  ],
};

describe('calculateWeatherAdjustedScore', () => {
  it('derives higher adjusted score for rain markets with strong precipitation forecast', () => {
    expect(calculateWeatherAdjustedScore(rainMarket, wetForecast)).toBeCloseTo(0.78, 8);
  });

  it('derives higher adjusted score for heat markets with very high max temperature', () => {
    expect(calculateWeatherAdjustedScore(heatMarket, hotForecast)).toBeCloseTo(0.84, 8);
  });

  it('selects the forecast day that matches the market date for temperature markets', () => {
    const market = {
      ...rainMarket,
      id: 'w-temp-date-match',
      slug: 'highest-temperature-in-london-on-may-2-2026-18c',
      question: 'Will the highest temperature in London be 18°C on May 2?',
      yesPrice: 0.2,
      noPrice: 0.8,
      tags: ['weather', 'temperature'],
    } satisfies Market;

    const forecast: WeatherForecast = {
      ...wetForecast,
      timezone: 'Europe/London',
      days: [
        {
          date: '2026-05-01',
          temperatureMaxC: 12,
          temperatureMinC: 8,
          precipitationProbabilityMax: 20,
          precipitationSumMm: 0,
          windSpeedMaxKmh: 18,
        },
        {
          date: '2026-05-02',
          temperatureMaxC: 18,
          temperatureMinC: 10,
          precipitationProbabilityMax: 15,
          precipitationSumMm: 0,
          windSpeedMaxKmh: 16,
        },
      ],
    };

    const resolved = resolveForecastDayForMarket(market, forecast);

    expect(resolved.strategy).toBe('market_date');
    expect(resolved.forecastDay?.date).toBe('2026-05-02');
    expect(calculateWeatherAdjustedScore(market, forecast)).toBeCloseTo(1, 8);
  });

  it('falls back to the first forecast day when the market date is unavailable', () => {
    const market = {
      ...rainMarket,
      id: 'w-temp-fallback',
      slug: 'highest-temperature-in-london-on-may-3-2026-18c',
      question: 'Will the highest temperature in London be 18°C on May 3?',
      yesPrice: 0.2,
      noPrice: 0.8,
      tags: ['weather', 'temperature'],
    } satisfies Market;

    const forecast: WeatherForecast = {
      ...wetForecast,
      timezone: 'Europe/London',
      days: [
        {
          date: '2026-05-01',
          temperatureMaxC: 18,
          temperatureMinC: 10,
          precipitationProbabilityMax: 20,
          precipitationSumMm: 0,
          windSpeedMaxKmh: 18,
        },
        {
          date: '2026-05-02',
          temperatureMaxC: 13,
          temperatureMinC: 9,
          precipitationProbabilityMax: 15,
          precipitationSumMm: 0,
          windSpeedMaxKmh: 16,
        },
      ],
    };

    const resolved = resolveForecastDayForMarket(market, forecast);

    expect(resolved.strategy).toBe('first_day');
    expect(resolved.forecastDay?.date).toBe('2026-05-01');
  });

  it('derives score for temperature markets from proximity to target temperature in the question', () => {
    expect(
      calculateWeatherAdjustedScore(
        {
          ...rainMarket,
          id: 'w-temp',
          slug: 'highest-temperature-in-london-on-april-29-2026-15c',
          question: 'Will the highest temperature in London be 15°C on April 29?',
          yesPrice: 0.21,
          noPrice: 0.79,
          tags: ['weather', 'temperature'],
        },
        {
          ...wetForecast,
          timezone: 'Europe/London',
          days: [
            {
              date: '2026-04-29',
              temperatureMaxC: 15,
              temperatureMinC: 8,
              precipitationProbabilityMax: 20,
              precipitationSumMm: 0,
              windSpeedMaxKmh: 18,
            },
          ],
        },
      ),
    ).toBeCloseTo(1, 8);
  });

  it('derives score for temperature markets discovered from question text even when tags are missing', () => {
    expect(
      calculateWeatherAdjustedScore(
        {
          ...rainMarket,
          id: 'w-temp-search',
          slug: 'highest-temperature-in-hong-kong-on-april-29-2026-27c',
          question: 'Will the highest temperature in Hong Kong be 27°C on April 29?',
          yesPrice: 0.002,
          noPrice: 0.998,
          tags: [],
        },
        {
          ...wetForecast,
          timezone: 'Asia/Hong_Kong',
          days: [
            {
              date: '2026-04-29',
              temperatureMaxC: 27.6,
              temperatureMinC: 18.6,
              precipitationProbabilityMax: 100,
              precipitationSumMm: 10.1,
              windSpeedMaxKmh: 18.8,
            },
          ],
        },
      ),
    ).toBeCloseTo(0.94, 8);
  });

  it('derives score for temperature markets with or higher wording from question text', () => {
    expect(
      calculateWeatherAdjustedScore(
        {
          ...rainMarket,
          id: 'w-temp-higher',
          slug: 'highest-temperature-in-hong-kong-on-april-29-2026-27corhigher',
          question: 'Will the highest temperature in Hong Kong be 27°C or higher on April 29?',
          yesPrice: 0.11,
          noPrice: 0.89,
          tags: [],
        },
        {
          ...wetForecast,
          timezone: 'Asia/Hong_Kong',
          days: [
            {
              date: '2026-04-29',
              temperatureMaxC: 27.6,
              temperatureMinC: 18.6,
              precipitationProbabilityMax: 100,
              precipitationSumMm: 10.1,
              windSpeedMaxKmh: 18.8,
            },
          ],
        },
      ),
    ).toBeCloseTo(1, 8);
  });

  it('falls back to neutral score when forecast is unavailable or tag is unsupported', () => {
    expect(calculateWeatherAdjustedScore({ ...rainMarket, tags: ['weather', 'fog'] }, wetForecast)).toBeCloseTo(0.5, 8);
    expect(calculateWeatherAdjustedScore(rainMarket, { ...wetForecast, days: [] })).toBeCloseTo(0.5, 8);
  });
});

describe('calculateWeatherPositionSize', () => {
  it('returns deterministic positive size from positive edge and kelly fraction', () => {
    expect(calculateWeatherPositionSize({ edge: 0.36, kellyFraction: 0.5 })).toBeCloseTo(0.18, 8);
  });

  it('returns zero when edge is not positive', () => {
    expect(calculateWeatherPositionSize({ edge: 0, kellyFraction: 0.5 })).toBe(0);
    expect(calculateWeatherPositionSize({ edge: -0.1, kellyFraction: 0.5 })).toBe(0);
  });
});

describe('buildWeatherMarketDecision', () => {
  it('builds an auditable BUY_YES decision with adjusted score, edge and size', () => {
    const decision = buildWeatherMarketDecision({
      market: rainMarket,
      forecast: wetForecast,
      minEdge: 0.03,
      kellyFraction: 0.5,
    });

    expect(decision).toEqual({
      marketId: 'w-rain',
      signal: 'BUY_YES',
      adjustedScore: 0.78,
      edge: 0.36,
      positionSize: 0.18,
      reason: 'weather_score rain forecast_prob=78',
    });
  });

  it('builds a HOLD decision with zero size when edge is inside neutral band', () => {
    const decision = buildWeatherMarketDecision({
      market: { ...rainMarket, yesPrice: 0.77 },
      forecast: wetForecast,
      minEdge: 0.03,
      kellyFraction: 0.5,
    });

    expect(decision.signal).toBe('HOLD');
    expect(decision.positionSize).toBe(0);
  });
});
