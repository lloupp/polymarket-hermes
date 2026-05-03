# 2026-05-01 — Paper wallet persistence handoff

## Contexto atual
- A carteira paper agora pode persistir entre ciclos do observer via `--wallet-state-path`.
- O estado persistido inclui capital inicial, caixa, PnL realizado, posições e próximo id.
- O operador evita abrir nova posição em mercado que já tenha uma posição `OPEN`.
- Sem `--wallet-state-path`, o observer continua stateless e não deve ser usado para avaliar PnL entre ciclos.

## Decisões tomadas
- Persistência mínima em JSON local, sem banco de dados e sem novo serviço.
- Cada experimento deve usar seu próprio arquivo de carteira para não misturar posições.
- Históricos antigos dos experimentos `baseline` e `min_yes_001` continuam úteis para forecast/sinais, mas não para análise financeira confiável.

## Limitações conhecidas
- Os experimentos longos anteriores foram gerados antes da persistência de carteira; posições abertas vistas em artefatos antigos não representam necessariamente estado atual.
- PnL realizado só fica confiável após reiniciar experimentos com `--wallet-state-path` desde o primeiro ciclo.
- A persistência é arquivo local simples; execuções concorrentes apontando para o mesmo wallet JSON devem ser evitadas.

## Estado operacional após a mudança
- Os observers antigos sem `--wallet-state-path` foram encerrados.
- Novos loops foram iniciados com:
  - `operator-runtime/history-baseline-persistent`, `operator-runtime/paper-observer-baseline-persistent.ndjson`, `operator-runtime/paper-wallet-baseline.json`
  - `operator-runtime/history-min-yes-001-persistent`, `operator-runtime/paper-observer-min-yes-001-persistent.ndjson`, `operator-runtime/paper-wallet-min-yes-001.json`
- O primeiro ciclo persistente criou carteiras limpas com `cash=1000`, `realizedPnl=0`, `positions=[]` e `nextId=1`.
- Os diretórios persistentes foram semeados com históricos antigos apenas para permitir fallback de forecast nos próximos ciclos.

## Próximo incremento recomendado
- Após alguns ciclos, comparar forecasts, sinais, posições abertas/fechadas e PnL usando os novos artefatos persistentes.
- Confirmar se os ciclos seguintes passam a ter `forecast_fallbacks>0` em vez de `forecast_fallback_misses>0`.
- Se a dashboard for usada para acompanhar os novos experimentos, apontar `historyDir` para os diretórios persistentes recém-criados.
