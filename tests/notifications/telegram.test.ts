import { describe, it, expect, vi } from 'vitest';
import {
 loadTelegramConfigFromEnv,
 resolveTelegramConfig,
 sendTelegramMessage,
 createTelegramNotifier,
 formatCycleStartMessage,
 formatCycleSummaryMessage,
 formatSignalMessage,
 formatSignalsBatchMessage,
 formatClosedPositionsMessage,
 formatCriticalErrorMessage,
 type TelegramConfig,
} from '../../src/notifications/telegram';

describe('loadTelegramConfigFromEnv', () => {
  it('returns disabled config when env vars are missing', () => {
    const config = loadTelegramConfigFromEnv({});
    expect(config.enabled).toBe(false);
    expect(config.botToken).toBe('');
    expect(config.chatId).toBe('');
  });

  it('returns enabled config when TELEGRAM_ENABLED=true', () => {
    const config = loadTelegramConfigFromEnv({
      TELEGRAM_ENABLED: 'true',
      TELEGRAM_BOT_TOKEN: '123456:ABC',
      TELEGRAM_CHAT_ID: '999',
    });
    expect(config.enabled).toBe(true);
    expect(config.botToken).toBe('123456:ABC');
    expect(config.chatId).toBe('999');
  });

  it('recognizes various truthy values for TELEGRAM_ENABLED', () => {
    for (const value of ['1', 'true', 'yes', 'on']) {
      const config = loadTelegramConfigFromEnv({ TELEGRAM_ENABLED: value });
      expect(config.enabled).toBe(true);
    }
  });

  it('returns disabled for falsy values', () => {
    for (const value of ['0', 'false', 'no', 'off', 'maybe']) {
      const config = loadTelegramConfigFromEnv({ TELEGRAM_ENABLED: value });
      expect(config.enabled).toBe(false);
    }
  });
});

describe('resolveTelegramConfig', () => {
  it('disables when enabled but missing token', () => {
    const config = resolveTelegramConfig({
      enabled: true,
      botToken: '',
      chatId: '999',
    });
    expect(config.enabled).toBe(false);
  });

  it('disables when enabled but missing chat id', () => {
    const config = resolveTelegramConfig({
      enabled: true,
      botToken: '123:ABC',
      chatId: '',
    });
    expect(config.enabled).toBe(false);
  });

  it('keeps enabled when both token and chat id are present', () => {
    const config = resolveTelegramConfig({
      enabled: true,
      botToken: '123:ABC',
      chatId: '999',
    });
    expect(config.enabled).toBe(true);
  });

  it('keeps disabled when already disabled', () => {
    const config = resolveTelegramConfig({
      enabled: false,
      botToken: '',
      chatId: '',
    });
    expect(config.enabled).toBe(false);
  });
});

describe('sendTelegramMessage', () => {
  const disabledConfig: TelegramConfig = {
    enabled: false,
    botToken: '',
    chatId: '',
  };

  const enabledConfig: TelegramConfig = {
    enabled: true,
    botToken: '123456:ABC-DEF',
    chatId: '999',
  };

  it('returns false when Telegram is disabled', async () => {
    const result = await sendTelegramMessage(disabledConfig, 'test');
    expect(result).toBe(false);
  });

  it('returns false when token or chat id is missing', async () => {
    const result = await sendTelegramMessage(
      { enabled: true, botToken: '', chatId: '' },
      'test',
    );
    expect(result).toBe(false);
  });

  it('calls the Telegram API with correct parameters on success', async () => {
    const mockFetcher = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve('{"ok":true}'),
    });

    const result = await sendTelegramMessage(enabledConfig, 'Hello <b>world</b>', {
      fetcher: mockFetcher as unknown as typeof fetch,
    });

    expect(result).toBe(true);
    expect(mockFetcher).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetcher.mock.calls[0];
    expect(url).toContain('api.telegram.org/bot123456:ABC-DEF/sendMessage');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string);
    expect(body.chat_id).toBe('999');
    expect(body.text).toBe('Hello <b>world</b>');
    expect(body.parse_mode).toBe('HTML');
  });

  it('returns false and does not throw on API error', async () => {
    const mockFetcher = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: () => Promise.resolve('Too Many Requests'),
    });

    const result = await sendTelegramMessage(enabledConfig, 'test', {
      fetcher: mockFetcher as unknown as typeof fetch,
    });

    expect(result).toBe(false);
  });

  it('returns false and does not throw on network error', async () => {
    const mockFetcher = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

    const result = await sendTelegramMessage(enabledConfig, 'test', {
      fetcher: mockFetcher as unknown as typeof fetch,
    });

    expect(result).toBe(false);
  });
});

