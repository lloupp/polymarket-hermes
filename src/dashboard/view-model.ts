import type { Market, OperationalBlockReason, PaperPosition } from '../types/market';
import type { PaperWalletSnapshot } from '../types/paper';

export interface DashboardSummaryCard {
  label: string;
  value: string;
}

export interface DashboardPositionRow {
  marketId: string;
  outcome: string;
  entryPrice: string;
  shares: string;
  notional: string;
  status: string;
  exitReason?: string;
}

export interface DashboardMarketRow {
  marketId: string;
  question: string;
  category: string;
  yesPrice: string;
  liquidity: string;
  volume24h: string;
  closesAt: string;
  discoverySource?: string;
  discoveryQuery?: string;
}

export interface DashboardOperationalBlockSummaryRow {
  reason: OperationalBlockReason;
  count: string;
}

export interface DashboardOperationalBlockRow {
  marketId: string;
  reason: OperationalBlockReason;
  yesPrice: string;
  threshold: string;
  decisionEdge: string;
}

export interface DashboardViewModel {
  summaryCards: DashboardSummaryCard[];
  openPositionRows: DashboardPositionRow[];
  closedPositionRows: DashboardPositionRow[];
  marketRows: DashboardMarketRow[];
  recentDecisions: string[];
  operationalBlockSummary: DashboardOperationalBlockSummaryRow[];
  operationalBlockRows: DashboardOperationalBlockRow[];
}

export interface BuildDashboardViewModelInput {
  wallet: PaperWalletSnapshot;
  positions: PaperPosition[];
  analyzedMarkets: Market[];
  approvedSignals: number;
  blockedSignals: number;
  closedPositions: number;
  operationalBlocks: Array<{
    marketId: string;
    reason: OperationalBlockReason;
    yesPrice: number;
    threshold: number;
    decisionEdge: number;
  }>;
  recentDecisions: string[];
}

function formatUsd(value: number): string {
  return `$${value.toFixed(2)}`;
}

function formatFixed(value: number, digits: number): string {
  return value.toFixed(digits);
}

export function buildDashboardViewModel(input: BuildDashboardViewModelInput): DashboardViewModel {
  const walletEquity = input.wallet.cash + input.wallet.realizedPnl;
  const positionRows = input.positions.map((position) => ({
    marketId: position.marketId,
    outcome: position.outcome,
    entryPrice: position.entryPrice.toFixed(2),
    shares: position.shares.toFixed(2),
    notional: formatUsd(position.notional),
    status: position.status,
    exitReason: position.exitReason,
  }));
  const operationalBlockCounts = new Map<OperationalBlockReason, number>();

  for (const block of input.operationalBlocks) {
    operationalBlockCounts.set(block.reason, (operationalBlockCounts.get(block.reason) ?? 0) + 1);
  }

  return {
    summaryCards: [
      { label: 'Wallet Equity', value: formatUsd(walletEquity) },
      { label: 'Cash', value: formatUsd(input.wallet.cash) },
      { label: 'Realized PnL', value: formatUsd(input.wallet.realizedPnl) },
      { label: 'Open Positions', value: String(input.wallet.openPositions) },
      { label: 'Closed Positions', value: String(input.closedPositions) },
      { label: 'Analyzed Markets', value: String(input.analyzedMarkets.length) },
      { label: 'Signals Approved', value: String(input.approvedSignals) },
      { label: 'Signals Blocked', value: String(input.blockedSignals) },
    ],
    openPositionRows: positionRows.filter((position) => position.status === 'OPEN'),
    closedPositionRows: positionRows.filter((position) => position.status === 'CLOSED'),
    marketRows: input.analyzedMarkets.map((market) => ({
      marketId: market.id,
      question: market.question,
      category: market.category,
      yesPrice: market.yesPrice.toFixed(2),
      liquidity: formatUsd(market.liquidity),
      volume24h: formatUsd(market.volume24h),
      closesAt: market.closesAt,
      discoverySource: market.discoverySource,
      discoveryQuery: market.discoveryQuery,
    })),
    recentDecisions: input.recentDecisions,
    operationalBlockSummary: Array.from(operationalBlockCounts.entries()).map(([reason, count]) => ({
      reason,
      count: String(count),
    })),
    operationalBlockRows: input.operationalBlocks.map((block) => ({
      marketId: block.marketId,
      reason: block.reason,
      yesPrice: formatFixed(block.yesPrice, 4),
      threshold: formatFixed(block.threshold, 4),
      decisionEdge: formatFixed(block.decisionEdge, 2),
    })),
  };
}
