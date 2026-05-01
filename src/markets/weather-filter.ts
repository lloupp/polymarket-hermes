import type { Market } from '../types/market';

const WEATHER_KEYWORDS = [
  'weather',
  'climate',
  'rain',
  'snow',
  'storm',
  'hurricane',
  'temperature',
  'heat',
  'cold',
  'wind',
  'forecast',
];

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

function containsWeatherKeyword(value: string): boolean {
  const tokens = tokenize(value);
  return WEATHER_KEYWORDS.some((keyword) => tokens.includes(keyword));
}

export function isWeatherMarket(market: Market): boolean {
  if (containsWeatherKeyword(market.category)) {
    return true;
  }

  if (market.tags.some((tag) => containsWeatherKeyword(tag))) {
    return true;
  }

  return containsWeatherKeyword(market.question);
}

export function filterWeatherMarkets(markets: Market[]): Market[] {
  return markets.filter(isWeatherMarket);
}
