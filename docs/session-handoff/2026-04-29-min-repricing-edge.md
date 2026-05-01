# 2026-04-29 — Min repricing edge no paper observer

## Objetivo
Adicionar um segundo gate de execução paper para evitar entradas que até passam no sinal (`BUY_YES`), mas têm edge econômico pequeno demais para justificar o risco/tempo de hold.

## O que foi adaptado
- `src/operator/simple-operator.ts`
  - nova opção `minRepricingEdge?: number`
  - execução paper agora bloqueia abertura quando `decision.edge < minRepricingEdge`
  - regra opera junto com `minYesPrice`
- `src/operator/paper-observer-runtime.ts`
  - CLI agora parseia `--min-repricing-edge`
  - default operacional definido em `0.08`
  - valor é repassado para `runSimpleWeatherOperator`
- `tests/operator/simple-operator.test.ts`
  - novo teste RED/GREEN garante que um `BUY_YES` com `edge=0.06` continua auditável em `decisions`, mas não abre posição se `minRepricingEdge=0.08`
- `tests/operator/paper-observer-runtime.test.ts`
  - parse CLI cobre `--min-repricing-edge`

## Testes validados
```bash
npm test -- --run tests/operator/simple-operator.test.ts tests/operator/paper-observer-runtime.test.ts
```

Resultado observado:
- `12/12` testes passando

## Evidência de continuidade do observer anterior (gate de preço)
NDJSON já mostrava continuidade após o restart anterior:
- `2026-04-29T19:48:55.637Z` -> `positionsOpened=0`
- `2026-04-29T19:53:58.337Z` -> `positionsOpened=0`

Isso confirmou que o floor de preço seguia efetivo em mais de um ciclo.

## Smoke run com os dois gates
```bash
npm run operator:paper -- --once --market-limit=10 --forecast-days=1 --min-yes-price=0.02 --min-repricing-edge=0.08 --interval-ms=300000 --search-query='highest temperature in' --take-profit-pct=0.1 --max-holding-hours=6 --history-dir=operator-runtime/history-live-run-refined --runtime-log-path=operator-runtime/paper-observer-live-run-refined.ndjson
```

Saída relevante:
- `run_at=2026-04-29T20:00:48.327Z`
- `signals_approved=1`
- `positions_opened=0`
- `positions_closed=0`
- `history_file=operator-runtime/history-live-run-refined/2026-04-29T20-00-48.327Z.json`

## Processo reiniciado
- processo antigo Hermes-managed finalizado: `proc_172a21d27d12`
- novo observer ativo com os dois gates:
  - `proc_1de60652903b`

## Comando ativo
```bash
npm run operator:paper -- --market-limit=10 --forecast-days=1 --min-yes-price=0.02 --min-repricing-edge=0.08 --interval-ms=300000 --search-query='highest temperature in' --take-profit-pct=0.1 --max-holding-hours=6 --history-dir=operator-runtime/history-live-run-refined --runtime-log-path=operator-runtime/paper-observer-live-run-refined.ndjson
```

## Interpretação
- O layer de decisão continua podendo marcar `BUY_YES`.
- A execução paper agora exige simultaneamente:
  1. preço YES acima do floor, e
  2. edge mínimo de repricing esperado.
- Isso reduz dois padrões ruins:
  - contratos de cauda ultra-baratos
  - contratos com vantagem teórica pequena demais para o horizonte operacional

## Próximo passo sugerido
1. adicionar motivo explícito de bloqueio operacional no histórico (`blocked_by_min_yes_price`, `blocked_by_min_repricing_edge`)
2. acompanhar 20–30 fechamentos para comparar baseline vs versão com dois gates
3. depois revisar se o threshold `0.08` deve ficar fixo ou depender de bucket/mercado
