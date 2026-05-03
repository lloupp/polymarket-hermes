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

  describe('wallet hydration', () => {
    it('restores cash and realizedPnl from initial state', () => {
      const wallet = new PaperWallet({
        startingCapital: 1000,
        initialCash: 800,
        initialRealizedPnl: 50,
      });

      expect(wallet.snapshot()).toEqual({
        startingCapital: 1000,
        cash: 800,
        realizedPnl: 50,
        openPositions: 0,
      });
    });

    it('restores open positions from initial state', () => {
      const openPosition = {
        id: 'paper-3',
        marketId: 'm1',
        outcome: 'YES' as const,
        entryPrice: 0.4,
        shares: 10,
        notional: 4,
        openedAt: '2026-04-28T18:30:00Z',
        status: 'OPEN' as const,
      };

      const wallet = new PaperWallet({
        startingCapital: 1000,
        initialCash: 996,
        initialRealizedPnl: 0,
        initialPositions: [openPosition],
      });

      expect(wallet.snapshot()).toEqual({
        startingCapital: 1000,
        cash: 996,
        realizedPnl: 0,
        openPositions: 1,
      });

      const positions = wallet.listPositions();
      expect(positions).toHaveLength(1);
      expect(positions[0]!.marketId).toBe('m1');
      expect(positions[0]!.status).toBe('OPEN');
    });

    it('continues position ID counter from hydrated positions', () => {
      const openPosition = {
        id: 'paper-5',
        marketId: 'm1',
        outcome: 'YES' as const,
        entryPrice: 0.3,
        shares: 20,
        notional: 6,
        openedAt: '2026-04-28T18:30:00Z',
        status: 'OPEN' as const,
      };

      const wallet = new PaperWallet({
        startingCapital: 1000,
        initialCash: 994,
        initialPositions: [openPosition],
      });

      // Next position should get ID paper-6
      const newPosition = wallet.openPosition({
        marketId: 'm2',
        outcome: 'NO',
        entryPrice: 0.5,
        shares: 10,
        openedAt: '2026-04-28T20:00:00Z',
      });

      expect(newPosition.id).toBe('paper-6');
      expect(wallet.snapshot().openPositions).toBe(2);
    });

    it('can close a hydrated position', () => {
      const openPosition = {
        id: 'paper-2',
        marketId: 'm1',
        outcome: 'YES' as const,
        entryPrice: 0.4,
        shares: 10,
        notional: 4,
        openedAt: '2026-04-28T18:30:00Z',
        status: 'OPEN' as const,
      };

      const wallet = new PaperWallet({
        startingCapital: 1000,
        initialCash: 996,
        initialPositions: [openPosition],
      });

      const closed = wallet.closePosition({
        positionId: 'paper-2',
        exitPrice: 0.6,
        closedAt: '2026-04-28T20:00:00Z',
        exitReason: 'take_profit',
      });

      expect(closed.realizedPnl).toBeCloseTo(2, 8);
      expect(wallet.snapshot().cash).toBeCloseTo(1002, 8);
      expect(wallet.snapshot().realizedPnl).toBeCloseTo(2, 8);
      expect(wallet.snapshot().openPositions).toBe(0);
    });

    it('does not mutate the original initialPositions array', () => {
      const openPosition = {
        id: 'paper-1',
        marketId: 'm1',
        outcome: 'YES' as const,
        entryPrice: 0.4,
        shares: 10,
        notional: 4,
        openedAt: '2026-04-28T18:30:00Z',
        status: 'OPEN' as const,
      };

      const original = [openPosition];
      const wallet = new PaperWallet({
        startingCapital: 1000,
        initialCash: 996,
        initialPositions: original,
      });

      // Closing should not affect the original array
      wallet.closePosition({
        positionId: 'paper-1',
        exitPrice: 0.6,
        closedAt: '2026-04-28T20:00:00Z',
      });

      expect(original[0]!.status).toBe('OPEN');
      expect(wallet.listPositions()[0]!.status).toBe('CLOSED');
    });
  });
});
