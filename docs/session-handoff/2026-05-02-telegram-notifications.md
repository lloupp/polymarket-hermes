# Session handoff — Telegram notifications

## Contexto atual
Repositório `polymarket-hermes` clonado em `/home/ubuntu/polymarket-hermes`. Módulo Telegram implementado e integrado ao operador paper. Nada foi enviado ao remoto.

## Decisões tomadas
- Módulo Telegram isolado em `src/notifications/telegram.ts` (não paralelo ao operador).
- Integração feita no script de entrada `scripts/paper-observer.ts`, não no runtime core.
- `dotenv` adicionado como dependência para carregar `.env`.
- `@types/node` adicionado como devDependency (build anterior falhava).
- Token mascarado nos logs por segurança.
- Sinais agrupados em batch para evitar spam.
- Fetch nativo usado (sem dependência HTTP extra).

## Limitações conhecidas
- Envio real de Telegram só funciona se `TELEGRAM_BOT_TOKEN` e `TELEGRAM_CHAT_ID` estiverem configurados no `.env`.
- Se o fetch para a API do Telegram demorar, o ciclo aguarda o `await` (não é non-blocking).
- Não há retry automático para falhas de envio Telegram.

## Próximo incremento recomendado
- Configurar `.env` com token real e testar envio end-to-end.
- Considerar adicionar alertas de rate limit do Open-Meteo e posição fechada.
- Considerar tornar o envio non-blocking (fire-and-forget sem await) se o latency do Telegram se tornar problema.
