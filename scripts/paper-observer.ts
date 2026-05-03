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
 formatSignalsBatchMessage,
 formatClosedPositionsMessage,
 formatMarketResolvedMessage,
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
      const cycleSummaryMsg = formatCycleSummaryMessage({
        runAt: cycle.record.runAt,
        totalMarkets: cycle.record.totalMarkets,
        weatherMarkets: cycle.record.weatherMarkets,
        weatherForecasts: cycle.record.weatherForecasts,
        signalsApproved: cycle.record.signalsApproved,
        signalsBlocked: cycle.record.signalsBlocked,
        positionsOpened: cycle.record.positionsOpened,
        positionsClosed: cycle.record.positionsClosed,
      });
      await notifier.send(cycleSummaryMsg);

      const approvedDecisions = cycle.result.decisions.filter(
        (d) => d.signal !== 'HOLD',
      );

      if (approvedDecisions.length > 0) {
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

 const signalMsg = formatSignalsBatchMessage(signals);
 if (signalMsg) {
 await notifier.send(signalMsg);
 }
 }

  // Closed positions alert
  if (cycle.result.closedPositions.length > 0) {
    const marketResolved: MarketResolvedAlertData[] = [];
    const otherClosed: ClosedPositionAlertData[] = [];

    for (const pos of cycle.result.closedPositions) {
      const market = cycle.result.snapshot.weatherMarkets.find(
        (m) => m.id === pos.marketId,
      );

      if (pos.exitReason === 'market_resolved') {
        // Derive winning outcome from exit price: YES@1.0 means YES won, YES@0.0 means NO won
        const winningOutcome = pos.exitPrice === 1 ? 'YES' : 'NO';
        marketResolved.push({
          marketQuestion: market?.question ?? pos.marketId,
          outcome: pos.outcome,
          winningOutcome,
          entryPrice: pos.entryPrice,
          exitPrice: pos.exitPrice ?? 0,
          shares: pos.shares,
          realizedPnl: pos.realizedPnl ?? 0,
        });
      } else {
        otherClosed.push({
          marketQuestion: market?.question ?? pos.marketId,
          outcome: pos.outcome,
          entryPrice: pos.entryPrice,
          exitPrice: pos.exitPrice ?? 0,
          shares: pos.shares,
          notional: pos.notional,
          realizedPnl: pos.realizedPnl ?? 0,
          exitReason: pos.exitReason ?? 'unknown',
        });
      }
    }

    const resolvedMsg = formatMarketResolvedMessage(marketResolved);
    if (resolvedMsg) {
      await notifier.send(resolvedMsg);
    }

    const closedMsg = formatClosedPositionsMessage(otherClosed);
    if (closedMsg) {
      await notifier.send(closedMsg);
    }
  }
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
