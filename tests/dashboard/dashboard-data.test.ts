import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildDashboardData } from '../../src/dashboard/dashboard-data';
import type { GammaMarketRecord } from '../../src/ingestion/polymarket';
import type { OperatorHistoryRecord } from '../../src/history/operator-history';

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function createHistoryDir(record: OperatorHistoryRecord): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'hermes-dashboard-'));
  tempDirs.push(directory);

  const fileName = `${record.runAt.replace(/:/g, '-')}.json`;
  await writeFile(join(directory, fileName), `${JSON.stringify(record, null, 2)}\n`, 'utf8');

  return directory;
}

describe('buildDashboardData', () => {
  it('builds real dashboard data from the simple operator result in live mode', async () => {
    const gammaPayload: GammaMarketRecord[] = [
      {
        id: 'w1',
        slug: 'miami-rain',
        question: 'Will it rain in Miami tomorrow?',
        endDate: '2026-08-03T00:00:00Z',
        liquidity: '22000',
        volume24hr: '9000',
        tags: [{ slug: 'weather', label: 'Weather' }, { slug: 'rain', label: 'Rain' }],
        outcomes: '["Yes","No"]',
        outcomePrices: '["0.52","0.48"]',
        category: 'weather',
      },
    ];

    const data = await buildDashboardData({
      source: 'live',
      operatorOptions: {
        startingCapital: 1000,
        marketLimit: 10,
        forecastDays: 2,
        minEdge: 0.95,
        kellyFraction: 0.5,
        maxPositionUsd: 100,
        takeProfitPct: 0.2,
        maxHoldingHours: 24,
        nowIso: '2026-08-01T12:00:00Z',
        seedPositions: [
          {
            marketId: 'w1',
            outcome: 'YES',
            entryPrice: 0.39,
            shares: 10,
            openedAt: '2026-08-01T06:00:00Z',
          },
        ],
        weatherLocations: [
          {
            marketId: 'w1',
            latitude: 25.76,
            longitude: -80.19,
            label: 'Miami',
          },
        ],
        gammaFetcher: async () => gammaPayload,
        weatherFetcher: async () => ({
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
      },
    });

    expect(data.status.source).toBe('live');
    expect(data.status.runAt).toBe('2026-08-01T12:00:00Z');
    expect(data.hero.title).toBe('Paper Trading Dashboard');
    expect(data.dashboard.summaryCards[0]?.value).toBe('$1002.60');
    expect(data.dashboard.summaryCards[1]?.value).toBe('$1001.30');
    expect(data.dashboard.summaryCards[3]?.value).toBe('0');
    expect(data.dashboard.summaryCards[4]?.value).toBe('1');
    expect(data.dashboard.openPositionRows).toEqual([]);
    expect(data.dashboard.closedPositionRows).toEqual([
      {
        marketId: 'w1',
        outcome: 'YES',
        entryPrice: '0.39',
        shares: '10.00',
        notional: '$3.90',
        status: 'CLOSED',
        exitReason: 'take_profit',
      },
    ]);
    expect(data.forecastRows).toEqual([
      {
        marketId: 'w1',
        locationLabel: 'Miami',
        nextDate: '2026-08-01',
        precipitationProbability: '82%',
        precipitationSum: '18.0 mm',
        windSpeed: '48.0 km/h',
        forecastSource: 'live',
        fallbackRunAt: undefined,
        fallbackHistoryFilePath: undefined,
      },
    ]);
    expect(data.outputLines).toContain('weather_forecasts=1');
    expect(data.outputLines).toContain('positions_closed=1');
    expect(data.outputLines).toContain('closed_position_exit_reasons=take_profit:1');
    expect(data.dashboard.operationalBlockSummary).toEqual([]);
    expect(data.dashboard.operationalBlockRows).toEqual([]);
  });

  it('builds dashboard data from the latest saved history record', async () => {
    const historyRecord: OperatorHistoryRecord = {
      runAt: '2026-08-01T12:00:00Z',
      snapshot: {
        totalMarkets: 1,
        weatherMarketCount: 1,
        weatherMarkets: [
          {
            id: 'w1',
            slug: 'miami-rain',
            question: 'Will it rain in Miami tomorrow?',
            category: 'weather',
            yesPrice: 0.52,
            noPrice: 0.48,
            liquidity: 22000,
            volume24h: 9000,
            closesAt: '2026-08-03T00:00:00Z',
            tags: ['weather', 'rain'],
            discoverySource: 'public_search',
            discoveryQuery: 'rain in miami',
          },
        ],
      },
      weatherEnrichment: [
        {
          marketId: 'w1',
          locationLabel: 'Miami',
          providerName: 'open-meteo',
          forecast: {
            latitude: 25.76,
            longitude: -80.19,
            timezone: 'America/New_York',
            days: [
              {
                date: '2026-08-01',
                temperatureMaxC: 31,
                temperatureMinC: 26,
                precipitationProbabilityMax: 82,
                precipitationSumMm: 18,
                windSpeedMaxKmh: 48,
              },
            ],
          },
          forecastDay: {
            date: '2026-08-01',
            temperatureMaxC: 31,
            temperatureMinC: 26,
            precipitationProbabilityMax: 82,
            precipitationSumMm: 18,
            windSpeedMaxKmh: 48,
          },
          forecastDayStrategy: 'first_day',
          forecastSource: 'history_fallback',
          fallbackRunAt: '2026-07-31T22:00:00Z',
          fallbackHistoryFilePath: '/tmp/history/2026-07-31T22-00-00Z.json',
        },
      ],
      decisions: [
        {
          marketId: 'w1',
          signal: 'BUY_YES',
          adjustedScore: 0.82,
          edge: 0.3,
          positionSize: 0.2,
          reason: 'rain_signal',
        },
      ],
      executedPositions: [],
      closedPositions: [
        {
          id: 'paper-1',
          marketId: 'w1',
          outcome: 'YES',
          entryPrice: 0.39,
          shares: 10,
          notional: 3.9,
          openedAt: '2026-08-01T06:00:00Z',
          status: 'CLOSED',
          closedAt: '2026-08-01T12:00:00Z',
          exitPrice: 0.52,
          exitReason: 'take_profit',
          realizedPnl: 1.3,
        },
      ],
      operationalBlocks: [],
      allPositions: [
        {
          id: 'paper-1',
          marketId: 'w1',
          outcome: 'YES',
          entryPrice: 0.39,
          shares: 10,
          notional: 3.9,
          openedAt: '2026-08-01T06:00:00Z',
          status: 'CLOSED',
          closedAt: '2026-08-01T12:00:00Z',
          exitPrice: 0.52,
          exitReason: 'take_profit',
          realizedPnl: 1.3,
        },
      ],
      outputLines: ['weather_forecasts=1', 'forecast_fallbacks=1', 'positions_closed=1'],
    };

    const historyDir = await createHistoryDir(historyRecord);
    const data = await buildDashboardData({
      source: 'history',
      historyDir,
      startingCapital: 1000,
    });

    expect(data.status.source).toBe('history');
    expect(data.status.runAt).toBe('2026-08-01T12:00:00Z');
    expect(data.status.historyDir).toBe(historyDir);
    expect(data.status.historyFilePath).toContain('2026-08-01T12-00-00Z.json');
    expect(data.status.message).toContain('fallback');
    expect(data.dashboard.summaryCards[0]?.value).toBe('$1002.60');
    expect(data.dashboard.summaryCards[1]?.value).toBe('$1001.30');
    expect(data.dashboard.summaryCards[2]?.value).toBe('$1.30');
    expect(data.dashboard.marketRows[0]?.discoverySource).toBe('public_search');
    expect(data.dashboard.marketRows[0]?.discoveryQuery).toBe('rain in miami');
    expect(data.forecastRows[0]).toMatchObject({
      locationLabel: 'Miami',
      forecastSource: 'history_fallback',
      fallbackRunAt: '2026-07-31T22:00:00Z',
      fallbackHistoryFilePath: '/tmp/history/2026-07-31T22-00-00Z.json',
    });
    expect(data.outputLines).toContain('forecast_fallbacks=1');
    expect(data.outputLines).toContain('positions_closed=1');
  });

  it('returns a clear empty-history fallback when no saved record exists', async () => {
    const historyDir = await mkdtemp(join(tmpdir(), 'hermes-dashboard-empty-'));
    tempDirs.push(historyDir);

    const data = await buildDashboardData({
      source: 'history',
      historyDir,
      startingCapital: 1000,
    });

    expect(data.status.source).toBe('history');
    expect(data.status.runAt).toBeUndefined();
    expect(data.status.message).toContain('Nenhum histórico encontrado');
    expect(data.dashboard.marketRows).toEqual([]);
    expect(data.forecastRows).toEqual([]);
    expect(data.outputLines).toContain('history_status=empty');
    expect(data.dashboard.summaryCards[1]?.value).toBe('$1000.00');
  });
});
