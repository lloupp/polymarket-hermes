import type { PaperPosition } from '../types/market';

export interface WinRateResult {
  totalResolved: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnl: number;
}

export function computeWinRate(closedPositions: PaperPosition[]): WinRateResult {
  const resolved = closedPositions.filter(
    (p) => p.status === 'CLOSED' && p.exitReason === 'market_resolved',
  );

  const wins = resolved.filter((p) => (p.realizedPnl ?? 0) > 0).length;
  const losses = resolved.filter((p) => (p.realizedPnl ?? 0) <= 0).length;
  const totalResolved = resolved.length;
  const winRate = totalResolved > 0 ? wins / totalResolved : 0;
  const totalPnl = resolved.reduce((sum, p) => sum + (p.realizedPnl ?? 0), 0);

  return { totalResolved, wins, losses, winRate, totalPnl };
}
