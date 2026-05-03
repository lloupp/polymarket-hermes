import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { writeOperatorHistory } from '../../src/history/operator-history';
import { runSimpleWeatherOperator } from '../../src/operator/simple-operator';
import type { GammaMarketRecord } from '../../src/ingestion/polymarket';

describe('runSimpleWeatherOperator', () => {
  it('closes seeded open position by take-profit target', async () => {
    const gammaPayload: GammaMarketRecord[] = [
      {
        id: 'w1',
        slug: 'nyc-rain',
        question: 'Will it rain in NYC tomorrow?',
        endDate: '2026-05-02T00:00:00Z',
        liquidity: '15000',
        volume24hr: '4000',
        tags: [{ slug: 'weather', label: 'Weather' }, { slug: 'rain', label: 'Rain' }],
        outcomes: '["Yes","No"]',
        outcomePrices: '["0.55","0.45"]',
        category: 'weather',
      },
    ];

    const result = await runSimpleWeatherOperator({
      startingCapital: 1000,
      marketLimit: 10,
      forecastDays: 2,
      minEdge: 0.03,
      kellyFraction: 0.5,
      maxPositionUsd: 100,
      takeProfitPct: 0.2,
      maxHoldingHours: 24,
      nowIso: '2026-05-01T12:00:00Z',
      seedPositions: [
        {
          marketId: 'w1',
          outcome: 'YES',
          entryPrice: 0.4,
          shares: 10,
          openedAt: '2026-05-01T06:00:00Z',
        },
      ],
      weatherLocations: [
        { marketId: 'w1', latitude: 40.71, longitude: -74.01, label: 'New York City' },
      ],
      gammaFetcher: async () => gammaPayload,
      weatherFetcher: async () => ({
        latitude: 40.71,
        longitude: -74.01,
        timezone: 'America/New_York',
        daily: {
          time: ['2026-05-01', '2026-05-02'],
          temperature_2m_max: [22, 19],
          temperature_2m_min: [15, 13],
          precipitation_probability_max: [78, 66],
          precipitation_sum: [12, 6],
          wind_speed_10m_max: [25, 19],
        },
      }),
    });

    expect(result.closedPositions).toHaveLength(1);
    expect(result.closedPositions[0]?.realizedPnl).toBeCloseTo(1.5, 8);
    expect(result.closedPositions[0]?.status).toBe('CLOSED');
    expect(result.closedPositions[0]?.exitReason).toBe('take_profit');
    expect(result.outputLines).toContain('positions_closed=1');
  });

  it('closes seeded open position by timeout', async () => {
    const gammaPayload: GammaMarketRecord[] = [
      {
        id: 'w1',
        slug: 'nyc-rain',
        question: 'Will it rain in NYC tomorrow?',
        endDate: '2026-05-02T00:00:00Z',
        liquidity: '15000',
        volume24hr: '4000',
        tags: [{ slug: 'weather', label: 'Weather' }, { slug: 'rain', label: 'Rain' }],
        outcomes: '["Yes","No"]',
        outcomePrices: '["0.39","0.61"]',
        category: 'weather',
      },
    ];

    const result = await runSimpleWeatherOperator({
      startingCapital: 1000,
      marketLimit: 10,
      forecastDays: 2,
      minEdge: 0.03,
      kellyFraction: 0.5,
      maxPositionUsd: 100,
      takeProfitPct: 0.3,
      maxHoldingHours: 4,
      nowIso: '2026-05-01T12:00:00Z',
      seedPositions: [
        {
          marketId: 'w1',
          outcome: 'YES',
          entryPrice: 0.4,
          shares: 10,
          openedAt: '2026-05-01T06:00:00Z',
        },
      ],
      weatherLocations: [
        { marketId: 'w1', latitude: 40.71, longitude: -74.01, label: 'New York City' },
      ],
      gammaFetcher: async () => gammaPayload,
      weatherFetcher: async () => ({
        latitude: 40.71,
        longitude: -74.01,
        timezone: 'America/New_York',
        daily: {
          time: ['2026-05-01', '2026-05-02'],
          temperature_2m_max: [22, 19],
          temperature_2m_min: [15, 13],
          precipitation_probability_max: [78, 66],
          precipitation_sum: [12, 6],
          wind_speed_10m_max: [25, 19],
        },
      }),
    });

    expect(result.closedPositions).toHaveLength(1);
    expect(result.closedPositions[0]?.exitReason).toBe('timeout');
    expect(result.outputLines).toContain('positions_closed=1');
  });

  it('runs the simple operator cycle and returns weather snapshot plus dashboard model', async () => {
    const gammaPayload: GammaMarketRecord[] = [
      {
        id: 'w1',
        slug: 'nyc-rain',
        question: 'Will it rain in NYC tomorrow?',
        endDate: '2026-05-02T00:00:00Z',
        liquidity: '15000',
        volume24hr: '4000',
        tags: [{ slug: 'weather', label: 'Weather' }, { slug: 'rain', label: 'Rain' }],
        outcomes: '["Yes","No"]',
        outcomePrices: '["0.42","0.58"]',
        category: 'weather',
      },
      {
        id: 'c1',
        slug: 'btc-200k',
        question: 'Will BTC hit 200k this year?',
        endDate: '2026-12-31T00:00:00Z',
        liquidity: '98000',
        volume24hr: '22000',
        tags: [{ slug: 'crypto', label: 'Crypto' }],
        outcomes: '["Yes","No"]',
        outcomePrices: '["0.18","0.82"]',
        category: 'crypto',
      },
    ];

    const result = await runSimpleWeatherOperator({
      startingCapital: 1000,
      marketLimit: 10,
      forecastDays: 2,
      minEdge: 0.03,
      kellyFraction: 0.5,
      maxPositionUsd: 100,
      weatherLocations: [
        {
          marketId: 'w1',
          latitude: 40.71,
          longitude: -74.01,
          label: 'New York City',
        },
      ],
      gammaFetcher: async () => gammaPayload,
      weatherFetcher: async () => ({
        latitude: 40.71,
        longitude: -74.01,
        timezone: 'America/New_York',
        daily: {
          time: ['2026-05-01', '2026-05-02'],
          temperature_2m_max: [22, 19],
          temperature_2m_min: [15, 13],
          precipitation_probability_max: [78, 66],
          precipitation_sum: [12, 6],
          wind_speed_10m_max: [25, 19],
        },
      }),
    });

    expect(result.snapshot.totalMarkets).toBe(2);
    expect(result.snapshot.weatherMarketCount).toBe(1);
    expect(result.weatherEnrichment[0]).toEqual({
      marketId: 'w1',
      locationLabel: 'New York City',
      providerName: 'open-meteo',
      forecastDay: {
        date: '2026-05-01',
        temperatureMaxC: 22,
        temperatureMinC: 15,
        precipitationProbabilityMax: 78,
        precipitationSumMm: 12,
        windSpeedMaxKmh: 25,
      },
      forecastDayStrategy: 'first_day',
      forecastSource: 'live',
      forecast: {
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
          {
            date: '2026-05-02',
            temperatureMaxC: 19,
            temperatureMinC: 13,
            precipitationProbabilityMax: 66,
            precipitationSumMm: 6,
            windSpeedMaxKmh: 19,
          },
        ],
      },
    });
    expect(result.decisions).toEqual([
      {
        marketId: 'w1',
        signal: 'BUY_YES',
        adjustedScore: 0.78,
        edge: 0.36,
        positionSize: 0.18,
        reason: 'weather_score rain forecast_prob=78',
      },
    ]);
    expect(result.executedPositions).toHaveLength(1);
    expect(result.executedPositions[0]?.marketId).toBe('w1');
    expect(result.executedPositions[0]?.outcome).toBe('YES');
    expect(result.executedPositions[0]?.entryPrice).toBeCloseTo(0.42, 8);
    expect(result.executedPositions[0]?.shares).toBeCloseTo(42.85714286, 8);
    expect(result.executedPositions[0]?.notional).toBeCloseTo(18, 8);
    expect(result.executedPositions[0]?.status).toBe('OPEN');
    expect(result.outputLines).toContain('markets_total=2');
    expect(result.outputLines).toContain('weather_markets=1');
    expect(result.outputLines).toContain('weather_forecasts=1');
    expect(result.outputLines).toContain('signals_approved=1');
    expect(result.outputLines).toContain('signals_blocked=0');
    expect(result.outputLines).toContain('positions_opened=1');
    expect(result.outputLines).toContain('positions_closed=0');
    expect(result.dashboard.summaryCards[0]).toEqual({ label: 'Wallet Equity', value: '$982.00' });
    expect(result.dashboard.summaryCards[1]).toEqual({ label: 'Cash', value: '$982.00' });
    expect(result.dashboard.summaryCards[3]).toEqual({ label: 'Open Positions', value: '1' });
    expect(result.dashboard.summaryCards[4]).toEqual({ label: 'Closed Positions', value: '0' });
    expect(result.dashboard.marketRows).toHaveLength(1);
    expect(result.dashboard.openPositionRows).toHaveLength(1);
    expect(result.dashboard.closedPositionRows).toEqual([]);
    expect(result.dashboard.recentDecisions).toContain('BUY_YES w1 edge=0.36 size=0.18');
  });

  it('derives weather location from current temperature market question when no explicit mapping is provided', async () => {
    const gammaPayload: GammaMarketRecord[] = [
      {
        id: '2091487',
        slug: 'highest-temperature-in-london-on-april-29-2026-15c',
        question: 'Will the highest temperature in London be 15°C on April 29?',
        endDate: '2026-04-29T12:00:00Z',
        liquidity: '12000',
        volume24hr: '3100',
        tags: [{ slug: 'weather', label: 'Weather' }, { slug: 'temperature', label: 'Temperature' }],
        outcomes: '["Yes","No"]',
        outcomePrices: '["0.21","0.79"]',
        category: 'weather',
      },
    ];

    const result = await runSimpleWeatherOperator({
      startingCapital: 1000,
      marketLimit: 10,
      forecastDays: 1,
      minEdge: 0.03,
      kellyFraction: 0.5,
      maxPositionUsd: 100,
      weatherLocations: [],
      gammaFetcher: async () => gammaPayload,
      weatherFetcher: async () => ({
        latitude: 51.5072,
        longitude: -0.1276,
        timezone: 'Europe/London',
        daily: {
          time: ['2026-04-29'],
          temperature_2m_max: [15],
          temperature_2m_min: [8],
          precipitation_probability_max: [20],
          precipitation_sum: [0],
          wind_speed_10m_max: [18],
        },
      }),
    });

    expect(result.snapshot.weatherMarketCount).toBe(1);
    expect(result.weatherEnrichment).toEqual([
      expect.objectContaining({
        marketId: '2091487',
        locationLabel: 'London',
        providerName: 'open-meteo',
        forecastSource: 'live',
        forecastDayStrategy: 'market_date',
        forecastDay: expect.objectContaining({
          date: '2026-04-29',
          temperatureMaxC: 15,
        }),
      }),
    ]);
    expect(result.outputLines).toContain('weather_forecasts=1');
    expect(result.dashboard.marketRows[0]?.marketId).toBe('2091487');
  });

  it('opens only the best current-temperature ladder candidate per city/day to avoid correlated stacking, including or higher wording', async () => {
    const gammaPayload: GammaMarketRecord[] = [
      {
        id: '2091688',
        slug: 'highest-temperature-in-hong-kong-on-april-29-2026-26c',
        question: 'Will the highest temperature in Hong Kong be 26°C on April 29?',
        endDate: '2026-04-29T12:00:00Z',
        liquidity: '11855.54848',
        volume24hr: '111572.39906800001',
        tags: [],
        outcomes: '["Yes","No"]',
        outcomePrices: '["0.0005","0.9995"]',
        category: 'unknown',
      },
      {
        id: '2091689',
        slug: 'highest-temperature-in-hong-kong-on-april-29-2026-27c',
        question: 'Will the highest temperature in Hong Kong be 27°C on April 29?',
        endDate: '2026-04-29T12:00:00Z',
        liquidity: '8122.30573',
        volume24hr: '58664.120569000035',
        tags: [],
        outcomes: '["Yes","No"]',
        outcomePrices: '["0.002","0.998"]',
        category: 'unknown',
      },
      {
        id: '2091690',
        slug: 'highest-temperature-in-hong-kong-on-april-29-2026-28c',
        question: 'Will the highest temperature in Hong Kong be 28°C on April 29?',
        endDate: '2026-04-29T12:00:00Z',
        liquidity: '30374.14128',
        volume24hr: '55117.403297999976',
        tags: [],
        outcomes: '["Yes","No"]',
        outcomePrices: '["0.9985","0.0015"]',
        category: 'unknown',
      },
      {
        id: '2091691',
        slug: 'highest-temperature-in-hong-kong-on-april-29-2026-27corhigher',
        question: 'Will the highest temperature in Hong Kong be 27°C or higher on April 29?',
        endDate: '2026-04-29T12:00:00Z',
        liquidity: '24000',
        volume24hr: '65000',
        tags: [],
        outcomes: '["Yes","No"]',
        outcomePrices: '["0.21","0.79"]',
        category: 'unknown',
      },
    ];

    const result = await runSimpleWeatherOperator({
      startingCapital: 1000,
      marketLimit: 10,
      forecastDays: 1,
      minEdge: 0.03,
      kellyFraction: 0.5,
      maxPositionUsd: 100,
      weatherLocations: [],
      gammaFetcher: async () => gammaPayload,
      weatherFetcher: async () => ({
        latitude: 22.319859,
        longitude: 114.198555,
        timezone: 'Asia/Hong_Kong',
        daily: {
          time: ['2026-04-29'],
          temperature_2m_max: [27.6],
          temperature_2m_min: [18.6],
          precipitation_probability_max: [100],
          precipitation_sum: [10.1],
          wind_speed_10m_max: [18.8],
        },
      }),
    });

    expect(result.snapshot.weatherMarketCount).toBe(4);
    expect(result.weatherEnrichment).toHaveLength(4);
    expect(result.decisions).toEqual([
      expect.objectContaining({ marketId: '2091690', signal: 'HOLD' }),
      expect.objectContaining({ marketId: '2091691', signal: 'HOLD' }),
      expect.objectContaining({ marketId: '2091688', signal: 'HOLD' }),
      expect.objectContaining({ marketId: '2091689', signal: 'BUY_YES' }),
    ]);
    expect(result.executedPositions).toHaveLength(1);
    expect(result.executedPositions[0]?.marketId).toBe('2091689');
    expect(result.outputLines).toContain('signals_approved=1');
    expect(result.outputLines).toContain('signals_blocked=3');
    expect(result.outputLines).toContain('positions_opened=1');
  });

  it('does not open an ultra-cheap ladder candidate when the selected market is below the minimum yes price floor', async () => {
    const gammaPayload: GammaMarketRecord[] = [
      {
        id: '2091687',
        slug: 'highest-temperature-in-hong-kong-on-april-29-2026-25c',
        question: 'Will the highest temperature in Hong Kong be 25°C on April 29?',
        endDate: '2026-04-29T12:00:00Z',
        liquidity: '15047.50095',
        volume24hr: '78419.17079799998',
        tags: [],
        outcomes: '["Yes","No"]',
        outcomePrices: '["0.0005","0.9995"]',
        category: 'unknown',
      },
      {
        id: '2091689',
        slug: 'highest-temperature-in-hong-kong-on-april-29-2026-27c',
        question: 'Will the highest temperature in Hong Kong be 27°C on April 29?',
        endDate: '2026-04-29T12:00:00Z',
        liquidity: '8122.30573',
        volume24hr: '58664.120569000035',
        tags: [],
        outcomes: '["Yes","No"]',
        outcomePrices: '["0.0015","0.9985"]',
        category: 'unknown',
      },
      {
        id: '2091690',
        slug: 'highest-temperature-in-hong-kong-on-april-29-2026-28c',
        question: 'Will the highest temperature in Hong Kong be 28°C on April 29?',
        endDate: '2026-04-29T12:00:00Z',
        liquidity: '30374.14128',
        volume24hr: '55117.403297999976',
        tags: [],
        outcomes: '["Yes","No"]',
        outcomePrices: '["0.9985","0.0015"]',
        category: 'unknown',
      },
    ];

    const result = await runSimpleWeatherOperator({
      startingCapital: 1000,
      marketLimit: 10,
      forecastDays: 1,
      minEdge: 0.03,
      kellyFraction: 0.5,
      maxPositionUsd: 100,
      minYesPrice: 0.02,
      weatherLocations: [],
      gammaFetcher: async () => gammaPayload,
      weatherFetcher: async () => ({
        latitude: 22.319859,
        longitude: 114.198555,
        timezone: 'Asia/Hong_Kong',
        daily: {
          time: ['2026-04-29'],
          temperature_2m_max: [24.9],
          temperature_2m_min: [18.6],
          precipitation_probability_max: [100],
          precipitation_sum: [10.1],
          wind_speed_10m_max: [18.8],
        },
      }),
    });

    expect(result.decisions).toEqual([
      expect.objectContaining({ marketId: '2091690', signal: 'HOLD' }),
      expect.objectContaining({
        marketId: '2091687',
        signal: 'BUY_YES',
        adjustedScore: 0.99,
      }),
      expect.objectContaining({ marketId: '2091689', signal: 'HOLD' }),
    ]);
    expect(result.executedPositions).toEqual([]);
    expect(result.operationalBlocks).toEqual([
      expect.objectContaining({
        marketId: '2091687',
        reason: 'blocked_by_min_yes_price',
        yesPrice: 0.0005,
        threshold: 0.02,
        decisionEdge: 0.99,
      }),
    ]);
    expect(result.outputLines).toContain('signals_approved=1');
    expect(result.outputLines).toContain('positions_opened=0');
    expect(result.outputLines).toContain('operational_blocks=blocked_by_min_yes_price:1');
  });

  it('persists operational block reasons to history when yes-price and repricing-edge gates reject execution', async () => {
    const historyDir = await mkdtemp(join(tmpdir(), 'polymarket-history-blocks-'));
    const gammaPayload: GammaMarketRecord[] = [
      {
        id: 'w-low-price',
        slug: 'lowest-price-block',
        question: 'Will the highest temperature in Hong Kong be 25°C on April 29?',
        endDate: '2026-04-29T12:00:00Z',
        liquidity: '15047.50095',
        volume24hr: '78419.17079799998',
        tags: [],
        outcomes: '["Yes","No"]',
        outcomePrices: '["0.0005","0.9995"]',
        category: 'unknown',
      },
      {
        id: 'w-low-edge',
        slug: 'repricing-edge-block',
        question: 'Will it rain in New York City on May 1?',
        endDate: '2026-05-01T23:59:00Z',
        liquidity: '12000',
        volume24hr: '3500',
        tags: [{ slug: 'weather', label: 'Weather' }, { slug: 'rain', label: 'Rain' }],
        outcomes: '["Yes","No"]',
        outcomePrices: '["0.72","0.28"]',
        category: 'weather',
      },
    ];

    try {
      const result = await runSimpleWeatherOperator({
        startingCapital: 1000,
        marketLimit: 10,
        forecastDays: 2,
        minEdge: 0.03,
        kellyFraction: 0.5,
        maxPositionUsd: 100,
        minYesPrice: 0.02,
        minRepricingEdge: 0.08,
        nowIso: '2026-05-01T12:00:00Z',
        historyDir,
        weatherLocations: [
          {
            marketId: 'w-low-edge',
            label: 'New York City',
            latitude: 40.71,
            longitude: -74.01,
          },
        ],
        gammaFetcher: async () => gammaPayload,
        weatherFetcher: async () => ({
          latitude: 40.71,
          longitude: -74.01,
          timezone: 'America/New_York',
          daily: {
            time: ['2026-05-01', '2026-05-02'],
            temperature_2m_max: [25, 19],
            temperature_2m_min: [15, 13],
            precipitation_probability_max: [78, 66],
            precipitation_sum: [12, 6],
            wind_speed_10m_max: [25, 19],
          },
        }),
      });

      expect(result.executedPositions).toEqual([]);
      expect(result.operationalBlocks).toEqual([
        expect.objectContaining({ marketId: 'w-low-price', reason: 'blocked_by_min_yes_price' }),
        expect.objectContaining({ marketId: 'w-low-edge', reason: 'blocked_by_min_repricing_edge' }),
      ]);

      const historyContent = await readFile(result.historyFilePath as string, 'utf8');
      expect(JSON.parse(historyContent)).toMatchObject({
        operationalBlocks: [
          {
            marketId: 'w-low-price',
            reason: 'blocked_by_min_yes_price',
            yesPrice: 0.0005,
            threshold: 0.02,
          },
          {
            marketId: 'w-low-edge',
            reason: 'blocked_by_min_repricing_edge',
            decisionEdge: 0.06,
            threshold: 0.08,
          },
        ],
        outputLines: expect.arrayContaining(['operational_blocks=blocked_by_min_yes_price:1,blocked_by_min_repricing_edge:1']),
      });
    } finally {
      await rm(historyDir, { recursive: true, force: true });
    }
  });

  it('does not open a buy signal when expected repricing edge stays below the execution floor', async () => {
    const gammaPayload: GammaMarketRecord[] = [
      {
        id: 'w1',
        slug: 'rain-in-new-york-city-on-may-1-2026',
        question: 'Will it rain in New York City on May 1?',
        endDate: '2026-05-01T23:59:00Z',
        liquidity: '12000',
        volume24hr: '3500',
        tags: [{ slug: 'weather', label: 'Weather' }, { slug: 'rain', label: 'Rain' }],
        outcomes: '["Yes","No"]',
        outcomePrices: '["0.72","0.28"]',
        category: 'weather',
      },
    ];

    const result = await runSimpleWeatherOperator({
      startingCapital: 1000,
      marketLimit: 10,
      forecastDays: 2,
      minEdge: 0.03,
      kellyFraction: 0.5,
      maxPositionUsd: 100,
      minYesPrice: 0.02,
      minRepricingEdge: 0.08,
      weatherLocations: [
        {
          marketId: 'w1',
          label: 'New York City',
          latitude: 40.71,
          longitude: -74.01,
        },
      ],
      gammaFetcher: async () => gammaPayload,
      weatherFetcher: async () => ({
        latitude: 40.71,
        longitude: -74.01,
        timezone: 'America/New_York',
        daily: {
          time: ['2026-05-01', '2026-05-02'],
          temperature_2m_max: [22, 19],
          temperature_2m_min: [15, 13],
          precipitation_probability_max: [78, 66],
          precipitation_sum: [12, 6],
          wind_speed_10m_max: [25, 19],
        },
      }),
    });

    expect(result.decisions).toEqual([
      expect.objectContaining({
        marketId: 'w1',
        signal: 'BUY_YES',
        adjustedScore: 0.78,
        edge: 0.06,
      }),
    ]);
    expect(result.executedPositions).toEqual([]);
    expect(result.outputLines).toContain('signals_approved=1');
    expect(result.outputLines).toContain('positions_opened=0');
  });

  it('keeps running when a weather market has no configured or derivable forecast location', async () => {
    const gammaPayload: GammaMarketRecord[] = [
      {
        id: 'w1',
        slug: 'texas-heat',
        question: 'Will Texas hit 40C this week?',
        endDate: '2026-07-08T00:00:00Z',
        liquidity: '12000',
        volume24hr: '3100',
        tags: [{ slug: 'weather', label: 'Weather' }, { slug: 'heat', label: 'Heat' }],
        outcomes: '["Yes","No"]',
        outcomePrices: '["0.33","0.67"]',
        category: 'weather',
      },
    ];

    const result = await runSimpleWeatherOperator({
      startingCapital: 1000,
      marketLimit: 10,
      forecastDays: 1,
      minEdge: 0.03,
      kellyFraction: 0.5,
      maxPositionUsd: 100,
      weatherLocations: [],
      gammaFetcher: async () => gammaPayload,
      weatherFetcher: async () => {
        throw new Error('should_not_be_called');
      },
    });

    expect(result.snapshot.weatherMarketCount).toBe(1);
    expect(result.weatherEnrichment).toEqual([]);
    expect(result.decisions).toEqual([]);
    expect(result.executedPositions).toEqual([]);
    expect(result.outputLines).toContain('weather_forecasts=0');
    expect(result.outputLines).toContain('signals_approved=0');
    expect(result.outputLines).toContain('positions_opened=0');
    expect(result.dashboard.marketRows[0]?.marketId).toBe('w1');
  });

  it('uses a custom forecast provider when one is injected', async () => {
    const gammaPayload: GammaMarketRecord[] = [
      {
        id: 'w1',
        slug: 'nyc-rain',
        question: 'Will it rain in NYC tomorrow?',
        endDate: '2026-05-02T00:00:00Z',
        liquidity: '15000',
        volume24hr: '4000',
        tags: [{ slug: 'weather', label: 'Weather' }, { slug: 'rain', label: 'Rain' }],
        outcomes: '["Yes","No"]',
        outcomePrices: '["0.42","0.58"]',
        category: 'weather',
      },
    ];

    let calls = 0;
    const result = await runSimpleWeatherOperator({
      startingCapital: 1000,
      marketLimit: 10,
      forecastDays: 2,
      minEdge: 0.03,
      kellyFraction: 0.5,
      maxPositionUsd: 100,
      weatherLocations: [
        { marketId: 'w1', latitude: 40.71, longitude: -74.01, label: 'New York City' },
      ],
      gammaFetcher: async () => gammaPayload,
      forecastProvider: {
        name: 'test-provider',
        fetchForecast: async () => {
          calls += 1;
          return {
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
        },
      },
    });

    expect(calls).toBe(1);
    expect(result.weatherEnrichment[0]).toEqual(
      expect.objectContaining({
        marketId: 'w1',
        providerName: 'test-provider',
        forecastDayStrategy: 'first_day',
      }),
    );
  });

  it('reuses the same forecast for markets sharing location and forecastDays', async () => {
    const gammaPayload: GammaMarketRecord[] = [
      {
        id: '2091487',
        slug: 'highest-temperature-in-london-on-april-29-2026-15c',
        question: 'Will the highest temperature in London be 15°C on April 29?',
        endDate: '2026-04-29T12:00:00Z',
        liquidity: '12000',
        volume24hr: '3100',
        tags: [{ slug: 'weather', label: 'Weather' }, { slug: 'temperature', label: 'Temperature' }],
        outcomes: '["Yes","No"]',
        outcomePrices: '["0.21","0.79"]',
        category: 'weather',
      },
      {
        id: '2091488',
        slug: 'highest-temperature-in-london-on-april-29-2026-16c',
        question: 'Will the highest temperature in London be 16°C on April 29?',
        endDate: '2026-04-29T12:00:00Z',
        liquidity: '11800',
        volume24hr: '2900',
        tags: [{ slug: 'weather', label: 'Weather' }, { slug: 'temperature', label: 'Temperature' }],
        outcomes: '["Yes","No"]',
        outcomePrices: '["0.33","0.67"]',
        category: 'weather',
      },
    ];

    let calls = 0;
    const result = await runSimpleWeatherOperator({
      startingCapital: 1000,
      marketLimit: 10,
      forecastDays: 1,
      minEdge: 0.03,
      kellyFraction: 0.5,
      maxPositionUsd: 100,
      weatherLocations: [],
      gammaFetcher: async () => gammaPayload,
      forecastProvider: {
        name: 'test-provider',
        fetchForecast: async () => {
          calls += 1;
          return {
            latitude: 51.5072,
            longitude: -0.1276,
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
          };
        },
      },
    });

    expect(calls).toBe(1);
    expect(result.weatherEnrichment).toHaveLength(2);
    expect(result.outputLines).toContain('weather_forecasts=2');
  });

  it('uses the latest saved forecast when Open-Meteo is rate-limited', async () => {
    const historyDir = await mkdtemp(join(tmpdir(), 'polymarket-fallback-'));
    const gammaPayload: GammaMarketRecord[] = [
      {
        id: 'w1',
        slug: 'nyc-rain',
        question: 'Will it rain in NYC tomorrow?',
        endDate: '2026-05-02T00:00:00Z',
        liquidity: '15000',
        volume24hr: '4000',
        tags: [{ slug: 'weather', label: 'Weather' }, { slug: 'rain', label: 'Rain' }],
        outcomes: '["Yes","No"]',
        outcomePrices: '["0.42","0.58"]',
        category: 'weather',
      },
    ];

    try {
      await writeOperatorHistory({
        historyDir,
        runAt: '2026-04-30T18:00:00Z',
        snapshot: {
          totalMarkets: 1,
          weatherMarketCount: 1,
          weatherMarkets: [],
        },
        weatherEnrichment: [
          {
            marketId: 'w1',
            locationLabel: 'New York City',
            providerName: 'open-meteo',
            forecast: {
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
            },
            forecastDay: {
              date: '2026-05-01',
              temperatureMaxC: 22,
              temperatureMinC: 15,
              precipitationProbabilityMax: 78,
              precipitationSumMm: 12,
              windSpeedMaxKmh: 25,
            },
            forecastDayStrategy: 'first_day',
          },
        ],
        decisions: [],
        executedPositions: [],
        closedPositions: [],
        operationalBlocks: [],
        allPositions: [],
        outputLines: [],
      });

      const result = await runSimpleWeatherOperator({
        startingCapital: 1000,
        marketLimit: 10,
        forecastDays: 1,
        minEdge: 0.03,
        kellyFraction: 0.5,
        maxPositionUsd: 100,
        historyDir,
        weatherLocations: [
          { marketId: 'w1', latitude: 40.71, longitude: -74.01, label: 'New York City' },
        ],
        gammaFetcher: async () => gammaPayload,
        forecastProvider: {
          name: 'open-meteo',
          fetchForecast: async () => {
            throw new Error('open_meteo_rate_limited');
          },
        },
      });

      expect(result.weatherEnrichment).toEqual([
        expect.objectContaining({
          marketId: 'w1',
          locationLabel: 'New York City',
          providerName: 'open-meteo',
          forecastSource: 'history_fallback',
          fallbackRunAt: '2026-04-30T18:00:00Z',
          fallbackHistoryFilePath: expect.stringContaining('.json'),
          forecastDayStrategy: 'first_day',
          forecastDay: expect.objectContaining({
            date: '2026-05-01',
            precipitationProbabilityMax: 78,
          }),
        }),
      ]);
      expect(result.decisions).toEqual([
        expect.objectContaining({
          marketId: 'w1',
          signal: 'BUY_YES',
          adjustedScore: 0.78,
          edge: 0.36,
        }),
      ]);
      expect(result.executedPositions).toHaveLength(1);
      expect(result.outputLines).toContain('weather_forecasts=1');
      expect(result.outputLines).toContain('forecast_rate_limits=1');
      expect(result.outputLines).toContain('forecast_fallbacks=1');
      expect(result.outputLines).toContain('forecast_fallback_misses=0');
    } finally {
      await rm(historyDir, { recursive: true, force: true });
    }
  });

  it('keeps running when one forecast fetch times out and still trades the remaining market', async () => {
    const gammaPayload: GammaMarketRecord[] = [
      {
        id: '2091689',
        slug: 'highest-temperature-in-hong-kong-on-april-29-2026-27c',
        question: 'Will the highest temperature in Hong Kong be 27°C on April 29?',
        endDate: '2026-04-29T12:00:00Z',
        liquidity: '8122.30573',
        volume24hr: '58664.120569000035',
        tags: [],
        outcomes: '["Yes","No"]',
        outcomePrices: '["0.002","0.998"]',
        category: 'unknown',
      },
      {
        id: '2091487',
        slug: 'highest-temperature-in-london-on-april-29-2026-15c',
        question: 'Will the highest temperature in London be 15°C on April 29?',
        endDate: '2026-04-29T12:00:00Z',
        liquidity: '12000',
        volume24hr: '3100',
        tags: [{ slug: 'weather', label: 'Weather' }, { slug: 'temperature', label: 'Temperature' }],
        outcomes: '["Yes","No"]',
        outcomePrices: '["0.21","0.79"]',
        category: 'weather',
      },
    ];

    let weatherCalls = 0;
    const result = await runSimpleWeatherOperator({
      startingCapital: 1000,
      marketLimit: 10,
      forecastDays: 1,
      minEdge: 0.03,
      kellyFraction: 0.5,
      maxPositionUsd: 100,
      weatherLocations: [],
      gammaFetcher: async () => gammaPayload,
      weatherFetcher: async () => {
        weatherCalls += 1;
        if (weatherCalls === 1) {
          throw new Error('forecast_timeout');
        }

        return {
          latitude: 51.5072,
          longitude: -0.1276,
          timezone: 'Europe/London',
          daily: {
            time: ['2026-04-29'],
            temperature_2m_max: [15],
            temperature_2m_min: [8],
            precipitation_probability_max: [20],
            precipitation_sum: [0],
            wind_speed_10m_max: [18],
          },
        };
      },
    });

    expect(result.snapshot.weatherMarketCount).toBe(2);
    expect(result.weatherEnrichment).toHaveLength(1);
    expect(result.decisions).toHaveLength(1);
    expect(result.decisions[0]?.reason).toBeDefined();
    expect(result.executedPositions).toHaveLength(0);
    expect(result.outputLines).toContain('weather_forecasts=1');
    expect(result.outputLines).toContain('positions_opened=0');
  });
  it('writes deterministic history snapshot when historyDir and nowIso are provided', async () => {
    const historyDir = await mkdtemp(join(tmpdir(), 'polymarket-hermes-history-'));

    try {
      const gammaPayload: GammaMarketRecord[] = [
        {
          id: 'w1',
          slug: 'nyc-rain',
          question: 'Will it rain in NYC tomorrow?',
          endDate: '2026-05-02T00:00:00Z',
          liquidity: '15000',
          volume24hr: '4000',
          tags: [{ slug: 'weather', label: 'Weather' }, { slug: 'rain', label: 'Rain' }],
          outcomes: '["Yes","No"]',
          outcomePrices: '["0.55","0.45"]',
          category: 'weather',
        },
      ];

      const result = await runSimpleWeatherOperator({
        startingCapital: 1000,
        marketLimit: 10,
        forecastDays: 2,
        minEdge: 0.03,
        kellyFraction: 0.5,
        maxPositionUsd: 100,
        takeProfitPct: 0.2,
        maxHoldingHours: 24,
        nowIso: '2026-05-01T12:00:00Z',
        historyDir,
        seedPositions: [
          {
            marketId: 'w1',
            outcome: 'YES',
            entryPrice: 0.4,
            shares: 10,
            openedAt: '2026-05-01T06:00:00Z',
          },
        ],
        weatherLocations: [
          { marketId: 'w1', latitude: 40.71, longitude: -74.01, label: 'New York City' },
        ],
        gammaFetcher: async () => gammaPayload,
        weatherFetcher: async () => ({
          latitude: 40.71,
          longitude: -74.01,
          timezone: 'America/New_York',
          daily: {
            time: ['2026-05-01', '2026-05-02'],
            temperature_2m_max: [22, 19],
            temperature_2m_min: [15, 13],
            precipitation_probability_max: [78, 66],
            precipitation_sum: [12, 6],
            wind_speed_10m_max: [25, 19],
          },
        }),
      });

      expect(result.historyFilePath).toBe(join(historyDir, '2026-05-01T12-00-00Z.json'));

      const historyContent = await readFile(result.historyFilePath as string, 'utf8');
 expect(JSON.parse(historyContent)).toMatchObject({
 runAt: '2026-05-01T12:00:00Z',
 snapshot: {
 totalMarkets: 1,
 weatherMarketCount: 1,
 },
 decisions: [
 {
 marketId: 'w1',
 signal: 'BUY_YES',
 edge: 0.23,
 },
 ],
 // Dedup: no new position opened because seed position already exists for w1
 executedPositions: [],
 closedPositions: [
 {
 marketId: 'w1',
 status: 'CLOSED',
 exitReason: 'take_profit',
 },
 ],
 allPositions: expect.arrayContaining([
 expect.objectContaining({ marketId: 'w1', status: 'CLOSED', exitReason: 'take_profit' }),
 ]),
 outputLines: expect.arrayContaining(['positions_closed=1']),
 });
    } finally {
 await rm(historyDir, { recursive: true, force: true });
 }
 });

it('closes open position when market has expired (closesAt in the past)', async () => {
      const gammaPayload: GammaMarketRecord[] = [
        {
          id: 'w1',
          slug: 'nyc-rain',
          question: 'Will it rain in NYC tomorrow?',
          endDate: '2026-05-01T11:00:00Z', // closesAt BEFORE nowIso → market expired
          liquidity: '15000',
          volume24hr: '4000',
          tags: [{ slug: 'weather', label: 'Weather' }, { slug: 'rain', label: 'Rain' }],
          outcomes: '["Yes","No"]',
          outcomePrices: '["0.78","0.22"]',
          category: 'weather',
        },
      ];

      const result = await runSimpleWeatherOperator({
        startingCapital: 1000,
        marketLimit: 10,
        forecastDays: 2,
        minEdge: 0.03,
        kellyFraction: 0.5,
        maxPositionUsd: 100,
        minRepricingEdge: 0.10,
        nowIso: '2026-05-01T12:00:00Z',
        seedPositions: [
          {
            marketId: 'w1',
            outcome: 'YES',
            entryPrice: 0.40,
            shares: 20,
            openedAt: '2026-05-01T06:00:00Z',
          },
        ],
        weatherLocations: [
          { marketId: 'w1', latitude: 40.71, longitude: -74.01, label: 'New York City' },
        ],
        gammaFetcher: async () => gammaPayload,
        weatherFetcher: async () => ({
          latitude: 40.71,
          longitude: -74.01,
          timezone: 'America/New_York',
          daily: {
            time: ['2026-05-01', '2026-05-02'],
            temperature_2m_max: [22, 19],
            temperature_2m_min: [15, 13],
            precipitation_probability_max: [78, 66],
            precipitation_sum: [12, 6],
            wind_speed_10m_max: [25, 19],
          },
        }),
      });

      // The seeded position should be closed by market_expired
      const marketExpiredClosed = result.closedPositions.filter(
        (p) => p.exitReason === 'market_expired',
      );
      expect(marketExpiredClosed.length).toBeGreaterThanOrEqual(1);
      const seeded = marketExpiredClosed.find(
        (p) => p.entryPrice === 0.40 && p.shares === 20,
      );
      expect(seeded).toBeDefined();
      expect(seeded!.exitPrice).toBe(0.78); // current yesPrice at expiry
      expect(seeded!.realizedPnl).toBeCloseTo(7.6, 4); // (0.78-0.4)*20
      expect(result.outputLines).toContain('closed_position_exit_reasons=market_expired:1');
    });

it('closes YES position with loss when market expires and yesPrice is low', async () => {
      const gammaPayload: GammaMarketRecord[] = [
        {
          id: 'w1',
          slug: 'london-temp',
          question: 'Will London hit 25C tomorrow?',
          endDate: '2026-05-01T11:00:00Z', // closesAt BEFORE nowIso → market expired
          liquidity: '15000',
          volume24hr: '4000',
          tags: [{ slug: 'weather', label: 'Weather' }],
          outcomes: '["Yes","No"]',
          outcomePrices: '["0.30","0.70"]',
          category: 'weather',
        },
      ];

      const result = await runSimpleWeatherOperator({
        startingCapital: 1000,
        marketLimit: 10,
        forecastDays: 2,
        minEdge: 0.03,
        kellyFraction: 0.5,
        maxPositionUsd: 100,
        minRepricingEdge: 0.10,
        nowIso: '2026-05-01T12:00:00Z',
        seedPositions: [
          {
            marketId: 'w1',
            outcome: 'YES',
            entryPrice: 0.60,
            shares: 30,
            openedAt: '2026-05-01T06:00:00Z',
          },
        ],
        weatherLocations: [
          { marketId: 'w1', latitude: 51.51, longitude: -0.13, label: 'London' },
        ],
        gammaFetcher: async () => gammaPayload,
        weatherFetcher: async () => ({
          latitude: 51.51,
          longitude: -0.13,
          timezone: 'Europe/London',
          daily: {
            time: ['2026-05-01', '2026-05-02'],
            temperature_2m_max: [20, 18],
            temperature_2m_min: [12, 10],
            precipitation_probability_max: [30, 40],
            precipitation_sum: [2, 5],
            wind_speed_10m_max: [15, 20],
          },
        }),
      });

      const marketExpiredClosed = result.closedPositions.filter(
        (p) => p.exitReason === 'market_expired',
      );
      const seeded = marketExpiredClosed.find(
        (p) => p.entryPrice === 0.60 && p.shares === 30,
      );
      expect(seeded).toBeDefined();
      expect(seeded!.exitPrice).toBe(0.30); // yesPrice at expiry
      expect(seeded!.realizedPnl).toBeCloseTo(-9, 4); // (0.30-0.60)*30
    });

it('does not close position when market has not expired yet', async () => {
      const gammaPayload: GammaMarketRecord[] = [
        {
          id: 'w1',
          slug: 'nyc-rain',
          question: 'Will it rain in NYC tomorrow?',
          endDate: '2026-05-03T00:00:00Z', // closesAt AFTER nowIso → market still open
          liquidity: '15000',
          volume24hr: '4000',
          tags: [{ slug: 'weather', label: 'Weather' }, { slug: 'rain', label: 'Rain' }],
          outcomes: '["Yes","No"]',
          outcomePrices: '["0.78","0.22"]',
          category: 'weather',
        },
      ];

      const result = await runSimpleWeatherOperator({
        startingCapital: 1000,
        marketLimit: 10,
        forecastDays: 2,
        minEdge: 0.03,
        kellyFraction: 0.5,
        maxPositionUsd: 100,
        minRepricingEdge: 0.10,
        nowIso: '2026-05-01T12:00:00Z',
        seedPositions: [
          {
            marketId: 'w1',
            outcome: 'YES',
            entryPrice: 0.40,
            shares: 10,
            openedAt: '2026-05-01T06:00:00Z',
          },
        ],
        weatherLocations: [
          { marketId: 'w1', latitude: 40.71, longitude: -74.01, label: 'New York City' },
        ],
        gammaFetcher: async () => gammaPayload,
        weatherFetcher: async () => ({
          latitude: 40.71,
          longitude: -74.01,
          timezone: 'America/New_York',
          daily: {
            time: ['2026-05-01', '2026-05-02'],
            temperature_2m_max: [22, 19],
            temperature_2m_min: [15, 13],
            precipitation_probability_max: [78, 66],
            precipitation_sum: [12, 6],
            wind_speed_10m_max: [25, 19],
          },
        }),
      });

      // No positions should be closed — market hasn't expired, no take-profit/timeout hit
      const seededClosed = result.closedPositions.filter(
        (p) => p.entryPrice === 0.40 && p.shares === 10,
      );
      expect(seededClosed).toHaveLength(0);
    });


});
