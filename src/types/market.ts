export type MarketSignal = 'BUY_YES' | 'BUY_NO' | 'HOLD';
export type PositionOutcome = 'YES' | 'NO';
export type PositionStatus = 'OPEN' | 'CLOSED';
export type PositionExitReason = 'take_profit' | 'timeout' | 'manual' | 'market_resolved' | 'market_expired';
export type OperationalBlockReason = 'blocked_by_min_yes_price' | 'blocked_by_min_repricing_edge';

export type MarketDiscoverySource = 'base' | 'public_search';

export interface Market {
  id: string;
  slug: string;
  question: string;
  category: string;
  yesPrice: number;
  noPrice: number;
  liquidity: number;
  volume24h: number;
  closesAt: string;
  tags: string[];
  discoverySource?: MarketDiscoverySource;
  discoveryQuery?: string;
}

export interface MarketDecision {
  marketId: string;
  signal: MarketSignal;
  adjustedScore: number;
  edge: number;
  reason: string;
}

export interface PaperPosition {
  id: string;
  marketId: string;
  outcome: PositionOutcome;
  entryPrice: number;
  shares: number;
  notional: number;
  openedAt: string;
  status: PositionStatus;
  closedAt?: string;
  exitPrice?: number;
  exitReason?: PositionExitReason;
  realizedPnl?: number;
}
