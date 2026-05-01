import { describe, expect, it } from 'vitest';
import type { Market, MarketDecision, PaperPosition } from '../../src/types/market';
import type { PaperWalletSnapshot } from '../../src/types/paper';

describe('domain types', () => {
  it('allows market-shaped objects', () => {
    const market: Market = {
      id: 'm1',
      slug: 'will-it-rain',
      question: 'Will it rain tomorrow?',
      category: 'weather',
      yesPrice: 0.42,
      noPrice: 0.58,
      liquidity: 12000,
      volume24h: 5000,
      closesAt: '2026-04-29T00:00:00Z',
      tags: ['weather', 'rain'],
    };

    expect(market.slug).toBe('will-it-rain');
  });

  it('allows market decisions and paper positions', () => {
    const decision: MarketDecision = {
      marketId: 'm1',
      signal: 'BUY_YES',
      adjustedScore: 0.63,
      edge: 0.21,
      reason: 'forecast above market price',
    };

    const position: PaperPosition = {
      id: 'p1',
      marketId: 'm1',
      outcome: 'YES',
      entryPrice: 0.42,
      shares: 10,
      notional: 4.2,
      openedAt: '2026-04-28T18:00:00Z',
      status: 'OPEN',
    };

    const wallet: PaperWalletSnapshot = {
      startingCapital: 1000,
      cash: 995.8,
      realizedPnl: 0,
      openPositions: 1,
    };

    expect(decision.signal).toBe('BUY_YES');
    expect(position.status).toBe('OPEN');
    expect(wallet.startingCapital).toBe(1000);
  });
});
