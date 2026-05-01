import { calculateEdge, decideSignal } from '../scoring/edge';
import type { Market, MarketDecision } from '../types/market';
import type { ForecastDay, WeatherForecast } from './open-meteo';

export interface CalculateWeatherPositionSizeInput {
  edge: number;
  kellyFraction: number;
}

export interface BuildWeatherMarketDecisionInput {
  market: Market;
  forecast: WeatherForecast;
  forecastDay?: ForecastDay;
  minEdge: number;
  kellyFraction: number;
}

export interface WeatherMarketDecision extends MarketDecision {
  positionSize: number;
}

export type ForecastDaySelectionStrategy = 'first_day' | 'market_date';

function clampProbability(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function roundToTwoDecimals(value: number): number {
  return Number(value.toFixed(2));
}

function getPrimaryForecastDay(forecast: WeatherForecast) {
  return forecast.days[0];
}

function parseForecastDayDate(day: ForecastDay): { month: number; day: number } | undefined {
  const match = day.date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return undefined;
  }

  return {
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

function extractQuestionMonthDay(question: string): { month: number; day: number } | undefined {
  const match = question.match(/\bon\s+([a-z]+)\s+(\d{1,2})\b/i);
  if (!match) {
    return undefined;
  }

  const months = new Map<string, number>([
    ['january', 1],
    ['february', 2],
    ['march', 3],
    ['april', 4],
    ['may', 5],
    ['june', 6],
    ['july', 7],
    ['august', 8],
    ['september', 9],
    ['october', 10],
    ['november', 11],
    ['december', 12],
  ]);

  const month = months.get(match[1].toLowerCase());
  const day = Number(match[2]);
  if (!month || !Number.isFinite(day)) {
    return undefined;
  }

  return { month, day };
}

function extractTargetTemperatureC(question: string): number | undefined {
  const match = question.match(/be\s+(\d+)°?c(?:\s+or\s+(?:below|higher))?\b/i);
  if (!match) {
    return undefined;
  }

  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function isTemperatureOrHigherMarket(question: string): boolean {
  return /be\s+\d+°?c\s+or\s+higher\b/i.test(question);
}

function isTemperatureOrBelowMarket(question: string): boolean {
  return /be\s+\d+°?c\s+or\s+below\b/i.test(question);
}

function isTemperatureMarket(market: Market): boolean {
  if (market.tags.includes('temperature')) {
    return true;
  }

  return /highest temperature in .+ be\s+\d+°?c(?:\s+or\s+(?:below|higher))?/i.test(market.question);
}

function calculateTemperatureMarketScore(question: string, forecastMaxC: number, targetTemperatureC: number): number {
  if (isTemperatureOrHigherMarket(question)) {
    if (forecastMaxC >= targetTemperatureC) {
      return 1;
    }

    return clampProbability(1 - (targetTemperatureC - forecastMaxC) / 10);
  }

  if (isTemperatureOrBelowMarket(question)) {
    if (forecastMaxC <= targetTemperatureC) {
      return 1;
    }

    return clampProbability(1 - (forecastMaxC - targetTemperatureC) / 10);
  }

  const difference = Math.abs(forecastMaxC - targetTemperatureC);
  return clampProbability(1 - difference / 10);
}

function marketReason(market: Market, precipitationProbabilityMax: number, temperatureMaxC: number): string {
  if (market.tags.includes('rain')) {
    return `weather_score rain forecast_prob=${precipitationProbabilityMax}`;
  }

  if (market.tags.includes('heat')) {
    return `weather_score heat temp_max_c=${temperatureMaxC}`;
  }

  if (isTemperatureMarket(market)) {
    return `weather_score temperature temp_max_c=${temperatureMaxC}`;
  }

  return 'weather_score neutral';
}

export function resolveForecastDayForMarket(
  market: Market,
  forecast: WeatherForecast,
): { forecastDay?: ForecastDay; strategy: ForecastDaySelectionStrategy } {
  const firstDay = getPrimaryForecastDay(forecast);
  if (!firstDay) {
    return { forecastDay: undefined, strategy: 'first_day' };
  }

  if (!isTemperatureMarket(market)) {
    return { forecastDay: firstDay, strategy: 'first_day' };
  }

  const targetMonthDay = extractQuestionMonthDay(market.question);
  if (!targetMonthDay) {
    return { forecastDay: firstDay, strategy: 'first_day' };
  }

  const matchingDay = forecast.days.find((day) => {
    const parsedDate = parseForecastDayDate(day);
    return parsedDate?.month === targetMonthDay.month && parsedDate.day === targetMonthDay.day;
  });

  if (!matchingDay) {
    return { forecastDay: firstDay, strategy: 'first_day' };
  }

  return { forecastDay: matchingDay, strategy: 'market_date' };
}

export function calculateWeatherAdjustedScore(
  market: Market,
  forecast: WeatherForecast,
  forecastDay?: ForecastDay,
): number {
  const selectedDay = forecastDay ?? resolveForecastDayForMarket(market, forecast).forecastDay;

  if (!selectedDay) {
    return 0.5;
  }

  if (market.tags.includes('rain')) {
    return clampProbability(selectedDay.precipitationProbabilityMax / 100);
  }

  if (market.tags.includes('heat')) {
    return clampProbability(selectedDay.temperatureMaxC / 50);
  }

  if (isTemperatureMarket(market)) {
    const targetTemperatureC = extractTargetTemperatureC(market.question);
    if (targetTemperatureC === undefined) {
      return 0.5;
    }

    return calculateTemperatureMarketScore(market.question, selectedDay.temperatureMaxC, targetTemperatureC);
  }

  return 0.5;
}

export function calculateWeatherPositionSize(input: CalculateWeatherPositionSizeInput): number {
  if (input.edge <= 0) {
    return 0;
  }

  return Number((input.edge * input.kellyFraction).toFixed(8));
}

export function buildWeatherMarketDecision(
  input: BuildWeatherMarketDecisionInput,
): WeatherMarketDecision {
  const selectedDay = input.forecastDay ?? resolveForecastDayForMarket(input.market, input.forecast).forecastDay;
  const adjustedScore = roundToTwoDecimals(calculateWeatherAdjustedScore(input.market, input.forecast, selectedDay));
  const edge = roundToTwoDecimals(calculateEdge(adjustedScore, input.market.yesPrice));
  const signal = decideSignal({ edge, minEdge: input.minEdge });
  const positionSize = signal === 'BUY_YES'
    ? roundToTwoDecimals(calculateWeatherPositionSize({ edge, kellyFraction: input.kellyFraction }))
    : 0;

  const reason = marketReason(
    input.market,
    selectedDay?.precipitationProbabilityMax ?? 0,
    selectedDay?.temperatureMaxC ?? 0,
  );

  return {
    marketId: input.market.id,
    signal,
    adjustedScore,
    edge,
    positionSize,
    reason,
  };
}

export { isTemperatureMarket };

