# Paper Trading Resolution & Win Rate — Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Make polymarket-hermes paper trading fully assertive — open positions, monitor until market resolves, close at correct exit price (1.0 or 0.0), and track win rate.

**Architecture:** Integrate the existing `fetchMarketResolution` / `getResolutionExitPrice` into `closePaperPositions`, enable wallet state persistence between cycles (already partially implemented), and add a win-rate tracker that computes accuracy from closed positions.

**Tech Stack:** TypeScript, Vitest, Polymarket Gamma API

---

## Task Graph

```
T1 backend-eng: Market Resolution Integration in closePaperPositions
T2 backend-eng: Wallet State Persistence CLI flag default
T3 backend-eng: Win Rate Tracker module
T4 backend-eng: Win Rate in cycle output + dashboard
T5 backend-eng: Integration test — full lifecycle (open → resolve → win rate)
```

### Task 1: Market Resolution Integration in closePaperPositions

**Objective:** When a market is closed/resolved on Gamma API, close positions at the correct exit price (1.0 for win, 0.0 for loss) instead of current market price.

**Files:**
- Modify: `src/operator/simple-operator.ts:403-471` (closePaperPositions function)
- Modify: `src/operator/simple-operator.ts:560-618` (runSimpleWeatherOperator — pass resolution fetcher)
- Modify: `src/types/market.ts:4` (ensure `'market_resolved'` is in PositionExitReason — already there)
- Test: `tests/operator/simple-operator.test.ts`

**Step 1: Write failing test**

Add a test in `tests/operator/simple-operator.test.ts` that:
1. Seeds a YES position on a market
2. Uses a `marketResolutionFetcher` that returns `{ closed: true, winningOutcome: 'YES' }` for that market
3. Runs the operator with `nowIso` after market close
4. Asserts: `closedPositions[0].exitPrice === 1.0`, `exitReason === 'market_resolved'`, `realizedPnl > 0`

Add another test with `winningOutcome: 'NO'` — asserts `exitPrice === 0.0`, `exitReason === 'market_resolved'`, `realizedPnl < 0` (loss).

**Step 2: Run test to verify failure**

Run: `npx vitest run tests/operator/simple-operator.test.ts`
Expected: FAIL — positions don't close with market_resolved

**Step 3: Modify closePaperPositions**

Add a new section BEFORE the `market_expired` check in `closePaperPositions`:

```typescript
// 0. Check if market has resolved (closed on Gamma API) — close at resolution price
if (input.marketResolutionFetcher && market) {
  const resolution = await input.marketResolutionFetcher(market.id);
  if (resolution?.closed && resolution.winningOutcome) {
    const exitPrice = getResolutionExitPrice(position.outcome, resolution);
    if (exitPrice !== undefined) {
      closed.push(
        input.wallet.closePosition({
          positionId: position.id,
          exitPrice,
          closedAt: nowIso,
          exitReason: 'market_resolved',
        }),
      );
      continue;
    }
  }
}
```

Change `closePaperPositions` to `async function` and add `marketResolutionFetcher` to input type.

**Step 4: Wire in runSimpleWeatherOperator**

Add `marketResolutionFetcher?: (marketId: string) => Promise<MarketResolution>` to the operator options. Pass it through to `closePaperPositions`. In the runtime (`paper-observer-runtime.ts`), default to using the real `fetchMarketResolution` from `src/ingestion/market-resolution.ts`.

**Step 5: Run test to verify pass**

Run: `npx vitest run tests/operator/simple-operator.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add src/operator/simple-operator.ts src/operator/paper-observer-runtime.ts tests/operator/simple-operator.test.ts
git commit -m "feat: integrate market resolution in closePaperPositions — resolved markets close at 1.0/0.0"
```

---

### Task 2: Wallet State Persistence CLI Flag Default

**Objective:** Make `--wallet-state-path` default to `operator-runtime/wallet-state.json` so the wallet persists between cycles automatically.

**Files:**
- Modify: `src/operator/paper-observer-runtime.ts:121` (walletStatePath default)
- Modify: `scripts/paper-observer.ts` (if it exists, ensure flag is passed)
- Test: `tests/operator/paper-observer-runtime.test.ts`

**Step 1: Write failing test**

Test that when `buildPaperObserverCliOptions([])` is called without `--wallet-state-path`, the default is `operator-runtime/wallet-state.json` (not `undefined`).

**Step 2: Run test to verify failure**

Expected: FAIL — default is currently `undefined`

**Step 3: Change default**

In `buildPaperObserverCliOptions`, change:
```typescript
walletStatePath: values.get('--wallet-state-path') ?? 'operator-runtime/wallet-state.json',
```

**Step 4: Run test to verify pass**

Expected: PASS

**Step 5: Commit**

```bash
git add src/operator/paper-observer-runtime.ts tests/operator/paper-observer-runtime.test.ts
git commit -m "feat: default wallet-state-path to operator-runtime/wallet-state.json"
```

---

### Task 3: Win Rate Tracker Module

**Objective:** Create a `WinRateTracker` class that computes win rate, total trades, wins, losses, P&L from closed positions.

**Files:**
- Create: `src/paper/win-rate-tracker.ts`
- Create: `tests/paper/win-rate-tracker.test.ts`

**Step 1: Write failing test**

