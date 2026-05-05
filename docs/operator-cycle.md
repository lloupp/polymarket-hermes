# Operator cycle

## Estado atual
Fluxo do observer com resolução de mercado integrada. Quando um mercado resolve (closed + winningOutcome na Gamma API), a posição fecha com `exitReason='market_resolved'` e preço binário (1.0 ou 0.0). A checagem de resolução acontece antes de `market_expired`/`take_profit`/`timeout`, garantindo que posições resolvidas sempre usem o preço correto. Win rate é calculado e exposto no output, dashboard e cycle record. Wallet state persiste por default em `./paper-wallet-state.json`.

## Mudança operacional — Market Resolution
- `closePaperPositions()` agora é `async` e consulta `fetchMarketResolution(marketId)`.
- Se `resolution.closed && resolution.winningOutcome`, posição fecha com `exitReason='market_resolved'` e `exitPrice = getResolutionExitPrice(outcome, resolution)`.
- Exit price binário: YES→1.0/0.0, NO→0.0/1.0 baseado no winningOutcome.
- O `marketResolutionFetcher` é injetável (default: `fetchMarketResolution` da Gamma API).
- Ordem de prioridade: `market_resolved` > `market_expired` > `take_profit`/`timeout`.

## Mudança operacional — Win Rate
- `computeWinRate(allPositions)` filtra posições `CLOSED` com `exitReason='market_resolved'`.
- Win = realizedPnl > 0, Loss = realizedPnl <= 0.
- Exposto em `result.winRate`, output lines (`win_rate=`, `win_rate_resolved=`, etc.), dashboard summary cards (Win Rate, Resolved Wins, Win Rate PnL) e `PaperObserverCycleRecord`.

## Mudança operacional — Wallet State Persistência
- `--wallet-state-path` agora defaulta para `./paper-wallet-state.json`.
- Wallet persiste automaticamente entre ciclos sem flag explícita.
- Primeiro ciclo sem arquivo cria o JSON; ciclos subsequentes carregam o estado salvo.
- Sem `--wallet-state-path`, a execução continua stateless: posições e PnL não persistem entre ciclos.
- O operador não abre nova posição para um mercado que já tenha posição `OPEN`, evitando empilhar exposições duplicadas no mesmo mercado.
- Quando a Gamma/Polymarket marca um market como `closed=true`, o operador fecha qualquer posição `OPEN` daquele mercado com `exitReason=resolution` e preço final do outcome.
- Mercados fechados podem aparecer no snapshot para liquidar posições antigas, mas são ignorados para novas entradas paper.
- Fechamento por resolução tem prioridade sobre `take_profit` e `timeout`, porque representa o resultado oficial do mercado.

## Como rodar experimentos persistentes
- Baseline exemplo:
  - `npm run operator:paper -- --cycles 288 --interval-ms 300000 --history-dir operator-runtime/history-baseline-persistent --runtime-log-path operator-runtime/baseline-persistent.ndjson --wallet-state-path operator-runtime/paper-wallet-baseline.json`
- Variação `min_yes_001` exemplo:
  - `npm run operator:paper -- --cycles 288 --interval-ms 300000 --history-dir operator-runtime/history-min-yes-001-persistent --runtime-log-path operator-runtime/min-yes-001-persistent.ndjson --wallet-state-path operator-runtime/paper-wallet-min-yes-001.json --min-yes-price 0.01`
- Cada experimento deve ter seu próprio `historyDir`, log NDJSON e `wallet-state-path`.
- Comparações de PnL/posições devem usar apenas ciclos gerados com carteira persistente.

O observer paper-first agora suporta notificações Telegram opcionais. O fluxo do ciclo é inalterado quando o Telegram está desativado. Quando habilitado, o operador envia alertas em 4 pontos: início, resumo de ciclo, sinais aprovados (batched) e erro crítico.

## Mudança operacional aplicada — Telegram notifications
- Novo módulo `src/notifications/telegram.ts` com config via env vars, sender tolerante a falhas e formatadores de mensagem.
- `scripts/paper-observer.ts` carrega `dotenv/config` no topo e instancia o notifier.
- Alertas enviados:
  1. **Início do operador**: mensagem de cycle start.
  2. **Fim de ciclo**: resumo com mercados, sinais, posições.
  3. **Sinais aprovados**: agrupados em uma mensagem por ciclo (anti-spam).
  4. **Erro crítico**: capturado no catch do main loop.
- Variáveis de ambiente: `TELEGRAM_ENABLED`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`.
- Se `TELEGRAM_ENABLED` não estiver `true` ou se faltar token/chat_id, o operador continua sem enviar nada.
- Falhas de rede ou API do Telegram são logadas mas não derrubam o ciclo.
- Token é mascarado nos logs (parcialmente visível para debug).

## Como isso aparece operacionalmente
- Com Telegram desabilitado (padrão):
  - Log: `[telegram] notifications disabled`
  - Zero chamadas à API do Telegram
- Com Telegram habilitado e configurado:
  - Log: `[telegram] notifications enabled (token=1234...EF)`
  - 2-3 mensagens por ciclo (start + summary + signals se houver)
  - Falha no Telegram: log de erro, ciclo continua normal
- Com Telegram habilitado mas sem token/chat_id:
  - Log: `[telegram] TELEGRAM_ENABLED=true but TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is missing`
  - Notifier é automaticamente desabilitado, ciclo continua

## Impacto operacional do Telegram
- Zero impacto no fluxo de ingestão, scoring, posição ou dashboard.
- Zero impacto em decisão/sinal/risk/execution.
- Dependência adicionada: `dotenv` (leve, padrão Node.js).
- O envio de mensagens é fire-and-forget: `await notifier.send(...)` não bloqueia o próximo ciclo em caso de timeout lento (o fetch tem timeout natural da plataforma).

## Registro anterior — Mitigação de Open-Meteo 429

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