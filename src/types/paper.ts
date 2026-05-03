import type { PaperPosition } from './market';

export interface PaperWalletSnapshot {
  startingCapital: number;
  cash: number;
  realizedPnl: number;
  openPositions: number;
}

export interface PaperWalletState {
  startingCapital: number;
  cash: number;
  realizedPnl: number;
  positions: PaperPosition[];
  nextId: number;
}
