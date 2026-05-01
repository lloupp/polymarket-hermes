# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm install` — install dependencies from `package-lock.json`.
- `npm test` — run the Vitest suite once.
- `npm run test:watch` — run Vitest in watch mode.
- `npx vitest run tests/path/to/file.test.ts` — run a single test file.
- `npm run build` — type-check and compile with `tsc -p tsconfig.json` into `dist/`.
- No lint script is currently defined in `package.json`.
- `npm run dashboard:dev` — start the Next.js dashboard locally.
- `npm run operator:paper -- --once` — run one paper observer cycle.
- `npm run operator:paper -- --cycles <n> --interval-ms <ms>` — run repeated paper observer cycles.

Useful paper observer flags include `--market-limit`, `--forecast-days`, `--min-edge`, `--kelly-fraction`, `--max-position-usd`, `--min-yes-price`, `--min-repricing-edge`, `--take-profit-pct`, `--max-holding-hours`, `--history-dir`, `--runtime-log-path`, `--ndjson-log`, and repeated `--search-query` values.

## Architecture overview

This is a TypeScript/Node project with a small Next.js dashboard. The core product is a paper-first Polymarket weather-market operator: it ingests read-only Polymarket market data, filters weather markets, enriches them with Open-Meteo forecasts, scores deterministic edges, simulates paper positions, writes audit artifacts, and exposes dashboard data.

Key flow:

1. `scripts/paper-observer.ts` parses CLI flags and loops observer cycles.
2. `src/operator/paper-observer-runtime.ts` builds observer options, runs one cycle, appends NDJSON runtime records, and renders cycle summaries.
3. `src/operator/simple-operator.ts` orchestrates ingestion, market snapshotting, weather enrichment, decision scoring, paper execution/closing, dashboard view-model creation, and optional history writes.
4. `src/ingestion/polymarket.ts` fetches Gamma markets plus public-search supplemental records, normalizes them into domain `Market` objects, and preserves discovery metadata.
5. `src/operator/market-snapshot.ts` filters and sorts weather markets.
6. `src/weather/*` resolves locations, fetches/normalizes Open-Meteo forecasts, selects relevant forecast days, and builds weather market decisions.
7. `src/paper/paper-wallet.ts` owns simulated capital and paper positions.
8. `src/history/operator-history.ts` writes per-cycle audit JSON under `operator-runtime/history*` when a history directory and timestamp are provided.
9. `src/dashboard/*` adapts operator output into dashboard view models; `app/page.tsx` renders the Next.js dashboard.

## Repository structure

- `src/types/` — domain types for markets and paper positions.
- `src/scoring/` — generic edge and signal logic.
- `src/markets/` — weather-market filtering.
- `src/weather/` — forecast provider, Open-Meteo normalization, location resolution, and weather scoring.
- `src/ingestion/` — read-only Polymarket/Gamma ingestion.
- `src/operator/` — operator orchestration, snapshots, paper observer runtime.
- `src/paper/` — paper wallet and position lifecycle.
- `src/history/` — audit/history artifact writing.
- `src/dashboard/` — dashboard data adapters and view models.
- `app/` — Next.js app entrypoint for the dashboard.
- `scripts/` — CLI entrypoints.
- `tests/` — Vitest tests mirroring the source areas.
- `docs/` — architecture notes, implementation log, operator-cycle notes, and session handoffs.
- `operator-runtime/` — generated runtime logs/history artifacts.

## Project-specific workflow rules

Follow `AGENTS.md` for every code change:

1. Write or adjust tests first when changing behavior.
2. Implement the smallest change needed.
3. Validate with `npm test` and `npm run build` when applicable.
4. Update `docs/implementation-log.md` before ending the session.
5. Update `docs/operator-cycle.md` whenever the operational flow changes.
6. Create or update `docs/session-handoff/` only when the change affects continuity between sessions.
7. If tests or build were not run, state that explicitly in the documentation update.

## Important constraints

- The operator is paper-first; live trading, private keys, and real order execution are out of scope unless explicitly requested and designed later.
- Current tests are configured by `vitest.config.ts` to include `tests/**/*.test.ts`; `.test.tsx` files are not included by the default test command unless the config changes.
- External API clients use injectable fetchers/providers in tests; preserve that pattern when adding ingestion or weather behavior.
- Keep decision-affecting data serializable and auditable because history artifacts and dashboard output depend on it.
