export interface TelegramConfig {
  enabled: boolean;
  botToken: string;
  chatId: string;
}

export interface TelegramNotifyOptions {
  fetcher?: typeof fetch;
}

function maskToken(token: string): string {
  if (token.length <= 8) {
    return '***';
  }
  return `${token.slice(0, 4)}...${token.slice(-4)}`;
}

/** Format ISO timestamp to a readable UTC string */
function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
  } catch {
    return iso;
  }
}

/** Format a PnL value with sign and dollar */
function formatPnl(value: number): string {
  return value >= 0
    ? `+$${value.toFixed(2)}`
    : `-$${Math.abs(value).toFixed(2)}`;
}

/** Format a dollar value */
function formatUsd(value: number): string {
  return `$${value.toFixed(2)}`;
}

export function loadTelegramConfigFromEnv(
  env: Record<string, string | undefined>,
): TelegramConfig {
  const rawEnabled = env.TELEGRAM_ENABLED ?? '';
  const enabled = ['1', 'true', 'yes', 'on'].includes(rawEnabled.trim().toLowerCase());
  const botToken = env.TELEGRAM_BOT_TOKEN ?? '';
  const chatId = env.TELEGRAM_CHAT_ID ?? '';

  return { enabled, botToken, chatId };
}

export function resolveTelegramConfig(config: TelegramConfig): TelegramConfig {
  if (config.enabled && (!config.botToken || !config.chatId)) {
    console.warn(
      '[telegram] TELEGRAM_ENABLED=true but TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is missing — Telegram notifications disabled',
    );
    return { ...config, enabled: false };
  }

  if (config.enabled) {
    console.info(`[telegram] notifications enabled (token=${maskToken(config.botToken)})`);
  } else {
    console.info('[telegram] notifications disabled');
  }

  return config;
}

export async function sendTelegramMessage(
  config: TelegramConfig,
  text: string,
  options?: TelegramNotifyOptions,
): Promise<boolean> {
  if (!config.enabled) {
    return false;
  }

  if (!config.botToken || !config.chatId) {
    console.warn('[telegram] missing bot token or chat id — skipping message');
    return false;
  }

  const url = `https://api.telegram.org/bot${config.botToken}/sendMessage`;
  const body = JSON.stringify({
    chat_id: config.chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  });

  try {
    const fetchFn = options?.fetcher ?? fetch;
    const response = await fetchFn(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => 'unknown');
      console.error(
        `[telegram] API error ${response.status}: ${errorBody.slice(0, 200)}`,
      );
      return false;
    }

    return true;
  } catch (error) {
    console.error(
      `[telegram] network error: ${(error as Error)?.message ?? String(error)}`,
    );
    return false;
  }
}

export interface TelegramNotifier {
  send(text: string): Promise<boolean>;
  isEnabled(): boolean;
}

export function createTelegramNotifier(
  config: TelegramConfig,
  options?: TelegramNotifyOptions,
): TelegramNotifier {
  return {
    send(text: string): Promise<boolean> {
      return sendTelegramMessage(config, text, options);
    },
    isEnabled(): boolean {
      return config.enabled;
    },
  };
}

// ─── Data Interfaces ────────────────────────────────────────────────

export interface SignalAlertData {
  marketSlug: string;
  marketQuestion: string;
  side: string;
  price: number;
  edge: number;
  positionSizeUsd: number;
  reason: string;
}

export interface ClosedPositionAlertData {
  marketQuestion: string;
  outcome: string;
  entryPrice: number;
  exitPrice: number;
  shares: number;
  notional: number;
  realizedPnl: number;
  exitReason: string;
}

export interface MarketResolvedAlertData {
  marketQuestion: string;
  outcome: string;
  winningOutcome: string;
  entryPrice: number;
  exitPrice: number;
  shares: number;
  realizedPnl: number;
}

export interface CycleAlertData {
  runAt: string;
  totalMarkets: number;
  weatherMarkets: number;
  weatherForecasts: number;
  signalsApproved: number;
  signalsBlocked: number;
  positionsOpened: number;
  positionsClosed: number;
  /** Current wallet balance (cash + positions value) */
  walletBalance?: number;
  /** Starting capital for reference */
  startingCapital?: number;
  /** Cumulative realized PnL across all closed positions */
  totalPnl?: number;
  /** Open positions count */
  openPositions?: number;
  /** Win rate percentage (0-100) among resolved positions */
  winRate?: number;
  /** Number of resolved wins */
  wins?: number;
  /** Number of resolved losses */
  losses?: number;
  errors?: string[];
  /** Approved signals detail (for inline display) */
  signals?: SignalAlertData[];
  /** Closed positions detail (for inline display) */
  closedPositions?: (ClosedPositionAlertData | MarketResolvedAlertData)[];
}

