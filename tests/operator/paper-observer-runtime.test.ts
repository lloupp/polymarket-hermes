import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import type { GammaMarketRecord } from '../../src/ingestion/polymarket';
import {
  buildPaperObserverCliOptions,
  renderPaperObserverCycleSummary,
  runPaperObserverCycle,
} from '../../src/operator/paper-observer-runtime';

describe('paper-observer-runtime', () => {
  it('parses CLI flags into deterministic observer options', () => {
    const options = buildPaperObserverCliOptions([
      '--once',
      '--cycles=3',
      '--interval-ms=2500',
      '--history-dir=/tmp/history',
      '--runtime-log-path=/tmp/runtime.ndjson',
      '--wallet-state-path=/tmp/paper-wallet.json',
      '--starting-capital=250',
      '--market-limit=12',
      '--forecast-days=3',
      '--min-edge=0.05',
      '--kelly-fraction=0.25',
      '--max-position-usd=40',
      '--min-yes-price=0.02',
      '--min-repricing-edge=0.08',
      '--take-profit-pct=0.1',
      '--max-holding-hours=6',
      '--search-query=highest temperature in',
      '--search-query=rain in',
    ]);

    expect(options).toMatchObject({
      once: true,
      cycles: 3,
      intervalMs: 2500,
      historyDir: '/tmp/history',
      runtimeLogPath: '/tmp/runtime.ndjson',
      walletStatePath: '/tmp/paper-wallet.json',
      startingCapital: 250,
      marketLimit: 12,
      forecastDays: 3,
      minEdge: 0.05,
      kellyFraction: 0.25,
      maxPositionUsd: 40,
      minYesPrice: 0.02,
      minRepricingEdge: 0.08,
      takeProfitPct: 0.1,
      maxHoldingHours: 6,
      searchQueries: ['highest temperature in', 'rain in'],
    });
  });

  it('accepts --ndjson-log as backward-compatible runtime log alias', () => {
    const options = buildPaperObserverCliOptions([
      '--history-dir=/tmp/history',
      '--ndjson-log=/tmp/alias.ndjson',
    ]);

    expect(options.historyDir).toBe('/tmp/history');
    expect(options.runtimeLogPath).toBe('/tmp/alias.ndjson');
  });

  it('parses flag values passed with a space (not only --flag=value)', () => {
    const options = buildPaperObserverCliOptions([
      '--history-dir',
      '/tmp/history-space',
      '--ndjson-log',
      '/tmp/space.ndjson',
      '--search-query',
      'highest temperature in',
    ]);

    expect(options.historyDir).toBe('/tmp/history-space');
    expect(options.runtimeLogPath).toBe('/tmp/space.ndjson');
    expect(options.searchQueries).toEqual(['highest temperature in']);
  });

  it('uses diversified default climate search queries when none are provided', () => {
    const options = buildPaperObserverCliOptions([]);

    expect(options.searchQueries).toEqual([
      'highest temperature in',
      'temperature in london',
      'temperature in seoul',
    ]);
  });

  it('persists wallet state across observer cycles', async () => {
    const runtimeDir = await mkdtemp(join(tmpdir(), 'polymarket-paper-wallet-'));
    const historyDir = join(runtimeDir, 'history');
    const walletStatePath = join(runtimeDir, 'paper-wallet.json');
    const gammaPayload: GammaMarketRecord[] = [
      {
        id: '2091487',
        slug: 'highest-temperature-in-london-on-april-29-2026-15c',
        question: 'Will the highest temperature in London be 15°C on April 29?',
        endDate: '2026-04-29T12:00:00Z',
        liquidity: '15000',
        volume24hr: '4000',
        tags: [{ slug: 'weather', label: 'Weather' }, { slug: 'temperature', label: 'Temperature' }],
        outcomes: '["Yes","No"]',
        outcomePrices: '["0.21","0.79"]',
        category: 'weather',
      },
    ];

    try {
      const baseOptions = {
        historyDir,
        walletStatePath,
        startingCapital: 1000,
        marketLimit: 10,
        forecastDays: 1,
        minEdge: 0.03,
        kellyFraction: 0.5,
        maxPositionUsd: 100,
        takeProfitPct: 0.2,
        maxHoldingHours: 24,
        weatherLocations: [],
        searchQueries: ['highest temperature in'],
        gammaFetcher: async () => [],
        publicSearchFetcher: async () => ({ events: [{ markets: gammaPayload }] }),
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
      };

      const firstCycle = await runPaperObserverCycle({
        ...baseOptions,
        nowIso: '2026-04-29T10:00:00Z',
      });
      const secondCycle = await runPaperObserverCycle({
        ...baseOptions,
        nowIso: '2026-04-29T10:05:00Z',
      });

      expect(firstCycle.record.positionsOpened).toBe(1);
      expect(secondCycle.record.positionsOpened).toBe(0);
      expect(secondCycle.result.dashboard.summaryCards[3]).toEqual({ label: 'Open Positions', value: '1' });

      const walletState = JSON.parse(await readFile(walletStatePath, 'utf8'));
      expect(walletState.positions).toEqual([
        expect.objectContaining({
          marketId: '2091487',
          outcome: 'YES',
          status: 'OPEN',
        }),
      ]);
    } finally {
      await rm(runtimeDir, { recursive: true, force: true });
    }
  });

  it('runs one observer cycle and appends auditable NDJSON output', async () => {
    const runtimeDir = await mkdtemp(join(tmpdir(), 'polymarket-paper-observer-'));
    const historyDir = join(runtimeDir, 'history');
    const runtimeLogPath = join(runtimeDir, 'paper-observer.ndjson');

    try {
      const gammaPayload: GammaMarketRecord[] = [
        {
          id: '2091487',
          slug: 'highest-temperature-in-london-on-april-29-2026-15c',
          question: 'Will the highest temperature in London be 15°C on April 29?',
          endDate: '2026-04-29T12:00:00Z',
          liquidity: '15000',
          volume24hr: '4000',
          tags: [{ slug: 'weather', label: 'Weather' }, { slug: 'temperature', label: 'Temperature' }],
          outcomes: '["Yes","No"]',
          outcomePrices: '["0.21","0.79"]',
          category: 'weather',
        },
      ];

      const cycle = await runPaperObserverCycle({
        nowIso: '2026-04-29T10:00:00Z',
        historyDir,
        runtimeLogPath,
        startingCapital: 1000,
        marketLimit: 10,
        forecastDays: 1,
        minEdge: 0.03,
        kellyFraction: 0.5,
        maxPositionUsd: 100,
        takeProfitPct: 0.2,
        maxHoldingHours: 24,
        weatherLocations: [],
        searchQueries: ['highest temperature in'],
        gammaFetcher: async () => [],
        publicSearchFetcher: async () => ({ events: [{ markets: gammaPayload }] }),
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

      expect(cycle.result.outputLines).toContain('weather_markets=1');
      expect(cycle.result.outputLines).toContain('positions_opened=1');
      expect(cycle.result.outputLines).toContain('weather_forecasts=1');
      expect(cycle.result.outputLines).toContain('weather_discovery_breakdown=public_search:1');
      expect(cycle.result.outputLines).toContain('weather_discovery_queries=highest temperature in:1');
      expect(cycle.record.historyFilePath).toBe(join(historyDir, '2026-04-29T10-00-00Z.json'));
      expect(cycle.record.signalsApproved).toBe(1);
      expect(cycle.record.positionsOpened).toBe(1);
      expect(cycle.record.weatherForecasts).toBe(1);

      const runtimeLogContent = await readFile(runtimeLogPath, 'utf8');
      const lines = runtimeLogContent.trim().split('\n');
      expect(lines).toHaveLength(1);
      expect(JSON.parse(lines[0] ?? '{}')).toMatchObject({
        runAt: '2026-04-29T10:00:00Z',
        totalMarkets: 1,
        weatherMarkets: 1,
        weatherForecasts: 1,
        signalsApproved: 1,
        positionsOpened: 1,
        historyFilePath: join(historyDir, '2026-04-29T10-00-00Z.json'),
      });

      expect(renderPaperObserverCycleSummary(cycle)).toContain('run_at=2026-04-29T10:00:00Z');
      expect(renderPaperObserverCycleSummary(cycle)).toContain('positions_opened=1');
      expect(renderPaperObserverCycleSummary(cycle)).toContain('weather_forecasts=1');
      expect(renderPaperObserverCycleSummary(cycle)).toContain(`history_dir=${historyDir}`);
      expect(renderPaperObserverCycleSummary(cycle)).toContain(`runtime_log_path=${runtimeLogPath}`);
      expect(renderPaperObserverCycleSummary(cycle)).toContain(
        `history_file=${join(historyDir, '2026-04-29T10-00-00Z.json')}`,
      );
    } finally {
      await rm(runtimeDir, { recursive: true, force: true });
    }
  });
});
