import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('../../src/dashboard/dashboard-data', () => ({
  buildDashboardData: vi.fn(async () => ({
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
    forecastRows: [],
    outputLines: [],
  })),
}));

describe('DashboardPage', () => {
  it('renders discovery source and query for weather markets in the visual UI', async () => {
    const { default: DashboardPage } = await import('../../app/page');
    const markup = renderToStaticMarkup(await DashboardPage());

    expect(markup).toContain('Discovery');
    expect(markup).toContain('public_search');
    expect(markup).toContain('highest temperature in');
  });
});
