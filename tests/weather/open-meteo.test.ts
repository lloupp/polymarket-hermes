import { describe, expect, it } from 'vitest';
import {
  fetchOpenMeteoForecast,
  isOpenMeteoForecastResponse,
  normalizeOpenMeteoForecast,
  type OpenMeteoForecastResponse,
} from '../../src/weather/open-meteo';

describe('isOpenMeteoForecastResponse', () => {
  it('returns true for a valid open-meteo daily payload', () => {
    const payload = {
      latitude: 40.71,
      longitude: -74.01,
      timezone: 'America/New_York',
      daily: {
        time: ['2026-05-01'],
        temperature_2m_max: [21],
        temperature_2m_min: [12],
        precipitation_probability_max: [68],
        precipitation_sum: [9.4],
        wind_speed_10m_max: [28],
      },
    };

    expect(isOpenMeteoForecastResponse(payload)).toBe(true);
  });

  it('returns false for an invalid payload shape', () => {
    expect(isOpenMeteoForecastResponse({ daily: [] })).toBe(false);
    expect(isOpenMeteoForecastResponse(null)).toBe(false);
  });
});

describe('normalizeOpenMeteoForecast', () => {
  it('normalizes the first forecast days into an internal shape', () => {
    const payload: OpenMeteoForecastResponse = {
      latitude: 40.71,
      longitude: -74.01,
      timezone: 'America/New_York',
      daily: {
        time: ['2026-05-01', '2026-05-02'],
        temperature_2m_max: [21, 23],
        temperature_2m_min: [12, 15],
        precipitation_probability_max: [68, 35],
        precipitation_sum: [9.4, 1.2],
        wind_speed_10m_max: [28, 18],
      },
    };

    expect(normalizeOpenMeteoForecast(payload)).toEqual({
      latitude: 40.71,
      longitude: -74.01,
      timezone: 'America/New_York',
      days: [
        {
          date: '2026-05-01',
          temperatureMaxC: 21,
          temperatureMinC: 12,
          precipitationProbabilityMax: 68,
          precipitationSumMm: 9.4,
          windSpeedMaxKmh: 28,
        },
        {
          date: '2026-05-02',
          temperatureMaxC: 23,
          temperatureMinC: 15,
          precipitationProbabilityMax: 35,
          precipitationSumMm: 1.2,
          windSpeedMaxKmh: 18,
        },
      ],
    });
  });
});

describe('fetchOpenMeteoForecast', () => {
  it('fetches and normalizes forecast data using an injected fetcher', async () => {
    const forecast = await fetchOpenMeteoForecast({
      latitude: 25.76,
      longitude: -80.19,
      forecastDays: 2,
      fetcher: async () => ({
        latitude: 25.76,
        longitude: -80.19,
        timezone: 'America/New_York',
        daily: {
          time: ['2026-08-01', '2026-08-02'],
          temperature_2m_max: [31, 30],
          temperature_2m_min: [26, 25],
          precipitation_probability_max: [82, 77],
          precipitation_sum: [18, 12],
          wind_speed_10m_max: [48, 44],
        },
      }),
    });

    expect(forecast.days).toHaveLength(2);
    expect(forecast.days[0]?.windSpeedMaxKmh).toBe(48);
    expect(forecast.timezone).toBe('America/New_York');
  });

  it('throws a deterministic error when the forecast payload is invalid', async () => {
    await expect(
      fetchOpenMeteoForecast({
        latitude: 0,
        longitude: 0,
        forecastDays: 1,
        fetcher: async () => ({ invalid: true }),
      }),
    ).rejects.toThrowError('invalid_open_meteo_payload');
  });

  it('throws a specific rate-limit error when Open-Meteo returns 429 payload', async () => {
    await expect(
      fetchOpenMeteoForecast({
        latitude: 51.5072,
        longitude: -0.1276,
        forecastDays: 2,
        fetcher: async () => ({
          error: true,
          reason: 'Daily API request limit exceeded. Please try again tomorrow.',
        }),
      }),
    ).rejects.toMatchObject({
      message: 'open_meteo_rate_limited',
    });
  });
});
