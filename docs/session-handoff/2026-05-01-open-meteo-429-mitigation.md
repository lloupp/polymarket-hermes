# 2026-05-01 — Open-Meteo 429 mitigation handoff

## Contexto atual
- O operador paper agora classifica `open_meteo_rate_limited` na fronteira do provider.
- Dentro de um mesmo ciclo, forecasts com mesma `latitude + longitude + forecastDays` são reutilizados.
- Em caso de 429, o operador tenta carregar o último forecast compatível salvo no `historyDir`.
- A dashboard e o histórico preservam `forecastSource`, `fallbackRunAt` e `fallbackHistoryFilePath`.
- O caminho `history_fallback` já foi validado manualmente fora da suíte de testes com artefatos reais em `operator-runtime/history-fallback-validation-1777643163553`.

## Decisões tomadas
- O fallback é exclusivo para `open_meteo_rate_limited`; outros erros continuam sem tratamento especial.
- O match do fallback usa igualdade de `latitude`, `longitude` e `forecastDays`.
- Não foi criado cache global nem novo artefato; o histórico JSON existente segue sendo a trilha auditável.
- A dashboard não ganhou arquitetura nova; só passou a mostrar a origem do forecast e mensagem de status derivada.

## Limitações conhecidas
- Se não existir histórico compatível prévio, o operador continua com `weather_forecasts=0`, mas agora informa `forecast_rate_limits` e `forecast_fallback_misses`.
- O smoke manual amplo de 2026-05-01 terminou com:
  - `forecast_rate_limits=20`
  - `forecast_fallbacks=0`
  - `forecast_fallback_misses=20`
- A validação integrada controlada com histórico compatível confirmou o caminho feliz do fallback, mas não substitui um smoke amplo com dados reais de produção paper.
- Como a promise rejeitada é reutilizada por mercados correlatos, a contagem atual de 429/fallback pode refletir tentativas por mercado, não por localização única.

## Próximo incremento recomendado
- Validar no navegador a UX do modo `history` com linhas reais marcadas como `history_fallback`.
- Se o ruído operacional atrapalhar leitura, consolidar contadores por request única/localização, sem expandir o escopo para cache persistente.
- Opcionalmente transformar a validação integrada atual em um smoke operacional reutilizável sem deixar artefatos temporários no repositório.
