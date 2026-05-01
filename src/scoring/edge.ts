import type { MarketSignal } from '../types/market';

export interface DecideSignalInput {
  edge: number;
  minEdge: number;
}

export function calculateEdge(adjustedScore: number, yesPrice: number): number {
  return adjustedScore - yesPrice;
}

export function decideSignal({ edge, minEdge }: DecideSignalInput): MarketSignal {
  if (edge >= minEdge) {
    return 'BUY_YES';
  }

  if (edge <= -minEdge) {
    return 'BUY_NO';
  }

  return 'HOLD';
}
