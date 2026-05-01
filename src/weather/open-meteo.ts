export interface OpenMeteoDailyRecord {
  time: string[];
  temperature_2m_max: number[];
  temperature_2m_min: number[];
  precipitation_probability_max: number[];
  precipitation_sum: number[];
  wind_speed_10m_max: number[];
}

export interface OpenMeteoForecastResponse {
  latitude: number;
  longitude: number;
  timezone: string;
  daily: OpenMeteoDailyRecord;
}

export interface ForecastDay {
  date: string;
  temperatureMaxC: number;
  temperatureMinC: number;
  precipitationProbabilityMax: number;
  precipitationSumMm: number;
  windSpeedMaxKmh: number;
}

export interface WeatherForecast {
  latitude: number;
  longitude: number;
  timezone: string;
  days: ForecastDay[];
}

export interface FetchOpenMeteoForecastOptions {
  latitude: number;
  longitude: number;
  forecastDays: number;
  fetcher?: () => Promise<unknown>;
}

function isOpenMeteoRateLimitPayload(input: unknown): boolean {
  if (typeof input !== 'object' || input === null || !('reason' in input)) {
    return false;
  }

  const reason = (input as { reason?: unknown }).reason;
  return typeof reason === 'string' && reason.toLowerCase().includes('limit exceeded');
}

function isNumberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'number' && Number.isFinite(item));
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

export function isOpenMeteoForecastResponse(input: unknown): input is OpenMeteoForecastResponse {
  if (typeof input !== 'object' || input === null || !('daily' in input)) {
    return false;
  }

  const candidate = input as Record<string, unknown>;
  const daily = candidate.daily;

  if (typeof candidate.latitude !== 'number' || typeof candidate.longitude !== 'number' || typeof candidate.timezone !== 'string') {
    return false;
  }

  if (typeof daily !== 'object' || daily === null) {
    return false;
  }

  const dailyRecord = daily as Record<string, unknown>;

  return (
    isStringArray(dailyRecord.time) &&
    isNumberArray(dailyRecord.temperature_2m_max) &&
    isNumberArray(dailyRecord.temperature_2m_min) &&
    isNumberArray(dailyRecord.precipitation_probability_max) &&
    isNumberArray(dailyRecord.precipitation_sum) &&
    isNumberArray(dailyRecord.wind_speed_10m_max)
  );
}

export function normalizeOpenMeteoForecast(payload: OpenMeteoForecastResponse): WeatherForecast {
  const totalDays = payload.daily.time.length;
  const days: ForecastDay[] = [];

  for (let index = 0; index < totalDays; index += 1) {
    days.push({
      date: payload.daily.time[index] ?? '',
      temperatureMaxC: payload.daily.temperature_2m_max[index] ?? 0,
      temperatureMinC: payload.daily.temperature_2m_min[index] ?? 0,
      precipitationProbabilityMax: payload.daily.precipitation_probability_max[index] ?? 0,
      precipitationSumMm: payload.daily.precipitation_sum[index] ?? 0,
      windSpeedMaxKmh: payload.daily.wind_speed_10m_max[index] ?? 0,
    });
  }

  return {
    latitude: payload.latitude,
    longitude: payload.longitude,
    timezone: payload.timezone,
    days,
  };
}

async function defaultOpenMeteoFetcher(
  latitude: number,
  longitude: number,
  forecastDays: number,
): Promise<unknown> {
  const query = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    forecast_days: String(forecastDays),
    timezone: 'auto',
    daily: [
      'temperature_2m_max',
      'temperature_2m_min',
      'precipitation_probability_max',
      'precipitation_sum',
      'wind_speed_10m_max',
    ].join(','),
  });

  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${query.toString()}`, {
    headers: {
      'User-Agent': 'polymarket-hermes/0.1.0',
    },
  });

  return response.json();
}

export async function fetchOpenMeteoForecast(
  options: FetchOpenMeteoForecastOptions,
): Promise<WeatherForecast> {
  const payload = await (options.fetcher
    ? options.fetcher()
    : defaultOpenMeteoFetcher(options.latitude, options.longitude, options.forecastDays));

  if (isOpenMeteoRateLimitPayload(payload)) {
    throw new Error('open_meteo_rate_limited');
  }

  if (!isOpenMeteoForecastResponse(payload)) {
    throw new Error('invalid_open_meteo_payload');
  }

  return normalizeOpenMeteoForecast(payload);
}
