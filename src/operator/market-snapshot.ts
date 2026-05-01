import { filterWeatherMarkets } from '../markets/weather-filter';
import type { Market } from '../types/market';

export interface MarketSnapshot {
  totalMarkets: number;
  weatherMarketCount: number;
  weatherMarkets: Market[];
}

export function buildMarketSnapshot(markets: Market[]): MarketSnapshot {
  const weatherMarkets = [...filterWeatherMarkets(markets)].sort(
    (left, right) => right.liquidity - left.liquidity,
  );

  return {
    totalMarkets: markets.length,
    weatherMarketCount: weatherMarkets.length,
    weatherMarkets,
  };
}
