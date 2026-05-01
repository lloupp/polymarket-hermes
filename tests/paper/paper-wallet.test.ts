import { describe, expect, it } from 'vitest';
import { PaperWallet } from '../../src/paper/paper-wallet';

describe('PaperWallet', () => {
  it('starts with full cash and no open positions', () => {
    const wallet = new PaperWallet({ startingCapital: 1000 });

    expect(wallet.snapshot()).toEqual({
      startingCapital: 1000,
      cash: 1000,
      realizedPnl: 0,
      openPositions: 0,
    });
  });

  it('opens a simulated position and reduces cash by notional', () => {
    const wallet = new PaperWallet({ startingCapital: 1000 });

    const position = wallet.openPosition({
      marketId: 'm1',
      outcome: 'YES',
      entryPrice: 0.4,
      shares: 10,
      openedAt: '2026-04-28T18:30:00Z',
    });

    expect(position.notional).toBeCloseTo(4, 8);
    expect(wallet.snapshot().cash).toBeCloseTo(996, 8);
    expect(wallet.snapshot().openPositions).toBe(1);
  });

  it('closes a position and realizes pnl', () => {
    const wallet = new PaperWallet({ startingCapital: 1000 });

    const position = wallet.openPosition({
      marketId: 'm1',
      outcome: 'YES',
      entryPrice: 0.4,
      shares: 10,
      openedAt: '2026-04-28T18:30:00Z',
    });

    const closed = wallet.closePosition({
      positionId: position.id,
      exitPrice: 0.7,
      closedAt: '2026-04-28T19:00:00Z',
    });

    expect(closed.realizedPnl).toBeCloseTo(3, 8);
    expect(wallet.snapshot()).toEqual({
      startingCapital: 1000,
      cash: 1003,
      realizedPnl: 3,
      openPositions: 0,
    });
  });

  it('lists positions including closed ones for audit trail', () => {
    const wallet = new PaperWallet({ startingCapital: 1000 });

    const position = wallet.openPosition({
      marketId: 'm1',
      outcome: 'YES',
      entryPrice: 0.4,
      shares: 10,
      openedAt: '2026-04-28T18:30:00Z',
    });

    wallet.closePosition({
      positionId: position.id,
      exitPrice: 0.55,
      closedAt: '2026-04-28T19:00:00Z',
      exitReason: 'take_profit',
    });

    expect(wallet.listPositions()).toEqual([
      {
        id: position.id,
        marketId: 'm1',
        outcome: 'YES',
        entryPrice: 0.4,
        shares: 10,
        notional: 4,
        openedAt: '2026-04-28T18:30:00Z',
        status: 'CLOSED',
        exitPrice: 0.55,
        closedAt: '2026-04-28T19:00:00Z',
        exitReason: 'take_profit',
        realizedPnl: 1.5,
      },
    ]);
  });
});
