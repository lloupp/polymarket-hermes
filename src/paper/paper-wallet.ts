import type { PaperPosition, PositionExitReason, PositionOutcome } from '../types/market';
import type { PaperWalletSnapshot, PaperWalletState } from '../types/paper';

export interface PaperWalletOptions {
  startingCapital: number;
  state?: PaperWalletState;
}

export interface OpenPositionInput {
  marketId: string;
  outcome: PositionOutcome;
  entryPrice: number;
  shares: number;
  openedAt: string;
}

export interface ClosePositionInput {
  positionId: string;
  exitPrice: number;
  closedAt: string;
  exitReason?: PositionExitReason;
}

export class PaperWallet {
  private readonly startingCapital: number;
  private cash: number;
  private realizedPnl: number;
  private positions: PaperPosition[];
  private nextId: number;

  constructor({ startingCapital, state }: PaperWalletOptions) {
    this.startingCapital = state?.startingCapital ?? startingCapital;
    this.cash = state?.cash ?? startingCapital;
    this.realizedPnl = state?.realizedPnl ?? 0;
    this.positions = state?.positions.map((position) => ({ ...position })) ?? [];
    this.nextId = state?.nextId ?? 1;
  }

  snapshot(): PaperWalletSnapshot {
    return {
      startingCapital: this.startingCapital,
      cash: this.cash,
      realizedPnl: this.realizedPnl,
      openPositions: this.positions.filter((position) => position.status === 'OPEN').length,
    };
  }

  listPositions(): PaperPosition[] {
    return this.positions.map((position) => ({ ...position }));
  }

  getCash(): number {
    return this.cash;
  }

  exportState(): PaperWalletState {
    return {
      startingCapital: this.startingCapital,
      cash: this.cash,
      realizedPnl: this.realizedPnl,
      positions: this.listPositions(),
      nextId: this.nextId,
    };
  }

  openPosition(input: OpenPositionInput): PaperPosition {
    const notional = input.entryPrice * input.shares;

    if (notional > this.cash) {
      throw new Error('insufficient_cash');
    }

    this.cash -= notional;

    const position: PaperPosition = {
      id: `paper-${this.nextId++}`,
      marketId: input.marketId,
      outcome: input.outcome,
      entryPrice: input.entryPrice,
      shares: input.shares,
      notional,
      openedAt: input.openedAt,
      status: 'OPEN',
    };

    this.positions.push(position);
    return position;
  }

  closePosition(input: ClosePositionInput): PaperPosition {
    const position = this.positions.find((candidate) => candidate.id === input.positionId);

    if (!position || position.status !== 'OPEN') {
      throw new Error('open_position_not_found');
    }

    const proceeds = input.exitPrice * position.shares;
    const realizedPnl = proceeds - position.notional;

    position.status = 'CLOSED';
    position.exitPrice = input.exitPrice;
    position.closedAt = input.closedAt;
    position.exitReason = input.exitReason;
    position.realizedPnl = realizedPnl;

    this.cash += proceeds;
    this.realizedPnl += realizedPnl;

    return position;
  }
}
