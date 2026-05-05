import 'dotenv/config';
import {
  buildPaperObserverCliOptions,
  renderPaperObserverCycleSummary,
  runPaperObserverCycle,
  sleep,
} from '../src/operator/paper-observer-runtime';
import {
  loadTelegramConfigFromEnv,
  resolveTelegramConfig,
  createTelegramNotifier,
  formatCycleStartMessage,
  formatCycleSummaryMessage,
  formatCriticalErrorMessage,
  type SignalAlertData,
  type ClosedPositionAlertData,
  type MarketResolvedAlertData,
} from '../src/notifications/telegram';

async function main() {
  const options = buildPaperObserverCliOptions(process.argv.slice(2));
  const totalCycles = options.once ? 1 : options.cycles;

  const rawConfig = loadTelegramConfigFromEnv(process.env as Record<string, string | undefined>);
  const telegramConfig = resolveTelegramConfig(rawConfig);
  const notifier = createTelegramNotifier(telegramConfig);

  if (notifier.isEnabled()) {
    await notifier.send(formatCycleStartMessage());
  }

  let completedCycles = 0;

  do {
    let cycle;
    try {
      cycle = await runPaperObserverCycle(options);
    } catch (error) {
      const message = (error as Error)?.message ?? String(error);
      console.error('[paper-observer] fatal', error);
      if (notifier.isEnabled()) {
        await notifier.send(formatCriticalErrorMessage(message));
      }
      process.exitCode = 1;
      break;
    }

    console.log(renderPaperObserverCycleSummary(cycle));

    if (notifier.isEnabled()) {
      // ── Build consolidated cycle report ──
      const approvedDecisions = cycle.result.decisions.filter(
        (d) => d.signal !== 'HOLD',
      );

      // Build signals list for inline display
      const signals: SignalAlertData[] = approvedDecisions.map((decision) => {
        const market = cycle.result.snapshot.weatherMarkets.find(
          (m) => m.id === decision.marketId,
        );
        return {
          marketSlug: market?.slug ?? decision.marketId,
          marketQuestion: market?.question ?? decision.marketId,
          side: decision.signal,
          price: market?.yesPrice ?? 0,
          edge: decision.edge,
          positionSizeUsd: decision.positionSize * (options.maxPositionUsd ?? 100),
          reason: decision.reason,
        };
      });

      // Build closed positions list for inline display
      const closedPositions: (ClosedPositionAlertData | MarketResolvedAlertData)[] = [];
      for (const pos of cycle.result.closedPositions) {
        const market = cycle.result.snapshot.weatherMarkets.find(
          (m) => m.id === pos.marketId,
        );

        if (pos.exitReason === 'market_resolved') {
          const winningOutcome = pos.exitPrice === 1 ? 'YES' : 'NO';
          closedPositions.push({
            marketQuestion: market?.question ?? pos.marketId,
            outcome: pos.outcome,
            winningOutcome,
            entryPrice: pos.entryPrice,
            exitPrice: pos.exitPrice ?? 0,
            shares: pos.shares,
            realizedPnl: pos.realizedPnl ?? 0,
          } satisfies MarketResolvedAlertData);
        } else {
          closedPositions.push({
            marketQuestion: market?.question ?? pos.marketId,
            outcome: pos.outcome,
            entryPrice: pos.entryPrice,
            exitPrice: pos.exitPrice ?? 0,
            shares: pos.shares,
            notional: pos.notional,
            realizedPnl: pos.realizedPnl ?? 0,
            exitReason: pos.exitReason ?? 'unknown',
          } satisfies ClosedPositionAlertData);
        }
      }

      // Build wallet data from wallet state
      const ws = cycle.result.walletState;
      // Wallet balance = cash + unrealized position value (use entry notional as proxy)
      const walletBalance = ws ? ws.cash + ws.positions.reduce((sum, p) => sum + p.notional, 0) : undefined;

      // Win rate from cycle record
      const cycleSummaryMsg = formatCycleSummaryMessage({
        runAt: cycle.record.runAt,
        totalMarkets: cycle.record.totalMarkets,
        weatherMarkets: cycle.record.weatherMarkets,
        weatherForecasts: cycle.record.weatherForecasts,
        signalsApproved: cycle.record.signalsApproved,
        signalsBlocked: cycle.record.signalsBlocked,
        positionsOpened: cycle.record.positionsOpened,
        positionsClosed: cycle.record.positionsClosed,
        walletBalance,
        startingCapital: options.startingCapital,
        totalPnl: ws ? ws.realizedPnl : undefined,
        openPositions: ws ? ws.positions.length : undefined,
        winRate: cycle.record.winRate,
        wins: cycle.record.winRateWins,
        losses: cycle.record.winRateLosses,
        signals,
        closedPositions,
      });
      await notifier.send(cycleSummaryMsg);
    }

    completedCycles += 1;

    const shouldStop = options.once || (typeof totalCycles === 'number' && completedCycles >= totalCycles);
    if (shouldStop) {
      break;
    }

    await sleep(options.intervalMs);
  } while (true);
}

main().catch((error) => {
  console.error('[paper-observer] fatal', error);
  process.exitCode = 1;
});
