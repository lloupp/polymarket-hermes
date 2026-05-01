# Operator cycle

## Estado atual
Fluxo do observer mantido, com dashboard operacional lendo o último histórico salvo por padrão e opção explícita de execução live pela UI. O enrichment de forecast agora diferencia origem `live` de `history_fallback` quando o Open-Meteo responde com rate limit.

## Mudança operacional aplicada ao forecast em 429
- `src/weather/open-meteo.ts` classifica rate limit como `open_meteo_rate_limited`.
- `src/operator/simple-operator.ts` reutiliza forecasts por `latitude + longitude + forecastDays` no mesmo ciclo para reduzir chamadas repetidas.
- Se o provider lançar `open_meteo_rate_limited`, o operador tenta `readLatestForecastFallback(...)` no `historyDir` informado.
- O fallback só é usado quando existe histórico compatível para a mesma latitude, longitude e mesmo `forecastDays`.
- Outros erros de forecast continuam sem fallback automático; o comportamento especial é restrito a 429.

## Como isso aparece operacionalmente
- Em forecast live bem-sucedido:
  - `forecastSource=live` nos enrichments
  - `forecast_rate_limits=0` para aquele ciclo
- Em 429 com fallback compatível:
  - `forecastSource=history_fallback`
  - `fallbackRunAt` e `fallbackHistoryFilePath` preenchidos
  - `forecast_rate_limits>0`
  - `forecast_fallbacks>0`
- Em 429 sem fallback compatível:
  - `weather_forecasts=0` pode continuar acontecendo
  - mas agora acompanhado por `forecast_rate_limits>0` e `forecast_fallback_misses>0`, sem falha silenciosa

## Impacto operacional do fallback
- O operador deixa de falhar silenciosamente quando a fonte de clima entra em rate limit.
- A trilha auditável fica visível em três superfícies:
  1. `outputLines` e resumo do ciclo
  2. histórico JSON salvo em `historyDir`
  3. dashboard, na coluna `Source` da tabela `Weather Forecasts` e na mensagem de status do histórico
- O fallback depende de já existir histórico compatível previamente salvo; um diretório vazio ou incompatível não recupera forecasts.

## Mudança operacional aplicada na dashboard

## Mudança operacional aplicada na dashboard
- `app/page.tsx` abre em `source=history` por padrão e lê `operator-runtime/history`.
- O formulário GET da dashboard permite ajustar `source`, `historyDir`, `marketLimit`, `forecastDays`, `minEdge`, `maxPositionUsd` e `refreshSeconds`.
- Em `source=history`, a dashboard carrega o arquivo JSON mais recente do diretório informado.
- Em `source=live`, a dashboard executa um novo ciclo do operador com os parâmetros informados e pode salvar histórico no `historyDir`.
- `refreshSeconds > 0` ativa auto-refresh via `router.refresh()`; em modo live, cada refresh dispara nova ingestão/forecast.

## Impacto operacional da dashboard
- uso diário deve começar gerando histórico com `npm run operator:paper -- --once` ou ciclos repetidos do observer.
- a dashboard passa a refletir o último ciclo salvo sem reexecutar APIs externas quando está em modo `history`.
- modo `live` continua disponível para smoke manual e comparação imediata, mas deve ser usado com cuidado quando combinado com auto-refresh.

## Registro anterior — alias de log e observabilidade
- CLI aceita `--ndjson-log` como alias retrocompatível de `--runtime-log-path`.
- A resolução de caminho de log segue ordem explícita:
  1. `--runtime-log-path`
  2. `--ndjson-log`
  3. `operator-runtime/paper-observer.ndjson` (fallback)
- Resumo de ciclo (`renderPaperObserverCycleSummary`) expõe:
  - `history_dir=<path efetivo>`
  - `runtime_log_path=<path efetivo>`

## Impacto operacional do observer
- reduz risco de execução com path inesperado quando operador usar flag legada `--ndjson-log`.
- melhora auditabilidade humana durante smoke/live run ao mostrar os paths efetivos no output de ciclo.
- sem mudança de estratégia de sinal/risco/execução.

## Registro anterior (2026-04-30 validacao Opencode/MCP)
Nenhuma mudanca no fluxo operacional do observer foi feita naquele incremento.

## Observação
Foi apenas validado que o ambiente de desenvolvimento do projeto pode usar `Opencode` com `Polymarket MCP` como ferramenta auxiliar externa.

## Impacto operacional
- zero impacto no ciclo do observer
- zero impacto em decisão/sinal/risk/execution
- zero impacto no processo atualmente em execução