// ─── Format Functions ────────────────────────────────────────────────

export function formatCycleStartMessage(): string {
  return '🟢 <b>Paper Observer Starting</b>\nNew cycle starting now...';
}

export function formatCycleSummaryMessage(data: CycleAlertData): string {
  const lines: string[] = [];

  // ── Header ──
  lines.push('📊 <b>Cycle Report</b>');
  lines.push(`⏰ ${formatTimestamp(data.runAt)}`);

  // ── Wallet ──
  if (data.walletBalance !== undefined) {
    const pnl = data.totalPnl;
    const pnlStr = pnl !== undefined ? ` (${formatPnl(pnl)})` : '';
    const balEmoji = (pnl !== undefined && pnl >= 0) ? '🟢' : '🔴';
    lines.push(`${balEmoji} Wallet: <b>${formatUsd(data.walletBalance)}</b>${pnlStr}`);
    if (data.startingCapital !== undefined && data.startingCapital > 0) {
      const pctReturn = ((data.walletBalance - data.startingCapital) / data.startingCapital) * 100;
      lines.push(`📈 Return: <b>${pctReturn >= 0 ? '+' : ''}${pctReturn.toFixed(1)}%</b>`);
    }
  }

  // ── Win Rate ──
  if (data.winRate !== undefined) {
    const wrEmoji = data.winRate >= 50 ? '✅' : '⚠️';
    lines.push(`${wrEmoji} Win Rate: <b>${data.winRate.toFixed(0)}%</b> (${data.wins ?? 0}W / ${data.losses ?? 0}L)`);
  }

  // ── Positions ──
  lines.push('');
  lines.push('▫️ <b>Positions</b>');
  lines.push(`  Open: <b>${data.openPositions ?? 0}</b> | New: <b>${data.positionsOpened}</b> | Closed: <b>${data.positionsClosed}</b>`);

  // ── Scan ──
  lines.push('');
  lines.push('🔍 <b>Scan</b>');
  lines.push(`  Markets: ${data.totalMarkets} | Weather: ${data.weatherMarkets} | Forecasts: ${data.weatherForecasts}`);
  lines.push(`  Signals: ✅${data.signalsApproved} approved / 🚫${data.signalsBlocked} blocked`);

  // ── Signals inline ──
  if (data.signals && data.signals.length > 0) {
    lines.push('');
    lines.push('🔔 <b>Signals</b>');
    for (const s of data.signals) {
      const sideEmoji = s.side === 'BUY_YES' ? '🟢' : s.side === 'BUY_NO' ? '🔴' : '⚪';
      lines.push(`  ${sideEmoji} <b>${s.side}</b> ${s.marketQuestion.slice(0, 45)}`);
      lines.push(`     Price: ${s.price.toFixed(3)} | Edge: ${(s.edge * 100).toFixed(1)}% | $${s.positionSizeUsd.toFixed(0)}`);
    }
  }

  // ── Closed positions inline ──
  if (data.closedPositions && data.closedPositions.length > 0) {
    lines.push('');
    lines.push('💼 <b>Closed This Cycle</b>');
    for (const pos of data.closedPositions) {
      if ('winningOutcome' in pos) {
        // MarketResolvedAlertData
        const r = pos as MarketResolvedAlertData;
        const won = r.outcome === r.winningOutcome;
        const emoji = won ? '🏆' : '❌';
        lines.push(`  ${emoji} <b>${r.outcome}</b> ${r.marketQuestion.slice(0, 35)} → ${r.winningOutcome} | ${formatPnl(r.realizedPnl)}`);
      } else {
        // ClosedPositionAlertData
        const p = pos as ClosedPositionAlertData;
        const pnlEmoji = p.realizedPnl >= 0 ? '📈' : '📉';
        lines.push(`  ${pnlEmoji} <b>${p.outcome}</b> ${p.marketQuestion.slice(0, 35)} (${p.exitReason}) | ${formatPnl(p.realizedPnl)}`);
      }
    }
  }

  // ── Errors ──
  if (data.errors && data.errors.length > 0) {
    lines.push('');
    lines.push(`⚠️ <b>Errors: ${data.errors.length}</b>`);
    for (const error of data.errors.slice(0, 3)) {
      lines.push(`  • ${error.slice(0, 80)}`);
    }
    if (data.errors.length > 3) {
      lines.push(`  ... +${data.errors.length - 3} more`);
    }
  }

  return lines.join('\n');
}

