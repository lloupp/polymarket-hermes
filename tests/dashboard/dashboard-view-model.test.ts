import { describe, expect, it } from 'vitest';
import { buildDashboardViewModel } from '../../src/dashboard/view-model';
import type { Market, OperationalBlockReason, PaperPosition } from '../../src/types/market';
import type { PaperWalletSnapshot } from '../../src/types/paper';

const wallet: PaperWalletSnapshot = {
  startingCapital: 1000,
  cash: 996,
  realizedPnl: 12,
  openPositions: 1,
};

const positions: PaperPosition[] = [
  {
    id: 'p1',
    marketId: 'm1',
    outcome: 'YES',
    entryPrice: 0.4,
    shares: 10,
    notional: 4,
    openedAt: '2026-04-28T18:30:00Z',
    status: 'CLOSED',
    closedAt: '2026-04-28T20:00:00Z',
    exitPrice: 0.52,
    exitReason: 'take_profit',
    realizedPnl: 1.2,
  },
  {
    id: 'p2',
    marketId: 'm2',
    outcome: 'NO',
    entryPrice: 0.35,
    shares: 8,
    notional: 2.8,
    openedAt: '2026-04-28T21:00:00Z',
    status: 'OPEN',
  },
];

const markets: Market[] = [
  {
    id: 'm1',
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
];

const operationalBlocks: Array<{
  marketId: string;
  reason: OperationalBlockReason;
  yesPrice: number;
  threshold: number;
  decisionEdge: number;
}> = [
  {
    marketId: 'm3',
    reason: 'blocked_by_min_yes_price',
    yesPrice: 0.0005,
    threshold: 0.02,
    decisionEdge: 0.99,
  },
  {
    marketId: 'm4',
    reason: 'blocked_by_min_repricing_edge',
    yesPrice: 0.72,
    threshold: 0.08,
    decisionEdge: 0.06,
  },
];

describe('buildDashboardViewModel', () => {
  it('builds summary cards and tables for the visual dashboard', () => {
    const model = buildDashboardViewModel({
      wallet,
      positions,
      analyzedMarkets: markets,
      approvedSignals: 3,
      blockedSignals: 5,
      closedPositions: 2,
      operationalBlocks,
      recentDecisions: [
        'BUY_YES m1 edge=0.11',
        'HOLD m2 edge=0.01',
      ],
    });

    expect(model.summaryCards).toEqual([
      { label: 'Wallet Equity', value: '$1008.00' },
      { label: 'Cash', value: '$996.00' },
      { label: 'Realized PnL', value: '$12.00' },
      { label: 'Open Positions', value: '1' },
      { label: 'Closed Positions', value: '2' },
      { label: 'Analyzed Markets', value: '1' },
      { label: 'Signals Approved', value: '3' },
      { label: 'Signals Blocked', value: '5' },
    ]);

    expect(model.openPositionRows).toEqual([
      {
        marketId: 'm2',
        outcome: 'NO',
        entryPrice: '0.35',
        shares: '8.00',
        notional: '$2.80',
        status: 'OPEN',
        exitReason: undefined,
      },
    ]);
    expect(model.closedPositionRows).toEqual([
      {
        marketId: 'm1',
        outcome: 'YES',
        entryPrice: '0.40',
        shares: '10.00',
        notional: '$4.00',
        status: 'CLOSED',
        exitReason: 'take_profit',
      },
    ]);
    expect(model.marketRows[0]?.question).toContain('NYC');
    expect(model.marketRows[0]?.discoverySource).toBe('public_search');
    expect(model.marketRows[0]?.discoveryQuery).toBe('snow in');
    expect(model.recentDecisions).toHaveLength(2);
    expect(model.operationalBlockSummary).toEqual([
      { reason: 'blocked_by_min_yes_price', count: '1' },
      { reason: 'blocked_by_min_repricing_edge', count: '1' },
    ]);
    expect(model.operationalBlockRows).toEqual([
      {
        marketId: 'm3',
        reason: 'blocked_by_min_yes_price',
        yesPrice: '0.0005',
        threshold: '0.0200',
        decisionEdge: '0.99',
      },
      {
        marketId: 'm4',
        reason: 'blocked_by_min_repricing_edge',
        yesPrice: '0.7200',
        threshold: '0.0800',
        decisionEdge: '0.06',
      },
    ]);
  });
});