describe('createTelegramNotifier', () => {
  it('creates a notifier with isEnabled reflecting config', () => {
    const notifier = createTelegramNotifier({
      enabled: false,
      botToken: '',
      chatId: '',
    });
    expect(notifier.isEnabled()).toBe(false);
  });

  it('send returns false when disabled', async () => {
    const notifier = createTelegramNotifier({
      enabled: false,
      botToken: '',
      chatId: '',
    });
    const result = await notifier.send('test');
    expect(result).toBe(false);
  });
});

describe('format functions', () => {
  it('formatCycleStartMessage returns start message', () => {
    const msg = formatCycleStartMessage();
    expect(msg).toContain('Paper Observer Starting');
  });

  it('formatCycleSummaryMessage includes all key metrics', () => {
    const msg = formatCycleSummaryMessage({
      runAt: '2026-05-02T15:00:00Z',
      totalMarkets: 20,
      weatherMarkets: 15,
      weatherForecasts: 14,
      signalsApproved: 3,
      signalsBlocked: 11,
      positionsOpened: 1,
      positionsClosed: 0,
    });
    expect(msg).toContain('20');
    expect(msg).toContain('3');
    expect(msg).toContain('1');
    expect(msg).toContain('Cycle Complete');
  });

  it('formatCycleSummaryMessage includes errors when present', () => {
    const msg = formatCycleSummaryMessage({
      runAt: '2026-05-02T15:00:00Z',
      totalMarkets: 5,
      weatherMarkets: 5,
      weatherForecasts: 5,
      signalsApproved: 0,
      signalsBlocked: 5,
      positionsOpened: 0,
      positionsClosed: 0,
      errors: ['rate limit exceeded', 'timeout', 'connection reset', 'extra error'],
    });
    expect(msg).toContain('Errors: 4');
    expect(msg).toContain('rate limit exceeded');
    expect(msg).toContain('and 1 more');
  });

  it('formatSignalMessage includes all signal data', () => {
    const msg = formatSignalMessage({
      marketSlug: 'temp-london-may2',
      marketQuestion: 'Will the highest temperature in London be above 20°C on May 2?',
      side: 'BUY_YES',
      price: 0.45,
      edge: 0.12,
      positionSizeUsd: 50,
      reason: 'forecast_above_threshold',
    });
    expect(msg).toContain('Signal Detected');
    expect(msg).toContain('BUY_YES');
    expect(msg).toContain('0.4500');
    expect(msg).toContain('0.1200');
  });

  it('formatSignalsBatchMessage returns empty for empty array', () => {
    const msg = formatSignalsBatchMessage([]);
    expect(msg).toBe('');
  });

  it('formatSignalsBatchMessage uses single format for 1 signal', () => {
    const msg = formatSignalsBatchMessage([
      {
        marketSlug: 'test',
        marketQuestion: 'Test question?',
        side: 'BUY_YES',
        price: 0.5,
        edge: 0.1,
        positionSizeUsd: 25,
        reason: 'test',
      },
    ]);
    expect(msg).toContain('Signal Detected');
  });

  it('formatSignalsBatchMessage groups multiple signals', () => {
    const msg = formatSignalsBatchMessage([
      {
        marketSlug: 'a',
        marketQuestion: 'Question A?',
        side: 'BUY_YES',
        price: 0.4,
        edge: 0.1,
        positionSizeUsd: 25,
        reason: 'r1',
      },
      {
        marketSlug: 'b',
        marketQuestion: 'Question B?',
        side: 'BUY_NO',
        price: 0.6,
        edge: 0.05,
        positionSizeUsd: 15,
        reason: 'r2',
      },
    ]);
    expect(msg).toContain('2 Signals Detected');
    expect(msg).toContain('BUY_YES');
    expect(msg).toContain('BUY_NO');
  });

 it('formatCriticalErrorMessage formats error text', () => {
 const msg = formatCriticalErrorMessage('Connection refused to API');
 expect(msg).toContain('Critical Error');
 expect(msg).toContain('Connection refused');
 });
});