```typescript
describe('WinRateTracker', () => {
  it('computes win rate from resolved positions', () => {
    const positions: PaperPosition[] = [
      { id: '1', marketId: 'm1', outcome: 'YES', entryPrice: 0.6, shares: 10, notional: 6, openedAt: '...', status: 'CLOSED', exitPrice: 1.0, exitReason: 'market_resolved', closedAt: '...', realizedPnl: 4 },
      { id: '2', marketId: 'm2', outcome: 'YES', entryPrice: 0.7, shares: 10, notional: 7, openedAt: '...', status: 'CLOSED', exitPrice: 0.0, exitReason: 'market_resolved', closedAt: '...', realizedPnl: -7 },
      { id: '3', marketId: 'm3', outcome: 'NO', entryPrice: 0.4, shares: 10, notional: 4, openedAt: '...', status: 'CLOSED', exitPrice: 1.0, exitReason: 'market_resolved', closedAt: '...', realizedPnl: 6 },
    ];
    const result = computeWinRate(positions);
    expect(result.totalResolved).toBe(3);
    expect(result.wins).toBe(2);
    expect(result.losses).toBe(1);
    expect(result.winRate).toBeCloseTo(0.6667, 3);
    expect(result.totalPnl).toBeCloseTo(3, 1);
  });

  it('ignores non-resolved positions (take_profit, timeout, market_expired)', () => {
    const positions: PaperPosition[] = [
      { id: '1', ..., exitReason: 'take_profit', ... },
      { id: '2', ..., exitReason: 'timeout', ... },
    ];
    const result = computeWinRate(positions);
    expect(result.totalResolved).toBe(0);
  });
});
```

**Step 2: Run test to verify failure**

**Step 3: Implement**

```typescript
export interface WinRateResult {
  totalResolved: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnl: number;
}

export function computeWinRate(closedPositions: PaperPosition[]): WinRateResult {
  const resolved = closedPositions.filter(p => p.status === 'CLOSED' && p.exitReason === 'market_resolved');
  const wins = resolved.filter(p => (p.realizedPnl ?? 0) > 0).length;
  const losses = resolved.filter(p => (p.realizedPnl ?? 0) <= 0).length;
  const totalResolved = resolved.length;
  const winRate = totalResolved > 0 ? wins / totalResolved : 0;
  const totalPnl = resolved.reduce((sum, p) => sum + (p.realizedPnl ?? 0), 0);
  return { totalResolved, wins, losses, winRate, totalPnl };
}
```

**Step 4: Run test**

**Step 5: Commit**

```bash
git add src/paper/win-rate-tracker.ts tests/paper/win-rate-tracker.test.ts
git commit -m "feat: add WinRateTracker module for paper trading accuracy"
```

---

### Task 4: Win Rate in Cycle Output + Dashboard

**Objective:** Include win rate in the cycle summary output and dashboard view model.

**Files:**
- Modify: `src/operator/simple-operator.ts` (add winRate to result)
- Modify: `src/operator/paper-observer-runtime.ts` (add to cycle record + summary)
- Modify: `src/dashboard/view-model.ts` (add win rate fields)
- Test: existing tests updated

**Step 1: Add winRate to operator result**

Import `computeWinRate` in `simple-operator.ts`. After `closePaperPositions`, call `computeWinRate(wallet.listPositions())` and include in result.

**Step 2: Add to cycle record**

Add `winRate`, `totalResolved`, `wins`, `losses` fields to `PaperObserverCycleRecord`.

**Step 3: Add to summary output**

In `renderPaperObserverCycleSummary`, add lines like:
```
win_rate=0.67
resolved_trades=3
wins=2
losses=1
```

**Step 4: Add to dashboard**

In `view-model.ts`, add win rate fields to the dashboard model.

**Step 5: Update tests**

**Step 6: Commit**

```bash
git add -A
git commit -m "feat: win rate in cycle output, dashboard, and summary"
```

---

### Task 5: Integration Test — Full Lifecycle

**Objective:** End-to-end test: open position → market resolves → position closes at correct price → win rate computed correctly.

**Files:**
- Add to: `tests/operator/simple-operator.test.ts`

**Step 1: Write test**

```typescript
it('full lifecycle: open position → market resolves → win rate tracked', async () => {
  // Cycle 1: Market open, signal approved → position opened
  const result1 = await runSimpleWeatherOperator({
    ...baseOptions,
    nowIso: '2026-05-01T12:00:00Z',
    marketResolutionFetcher: async () => ({ marketId: 'w1', closed: false, yesPrice: 0, noPrice: 0 }),
  });
  expect(result1.executedPositions.length).toBeGreaterThanOrEqual(1);

  // Cycle 2: Market resolved YES → position closed at 1.0
  const result2 = await runSimpleWeatherOperator({
    ...baseOptions,
    nowIso: '2026-05-02T12:00:00Z',
    walletState: result1.walletState,
    marketResolutionFetcher: async (id) => {
      if (id === 'w1') return { marketId: 'w1', closed: true, yesPrice: 1, noPrice: 0, winningOutcome: 'YES' };
      return { marketId: id, closed: false, yesPrice: 0, noPrice: 0 };
    },
  });
  expect(result2.closedPositions.length).toBeGreaterThanOrEqual(1);
  expect(result2.closedPositions[0].exitPrice).toBe(1.0);
  expect(result2.closedPositions[0].exitReason).toBe('market_resolved');
  expect(result2.winRate.totalResolved).toBe(1);
  expect(result2.winRate.wins).toBe(1);
  expect(result2.winRate.winRate).toBe(1.0);
});
```

**Step 2: Run test, fix until green**

**Step 3: Full suite**

Run: `npx vitest run`
Expected: ALL PASS

**Step 4: Commit**

```bash
git add tests/operator/simple-operator.test.ts
git commit -m "test: integration test — full lifecycle open → resolve → win rate"
```
