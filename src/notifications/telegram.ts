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

export interface CycleAlertData {
  runAt: string;
  totalMarkets: number;
  weatherMarkets: number;
  weatherForecasts: number;
  signalsApproved: number;
  signalsBlocked: number;
  positionsOpened: number;
  positionsClosed: number;
  errors?: string[];
}

export interface SignalAlertData {
  marketSlug: string;
  marketQuestion: string;
  side: string;
  price: number;
  edge: number;
  positionSizeUsd: number;
  reason: string;
}

export function formatCycleStartMessage(): string {
  return '🟢 <b>Paper Observer Starting</b>\nNew cycle starting now...';
}

export function formatCycleSummaryMessage(data: CycleAlertData): string {
  const lines: string[] = [];
  lines.push('📊 <b>Cycle Complete</b>');
  lines.push(`⏰ ${data.runAt}`);
  lines.push('');
  lines.push(`Markets analyzed: <b>${data.totalMarkets}</b>`);
  lines.push(`Weather markets: <b>${data.weatherMarkets}</b>`);
  lines.push(`Forecasts fetched: <b>${data.weatherForecasts}</b>`);
  lines.push('');
  lines.push(`Signals approved: <b>${data.signalsApproved}</b>`);
  lines.push(`Signals blocked: ${data.signalsBlocked}`);
  lines.push(`Positions opened: <b>${data.positionsOpened}</b>`);
  lines.push(`Positions closed: ${data.positionsClosed}`);

  if (data.errors && data.errors.length > 0) {
    lines.push('');
    lines.push(`⚠️ Errors: ${data.errors.length}`);
    for (const error of data.errors.slice(0, 3)) {
      lines.push(`  • ${error.slice(0, 100)}`);
    }
    if (data.errors.length > 3) {
      lines.push(`  ... and ${data.errors.length - 3} more`);
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

export function formatClosedPositionsMessage(positions: ClosedPositionAlertData[]): string {
  if (positions.length === 0) {
    return '';
  }

 if (positions.length === 1) {
 const p = positions[0];
 const pnlEmoji = p.realizedPnl >= 0 ? '📈' : '📉';
 const pnlFormatted = p.realizedPnl >= 0
 ? `+$${p.realizedPnl.toFixed(2)}`
 : `-$${Math.abs(p.realizedPnl).toFixed(2)}`;
 return [
 `💼 <b>Paper Position Closed</b>`,
 `${p.marketQuestion.slice(0, 80)}`,
 ``,
 `Side: <b>${p.outcome}</b>`,
 `Entry: ${p.entryPrice.toFixed(4)} → Exit: ${p.exitPrice.toFixed(4)}`,
 `Shares: ${p.shares.toFixed(2)} | Notional: $${p.notional.toFixed(2)}`,
 `Reason: ${p.exitReason}`,
 `${pnlEmoji} PnL: <b>${pnlFormatted}</b>`,
 ].join('\n');
 }

  const lines: string[] = [];
  lines.push(`💼 <b>${positions.length} Paper Positions Closed</b>`);
  lines.push('');

 let totalPnl = 0;
 for (const p of positions) {
 totalPnl += p.realizedPnl;
 const pnlStr = p.realizedPnl >= 0
 ? `+$${p.realizedPnl.toFixed(2)}`
 : `-$${Math.abs(p.realizedPnl).toFixed(2)}`;
 lines.push(
 `• ${p.outcome} ${p.marketQuestion.slice(0, 40)} — ${p.exitReason} | ${pnlStr}`,
 );
 }

 const totalStr = totalPnl >= 0
 ? `+$${totalPnl.toFixed(2)}`
 : `-$${Math.abs(totalPnl).toFixed(2)}`;
 lines.push('');
 lines.push(`Total PnL: <b>${totalStr}</b>`);

  return lines.join('\n');
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

export function formatMarketResolvedMessage(resolved: MarketResolvedAlertData[]): string {
  if (resolved.length === 0) {
    return '';
  }

  if (resolved.length === 1) {
    const r = resolved[0];
    const won = r.outcome === r.winningOutcome;
    const emoji = won ? '🏆' : '❌';
    const pnlStr = r.realizedPnl >= 0
      ? `+$${r.realizedPnl.toFixed(2)}`
      : `-$${Math.abs(r.realizedPnl).toFixed(2)}`;
    return [
      `🏁 <b>Market Resolved</b>`,
      `${r.marketQuestion.slice(0, 80)}`,
      ``,
      `Your side: <b>${r.outcome}</b> | Winner: <b>${r.winningOutcome}</b> ${emoji}`,
      `Entry: ${r.entryPrice.toFixed(4)} → Exit: ${r.exitPrice.toFixed(4)}`,
      `Shares: ${r.shares.toFixed(2)}`,
      `PnL: <b>${pnlStr}</b>`,
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
    const pnlStr = r.realizedPnl >= 0
      ? `+$${r.realizedPnl.toFixed(2)}`
      : `-$${Math.abs(r.realizedPnl).toFixed(2)}`;
    lines.push(
      `• ${emoji} ${r.outcome} ${r.marketQuestion.slice(0, 40)} → ${r.winningOutcome} won | ${pnlStr}`,
    );
  }

  const totalStr = totalPnl >= 0
    ? `+$${totalPnl.toFixed(2)}`
    : `-$${Math.abs(totalPnl).toFixed(2)}`;
  lines.push('');
  lines.push(`Total PnL: <b>${totalStr}</b>`);

  return lines.join('\n');
}

export function formatCriticalErrorMessage(error: string): string {
  return `🔴 <b>Critical Error</b>\n${error.slice(0, 400)}`;
}
