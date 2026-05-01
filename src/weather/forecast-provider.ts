import {
  fetchOpenMeteoForecast,
  type FetchOpenMeteoForecastOptions,
  type WeatherForecast,
} from './open-meteo';

export interface FetchWeatherForecastInput extends FetchOpenMeteoForecastOptions {}

export interface WeatherForecastProvider {
  name: string;
  fetchForecast(input: FetchWeatherForecastInput): Promise<WeatherForecast>;
}

export const openMeteoForecastProvider: WeatherForecastProvider = {
  name: 'open-meteo',
  fetchForecast: fetchOpenMeteoForecast,
};
