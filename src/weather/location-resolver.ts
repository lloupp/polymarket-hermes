import type { WeatherLocationConfig } from '../operator/simple-operator';
import type { Market } from '../types/market';

const CITY_COORDINATES: Record<string, { latitude: number; longitude: number; label: string }> = {
  london: { latitude: 51.5072, longitude: -0.1276, label: 'London' },
  seoul: { latitude: 37.5665, longitude: 126.978, label: 'Seoul' },
  'hong kong': { latitude: 22.3193, longitude: 114.1694, label: 'Hong Kong' },
  beijing: { latitude: 39.9042, longitude: 116.4074, label: 'Beijing' },
  toronto: { latitude: 43.6532, longitude: -79.3832, label: 'Toronto' },
  'new york city': { latitude: 40.7128, longitude: -74.006, label: 'New York City' },
  nyc: { latitude: 40.7128, longitude: -74.006, label: 'New York City' },
  paris: { latitude: 48.8566, longitude: 2.3522, label: 'Paris' },
};

function matchConfiguredLocation(market: Market, weatherLocations: WeatherLocationConfig[]): WeatherLocationConfig | undefined {
  return weatherLocations.find((candidate) => candidate.marketId === market.id);
}

function parseTemperatureCity(question: string): string | undefined {
  const match = question.match(/highest temperature in (.+?) be/i);
  if (!match) {
    return undefined;
  }

  return match[1]?.trim().toLowerCase();
}

export function resolveWeatherLocation(
  market: Market,
  weatherLocations: WeatherLocationConfig[],
): WeatherLocationConfig | undefined {
  const configured = matchConfiguredLocation(market, weatherLocations);
  if (configured) {
    return configured;
  }

  const parsedCity = parseTemperatureCity(market.question);
  if (!parsedCity) {
    return undefined;
  }

  const resolved = CITY_COORDINATES[parsedCity];
  if (!resolved) {
    return undefined;
  }

  return {
    marketId: market.id,
    latitude: resolved.latitude,
    longitude: resolved.longitude,
    label: resolved.label,
  };
}