export function formatSignalMessage(data: SignalAlertData): string {
  const lines: string[] = [];
  lines.push('🔔 <b>Signal Detected</b>');
  lines.push(
    `<b>${data.side}</b> — ${data.marketQuestion.slice(0, 80)}`,
  );
  lines.push('');
  lines.push(`Price: ${data.price.toFixed(4)}`);
  lines.push(`Edge: ${data.edge.toFixed(4)}`);
  lines.push(`Sizing: $${data.positionSizeUsd.toFixed(2)}`);
  lines.push(`Reason: ${data.reason}`);

  return lines.join('\n');
}

export function formatSignalsBatchMessage(signals: SignalAlertData[]): string {
  if (signals.length === 0) {
    return '';
  }

  if (signals.length === 1) {
    return formatSignalMessage(signals[0]);
  }

  const lines: string[] = [];
  lines.push(`🔔 <b>${signals.length} Signals Detected</b>`);
  lines.push('');

  for (const signal of signals) {
    lines.push(
      `• <b>${signal.side}</b> ${signal.marketQuestion.slice(0, 50)} — edge=${signal.edge.toFixed(3)} size=$${signal.positionSizeUsd.toFixed(0)}`,
    );
  }

  return lines.join('\n');
}

export function formatClosedPositionsMessage(positions: ClosedPositionAlertData[]): string {
  if (positions.length === 0) {
    return '';
  }

  if (positions.length === 1) {
    const p = positions[0];
    const pnlEmoji = p.realizedPnl >= 0 ? '📈' : '📉';
    return [
      `💼 <b>Paper Position Closed</b>`,
      `${p.marketQuestion.slice(0, 80)}`,
      ``,
      `Side: <b>${p.outcome}</b>`,
      `Entry: ${p.entryPrice.toFixed(4)} → Exit: ${p.exitPrice.toFixed(4)}`,
      `Shares: ${p.shares.toFixed(2)} | Notional: $${p.notional.toFixed(2)}`,
      `Reason: ${p.exitReason}`,
      `${pnlEmoji} PnL: <b>${formatPnl(p.realizedPnl)}</b>`,
    ].join('\n');
  }

  const lines: string[] = [];
  lines.push(`💼 <b>${positions.length} Paper Positions Closed</b>`);
  lines.push('');

  let totalPnl = 0;
  for (const p of positions) {
    totalPnl += p.realizedPnl;
    lines.push(
      `• ${p.outcome} ${p.marketQuestion.slice(0, 40)} — ${p.exitReason} | ${formatPnl(p.realizedPnl)}`,
    );
  }

  lines.push('');
  lines.push(`Total PnL: <b>${formatPnl(totalPnl)}</b>`);

  return lines.join('\n');
}

export function formatMarketResolvedMessage(resolved: MarketResolvedAlertData[]): string {
  if (resolved.length === 0) {
    return '';
  }

  if (resolved.length === 1) {
    const r = resolved[0];
    const won = r.outcome === r.winningOutcome;
    const emoji = won ? '🏆' : '❌';
    return [
      `🏁 <b>Market Resolved</b>`,
      `${r.marketQuestion.slice(0, 80)}`,
      ``,
      `Your side: <b>${r.outcome}</b> | Winner: <b>${r.winningOutcome}</b> ${emoji}`,
      `Entry: ${r.entryPrice.toFixed(4)} → Exit: ${r.exitPrice.toFixed(4)}`,
      `Shares: ${r.shares.toFixed(2)}`,
      `PnL: <b>${formatPnl(r.realizedPnl)}</b>`,
    ].join('\n');
  }

  const lines: string[] = [];
  lines.push(`🏁 <b>${resolved.length} Markets Resolved</b>`);
  lines.push('');

  let totalPnl = 0;
  for (const r of resolved) {
    totalPnl += r.realizedPnl;
    const won = r.outcome === r.winningOutcome;
    const emoji = won ? '✅' : '❌';
    lines.push(
      `• ${emoji} ${r.outcome} ${r.marketQuestion.slice(0, 40)} → ${r.winningOutcome} won | ${formatPnl(r.realizedPnl)}`,
    );
  }

  lines.push('');
  lines.push(`Total PnL: <b>${formatPnl(totalPnl)}</b>`);

  return lines.join('\n');
}

export function formatCriticalErrorMessage(error: string): string {
  return `🔴 <b>Critical Error</b>\n${error.slice(0, 400)}`;
}
