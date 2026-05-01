import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import {
  readLatestForecastFallback,
  writeOperatorHistory,
  type OperatorHistoryRecord,
} from '../../src/history/operator-history';

describe('writeOperatorHistory', () => {
  it('persists discovery metadata in snapshot weather markets for auditability', async () => {
    const historyDir = await mkdtemp(join(tmpdir(), 'polymarket-history-'));

    try {
      const filePath = await writeOperatorHistory({
        historyDir,
        runAt: '2026-08-02T10:00:00Z',
        snapshot: {
          totalMarkets: 1,
          weatherMarketCount: 1,
          weatherMarkets: [
            {
              id: 'w1',
              slug: 'nyc-snow',
              question: 'Will NYC get snow this week?',
              category: 'weather',
              yesPrice: 0.42,
              noPrice: 0.58,
              liquidity: 10000,
              volume24h: 5000,
              closesAt: '2026-05-01T00:00:00Z',
              tags: ['weather', 'snow'],
              discoverySource: 'public_search',
              discoveryQuery: 'snow in',
            },
          ],
        },
        weatherEnrichment: [],
        decisions: [],
        executedPositions: [],
        closedPositions: [],
        operationalBlocks: [],
        allPositions: [],
        outputLines: ['weather_discovery_breakdown=public_search:1'],
      });

      const content = await readFile(filePath, 'utf8');
      const record = JSON.parse(content) as OperatorHistoryRecord;

      expect(record.snapshot.weatherMarkets[0]?.discoverySource).toBe('public_search');
      expect(record.snapshot.weatherMarkets[0]?.discoveryQuery).toBe('snow in');
      expect(record.outputLines).toContain('weather_discovery_breakdown=public_search:1');
    } finally {
      await rm(historyDir, { recursive: true, force: true });
    }
  });

  it('returns the latest compatible forecast from saved history for a location', async () => {
    const historyDir = await mkdtemp(join(tmpdir(), 'polymarket-history-'));

    try {
      await writeOperatorHistory({
        historyDir,
        runAt: '2026-05-01T10:00:00Z',
        snapshot: {
          totalMarkets: 1,
          weatherMarketCount: 1,
          weatherMarkets: [],
        },
        weatherEnrichment: [
          {
            marketId: 'older-london-market',
            locationLabel: 'London',
            providerName: 'open-meteo',
            forecast: {
              latitude: 51.5072,
              longitude: -0.1276,
              timezone: 'Europe/London',
              days: [
                {
                  date: '2026-05-01',
                  temperatureMaxC: 18,
                  temperatureMinC: 10,
                  precipitationProbabilityMax: 30,
                  precipitationSumMm: 1.2,
                  windSpeedMaxKmh: 20,
                },
              ],
            },
            forecastDay: {
              date: '2026-05-01',
              temperatureMaxC: 18,
              temperatureMinC: 10,
              precipitationProbabilityMax: 30,
              precipitationSumMm: 1.2,
              windSpeedMaxKmh: 20,
            },
            forecastDayStrategy: 'market_date',
          },
        ],
        decisions: [],
        executedPositions: [],
        closedPositions: [],
        operationalBlocks: [],
        allPositions: [],
        outputLines: [],
      });

      await writeOperatorHistory({
        historyDir,
        runAt: '2026-05-01T12:00:00Z',
        snapshot: {
          totalMarkets: 1,
          weatherMarketCount: 1,
          weatherMarkets: [],
        },
        weatherEnrichment: [
          {
            marketId: 'latest-london-market',
            locationLabel: 'London',
            providerName: 'open-meteo',
            forecast: {
              latitude: 51.5072,
              longitude: -0.1276,
              timezone: 'Europe/London',
              days: [
                {
                  date: '2026-05-01',
                  temperatureMaxC: 21,
                  temperatureMinC: 12,
                  precipitationProbabilityMax: 15,
                  precipitationSumMm: 0,
                  windSpeedMaxKmh: 18,
                },
              ],
            },
            forecastDay: {
              date: '2026-05-01',
              temperatureMaxC: 21,
              temperatureMinC: 12,
              precipitationProbabilityMax: 15,
              precipitationSumMm: 0,
              windSpeedMaxKmh: 18,
            },
            forecastDayStrategy: 'market_date',
          },
        ],
        decisions: [],
        executedPositions: [],
        closedPositions: [],
        operationalBlocks: [],
        allPositions: [],
        outputLines: [],
      });

      const fallback = await readLatestForecastFallback({
        historyDir,
        latitude: 51.5072,
        longitude: -0.1276,
        forecastDays: 1,
      });

      expect(fallback).toMatchObject({
        source: 'history_fallback',
        runAt: '2026-05-01T12:00:00Z',
        historyFilePath: expect.stringContaining('.json'),
        forecast: {
          latitude: 51.5072,
          longitude: -0.1276,
          timezone: 'Europe/London',
          days: [
            expect.objectContaining({
              date: '2026-05-01',
              temperatureMaxC: 21,
            }),
          ],
        },
      });
    } finally {
      await rm(historyDir, { recursive: true, force: true });
    }
  });
});
