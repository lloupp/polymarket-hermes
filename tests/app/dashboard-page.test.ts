import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const buildDashboardDataMock = vi.fn();

vi.mock('../../src/dashboard/dashboard-data', () => ({
  buildDashboardData: buildDashboardDataMock,
}));

const defaultDashboardData = {
  hero: {
    eyebrow: 'Polymarket Hermes',
    title: 'Paper Trading Dashboard',
    subtitle: 'Visão inicial do operador com foco em mercados de clima, forecasts reais e trilha auditável.',
  },
  dashboard: {
    summaryCards: [],
    marketRows: [
      {
        marketId: 'm1',
        question: 'Will the highest temperature in London be 15°C on April 29?',
        category: 'weather',
        yesPrice: '0.21',
        liquidity: '$3,200',
        volume24h: '$900',
        closesAt: '2026-04-29T12:00:00Z',
        discoverySource: 'public_search',
        discoveryQuery: 'highest temperature in',
      },
    ],
    recentDecisions: [],
    openPositionRows: [],
    closedPositionRows: [],
    operationalBlockSummary: [],
    operationalBlockRows: [],
  },
  forecastRows: [
    {
      marketId: 'm1',
      locationLabel: 'London',
      nextDate: '2026-05-01',
      precipitationProbability: '70%',
      precipitationSum: '6.0 mm',
      windSpeed: '18.0 km/h',
      forecastSource: 'history_fallback',
      fallbackRunAt: '2026-04-30T18:00:00Z',
      fallbackHistoryFilePath: 'operator-runtime/history/2026-04-30T18-00-00Z.json',
    },
  ],
  outputLines: [],
  status: {
    source: 'history',
    runAt: '2026-05-01T01:14:52.950Z',
    historyDir: 'operator-runtime/history',
    message: 'Histórico carregado do último ciclo salvo; contém forecast reaproveitado por fallback.',
  },
};

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    buildDashboardDataMock.mockResolvedValue(defaultDashboardData);
  });

  it('renders controls, history status and discovery metadata in the visual UI', async () => {
    const { default: DashboardPage } = await import('../../app/page');
    const markup = renderToStaticMarkup(await DashboardPage({ searchParams: {} }));

    expect(markup).toContain('name="source"');
    expect(markup).toContain('name="historyDir"');
    expect(markup).toContain('name="marketLimit"');
    expect(markup).toContain('name="forecastDays"');
    expect(markup).toContain('name="minEdge"');
    expect(markup).toContain('name="maxPositionUsd"');
    expect(markup).toContain('name="refreshSeconds"');
    expect(markup).toContain('history');
    expect(markup).toContain('operator-runtime/history');
    expect(markup).toContain('public_search');
    expect(markup).toContain('highest temperature in');
    expect(markup).toContain('history_fallback');
    expect(markup).toContain('2026-04-30T18:00:00Z');
  });

  it('passes live query params into buildDashboardData', async () => {
    buildDashboardDataMock.mockResolvedValueOnce({
      ...defaultDashboardData,
      status: {
        source: 'live',
        runAt: '2026-05-01T02:00:00.000Z',
        historyDir: 'operator-runtime/history',
        message: 'Execução live concluída.',
      },
    });

    const { default: DashboardPage } = await import('../../app/page');
    await DashboardPage({
      searchParams: {
        source: 'live',
        historyDir: 'custom-history',
        marketLimit: '12',
        forecastDays: '3',
        minEdge: '0.07',
        maxPositionUsd: '55',
        refreshSeconds: '15',
      },
    });

    expect(buildDashboardDataMock).toHaveBeenCalledWith({
      source: 'live',
      operatorOptions: expect.objectContaining({
        startingCapital: 1000,
        marketLimit: 12,
        forecastDays: 3,
        minEdge: 0.07,
        kellyFraction: 0.5,
        maxPositionUsd: 55,
      }),
    });
  });
});
