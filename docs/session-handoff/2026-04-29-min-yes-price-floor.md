# 2026-04-29 — Min yes price floor no operador paper

## Objetivo
Evitar trades paper economicamente inúteis em ladders extremos de temperatura, como entradas em YES a `0.0005` que depois fecham por `timeout` com PnL zero.

## O que foi adaptado
- `src/operator/simple-operator.ts`
  - adicionada opção `minYesPrice?: number` em `RunSimpleWeatherOperatorOptions`
  - execução paper agora bloqueia abertura quando `market.yesPrice < minYesPrice`
- `src/operator/paper-observer-runtime.ts`
  - CLI agora parseia `--min-yes-price`
  - default operacional definido em `0.02`
  - valor é repassado para `runSimpleWeatherOperator`
- `tests/operator/simple-operator.test.ts`
  - novo caso garante que mercado ultra-barato continua com `BUY_YES` auditável na decisão, mas não abre posição se ficar abaixo do floor
- `tests/operator/paper-observer-runtime.test.ts`
  - parse CLI cobre `--min-yes-price`

## Testes validados
```bash
npm test -- --run tests/operator/simple-operator.test.ts tests/operator/paper-observer-runtime.test.ts
```

Resultado observado:
- `11/11` testes passando

## Smoke run validado
```bash
npm run operator:paper -- --once --market-limit=10 --forecast-days=1 --min-yes-price=0.02 --interval-ms=300000 --search-query='highest temperature in' --take-profit-pct=0.1 --max-holding-hours=6 --history-dir=operator-runtime/history-live-run-refined --runtime-log-path=operator-runtime/paper-observer-live-run-refined.ndjson
```

Saída relevante:
- `signals_approved=1`
- `positions_opened=0`
- `positions_closed=0`
- `history_file=operator-runtime/history-live-run-refined/2026-04-29T19-48-17.786Z.json`

## Interpretação
- O sinal continua existindo no layer de decisão.
- O trade não é executado quando o preço YES está baixo demais para ter utilidade econômica no horizonte atual.
- Isso corrige especificamente o padrão de entrada em bucket extremo com chance prática mínima de repricing.

## Próximo passo sugerido
1. adicionar um gate explícito de repricing mínimo esperado, além do floor de preço
2. expor no histórico o motivo de bloqueio operacional (`blocked_by_min_yes_price`)
3. acompanhar 20–30 fechamentos para comparar baseline vs versão com floor