describe('formatClosedPositionsMessage', () => {
 it('returns empty for empty array', () => {
 expect(formatClosedPositionsMessage([])).toBe('');
 });

 it('formats single closed position with profit', () => {
 const msg = formatClosedPositionsMessage([
 {
 marketQuestion: 'Will London reach 25°C on May 5?',
 outcome: 'YES',
 entryPrice: 0.35,
 exitPrice: 0.90,
 shares: 100,
 notional: 35,
 realizedPnl: 55,
 exitReason: 'target_reached',
 },
 ]);
 expect(msg).toContain('Paper Position Closed');
 expect(msg).toContain('YES');
 expect(msg).toContain('0.3500');
 expect(msg).toContain('0.9000');
 expect(msg).toContain('target_reached');
 expect(msg).toContain('+$55.00');
 expect(msg).toContain('📈');
 });

 it('formats single closed position with loss', () => {
 const msg = formatClosedPositionsMessage([
 {
 marketQuestion: 'Will Paris reach 30°C?',
 outcome: 'NO',
 entryPrice: 0.60,
 exitPrice: 0.10,
 shares: 50,
 notional: 30,
 realizedPnl: -25,
 exitReason: 'stop_loss',
 },
 ]);
 expect(msg).toContain('📉');
 expect(msg).toContain('-$25.00');
 expect(msg).toContain('stop_loss');
 });

 it('groups multiple closed positions with total PnL', () => {
 const msg = formatClosedPositionsMessage([
 {
 marketQuestion: 'Question A?',
 outcome: 'YES',
 entryPrice: 0.40,
 exitPrice: 0.80,
 shares: 50,
 notional: 20,
 realizedPnl: 20,
 exitReason: 'target_reached',
 },
 {
 marketQuestion: 'Question B?',
 outcome: 'NO',
 entryPrice: 0.50,
 exitPrice: 0.30,
 shares: 100,
 notional: 50,
 realizedPnl: -20,
 exitReason: 'stop_loss',
 },
 ]);
 expect(msg).toContain('2 Paper Positions Closed');
 expect(msg).toContain('target_reached');
 expect(msg).toContain('stop_loss');
 expect(msg).toContain('Total PnL');
 expect(msg).toContain('+$0.00');
 });
});

describe('formatMarketResolvedMessage', () => {
 it('returns empty string for empty array', async () => {
   const { formatMarketResolvedMessage } = await import('../../src/notifications/telegram');
   expect(formatMarketResolvedMessage([])).toBe('');
 });

 it('formats single resolved market with winning YES', async () => {
   const { formatMarketResolvedMessage } = await import('../../src/notifications/telegram');
   const msg = formatMarketResolvedMessage([{
     marketQuestion: 'Will it rain in London on May 1?',
     outcome: 'YES',
     winningOutcome: 'YES',
     entryPrice: 0.40,
     exitPrice: 1.0,
     shares: 25,
     realizedPnl: 15.0,
   }]);
   expect(msg).toContain('Market Resolved');
   expect(msg).toContain('🏆');
   expect(msg).toContain('YES');
   expect(msg).toContain('+$15.00');
 });

 it('formats single resolved market with losing outcome', async () => {
   const { formatMarketResolvedMessage } = await import('../../src/notifications/telegram');
   const msg = formatMarketResolvedMessage([{
     marketQuestion: 'Will it rain in London on May 1?',
     outcome: 'YES',
     winningOutcome: 'NO',
     entryPrice: 0.60,
     exitPrice: 0.0,
     shares: 30,
     realizedPnl: -18.0,
   }]);
   expect(msg).toContain('❌');
   expect(msg).toContain('-$18.00');
 });

 it('formats batch of resolved markets with total PnL', async () => {
   const { formatMarketResolvedMessage } = await import('../../src/notifications/telegram');
   const msg = formatMarketResolvedMessage([
     {
       marketQuestion: 'Will London hit 20°C on May 1?',
       outcome: 'YES',
       winningOutcome: 'YES',
       entryPrice: 0.50,
       exitPrice: 1.0,
       shares: 20,
       realizedPnl: 10.0,
     },
     {
       marketQuestion: 'Will NYC rain on May 2?',
       outcome: 'NO',
       winningOutcome: 'YES',
       entryPrice: 0.70,
       exitPrice: 0.0,
       shares: 15,
       realizedPnl: -10.5,
     },
   ]);
   expect(msg).toContain('2 Markets Resolved');
   expect(msg).toContain('✅');
   expect(msg).toContain('❌');
   expect(msg).toContain('Total PnL');
   expect(msg).toContain('-$0.50');
 });
});
