# Session Handoff — 2026-05-05 Market Resolution + Win Rate

## Contexto atual
Paper trading operator agora é **assertivo**: abre posições, monitora até resolução, e rastreia win rate. Cinco tasks (T1-T5) completas via Kanban.

## Decisões tomadas
1. `closePaperPositions()` → `async`, checa resolução ANTES de expiry/tp/timeout
2. Exit price binário (1.0/0.0) via `getResolutionExitPrice()` — não preço de mercado
3. `--wallet-state-path` defaulta para `./paper-wallet-state.json`
4. Win rate apenas conta `market_resolved` exits (não tp/timeout/expired)
5. `marketResolutionFetcher` injetável para testes e extensibilidade

## Limitações conhecidas
- Win rate é por-ciclo (não cumulativo entre sessões ainda) — mas wallet state persiste, então posições resolvidas acumulam no wallet
- Sem suporte a BUY_NO no seed de teste (apenas YES testado no lifecycle)
- `fetchMarketResolution()` faz HTTP call real se não injetado — pode ser lento com muitas posições abertas

## Próximo incremento recomendado
1. Reativar paper observer com as mudanças e coletar win rate real
2. Implementar win rate cumulativo (ler wallet state → computar de todas as posições CLOSED)
3. Adicionar métrica de win rate por categoria (rain, temperature, etc.)
4. Trade-off: cache de resolução por market (evitar N fetches quando mesmo market tem múltiplas posições)
