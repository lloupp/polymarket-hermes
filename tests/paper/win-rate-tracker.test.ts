import { describe, it, expect } from 'vitest';
import { computeWinRate } from '../../src/paper/win-rate-tracker';
import type { PaperPosition } from '../../src/types/market';

// Helper to create minimal PaperPosition objects
function makePosition(overrides: Partial<PaperPosition> & { id: string }): PaperPosition {
  return {
    marketId: 'm1',
    outcome: 'YES',
    entryPrice: 0.6,
    shares: 10,
    notional: 6,
    openedAt: '2026-05-01T12:00:00Z',
    status: 'CLOSED',
    exitPrice: 1.0,
    closedAt: '2026-05-02T12:00:00Z',
    exitReason: 'market_resolved',
    realizedPnl: 4,
    ...overrides,
  };
}

describe('computeWinRate', () => {
  it('computes win rate from resolved positions', () => {
    const positions = [
      makePosition({ id: '1', exitReason: 'market_resolved', realizedPnl: 4 }),   // win
      makePosition({ id: '2', exitReason: 'market_resolved', realizedPnl: -7 }),  // loss
      makePosition({ id: '3', exitReason: 'market_resolved', realizedPnl: 6 }),   // win
    ];
    const result = computeWinRate(positions);
    expect(result.totalResolved).toBe(3);
    expect(result.wins).toBe(2);
    expect(result.losses).toBe(1);
    expect(result.winRate).toBeCloseTo(0.6667, 3);
    expect(result.totalPnl).toBeCloseTo(3, 1);
  });

  it('ignores non-resolved exit reasons (take_profit, timeout, market_expired)', () => {
    const positions = [
      makePosition({ id: '1', exitReason: 'take_profit', realizedPnl: 2 }),
      makePosition({ id: '2', exitReason: 'timeout', realizedPnl: -1 }),
      makePosition({ id: '3', exitReason: 'market_expired', realizedPnl: 0 }),
    ];
    const result = computeWinRate(positions);
    expect(result.totalResolved).toBe(0);
    expect(result.wins).toBe(0);
    expect(result.losses).toBe(0);
    expect(result.winRate).toBe(0);
  });

  it('returns zeros for empty array', () => {
    const result = computeWinRate([]);
    expect(result.totalResolved).toBe(0);
    expect(result.wins).toBe(0);
    expect(result.losses).toBe(0);
    expect(result.winRate).toBe(0);
    expect(result.totalPnl).toBe(0);
  });

  it('only counts CLOSED positions with market_resolved', () => {
    const positions = [
      makePosition({ id: '1', status: 'OPEN', exitReason: undefined, realizedPnl: undefined }),
      makePosition({ id: '2', exitReason: 'market_resolved', realizedPnl: 5 }),
    ];
    const result = computeWinRate(positions);
    expect(result.totalResolved).toBe(1);
    expect(result.wins).toBe(1);
  });
});
