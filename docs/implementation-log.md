# Implementation log

## 2026-05-03 — Fechamento da carteira paper por resolução da Polymarket

### O que foi criado/adaptado
- Atualizado `src/ingestion/polymarket.ts` para preservar `closed` da Gamma no `Market` normalizado e manter mercados fechados ativos na descoberta para liquidação de posições antigas.
- Atualizado `src/types/market.ts` com `Market.closed` e `PositionExitReason='resolution'`.
- Atualizado `src/operator/simple-operator.ts` para fechar posições `OPEN` quando o market vier `closed=true`, usando o preço final do outcome como saída.
- Atualizado `README.md` com comandos completos para rodar experimentos persistentes, dashboard, acompanhamento de artefatos e regras operacionais.
- Atualizado `.gitignore` para manter `.next/` e `operator-runtime/` fora do versionamento.
- Adicionados/ajustados testes em `tests/operator/simple-operator.test.ts` e `tests/ingestion/polymarket.test.ts`.

### O que já funciona
- Posições paper abertas são fechadas automaticamente quando a Polymarket/Gamma marca o mercado como encerrado.
- Mercados fechados podem entrar no snapshot para liquidação, mas não geram novas entradas paper.
- O fechamento por resolução tem prioridade sobre `take_profit` e `timeout`.
- O histórico, `outputLines`, dashboard e wallet persistente passam a registrar `exitReason=resolution`.
- Mercados resolvidos com `YES=0` fecham posições `YES` com perda total do notional; mercados resolvidos com `YES=1` fecham com pagamento integral das shares.

### Resultado atual de testes/build
- Teste focado executado com sucesso:
  - `npm --prefix "/home/eduardodlima/Projetos/polymarket-hermes" test -- tests/operator/simple-operator.test.ts tests/ingestion/polymarket.test.ts`: 2 arquivos, 30 testes, todos passando.
- Validação completa executada com sucesso:
  - `npm --prefix "/home/eduardodlima/Projetos/polymarket-hermes" test`: 16 arquivos, 86 testes, todos passando.
  - `npm --prefix "/home/eduardodlima/Projetos/polymarket-hermes" run build`: concluído com sucesso via `tsc -p tsconfig.json`.

### Operação após a mudança
- Observers persistentes antigos foram encerrados e reiniciados com as mesmas carteiras persistentes:
  - `operator-runtime/history-baseline-persistent` + `operator-runtime/paper-wallet-baseline.json`
  - `operator-runtime/history-min-yes-001-persistent` + `operator-runtime/paper-wallet-min-yes-001.json`
- Leitura imediata após reinício confirmou os novos processos ativos e carteiras ainda em `baseline: open=9, closed=0, pnl=0.00` e `min_yes_001: open=10, closed=0, pnl=0.00`; a liquidação por resolução depende do primeiro ciclo novo reencontrar os markets fechados na Gamma/public-search.

### Próximos passos sugeridos
- Depois do primeiro ciclo atualizado terminar, comparar novamente `paper-wallet-baseline.json` e `paper-wallet-min-yes-001.json` para medir PnL realizado por resolução.
- Se algum market resolvido não aparecer mais na busca pública da Gamma, considerar um backfill explícito por ids abertos antes de mudar a regra de liquidação.

## 2026-05-01 — Persistência da carteira paper entre ciclos

### O que foi criado/adaptado
- Atualizado `src/types/paper.ts` com `PaperWalletState`, serializando capital inicial, caixa, PnL realizado, posições e próximo id.
- Atualizado `src/paper/paper-wallet.ts` para inicializar a carteira a partir de estado persistido e exportar o estado atual ao fim do ciclo.
- Atualizado `src/operator/simple-operator.ts` para aceitar `walletState`, devolver `walletState` no resultado e evitar abrir uma nova posição em mercado que já tenha posição `OPEN`.
- Atualizado `src/operator/paper-observer-runtime.ts` com a flag `--wallet-state-path`, leitura do estado no início do ciclo e gravação após histórico/log runtime.
- Ajustados testes em `tests/operator/paper-observer-runtime.test.ts` e `tests/operator/simple-operator.test.ts` para cobrir persistência entre ciclos e o comportamento sem empilhar posições duplicadas no mesmo mercado.

### O que já funciona
- Um observer iniciado com `--wallet-state-path=<arquivo.json>` preserva caixa, posições abertas/fechadas, PnL realizado e próximo id entre ciclos.
- O primeiro ciclo sem arquivo de estado começa com a carteira inicial e cria o arquivo ao final.
- Ciclos seguintes reutilizam o estado salvo e não reabrem o mesmo mercado enquanto já houver uma posição `OPEN` nele.
- Execuções sem `--wallet-state-path` continuam possíveis, mas permanecem estateless e servem apenas para smoke/demo.
- Históricos antigos gerados antes desta mudança não devem ser usados para avaliação financeira de PnL ou posições atuais.

### Resultado atual de testes/build
- Teste focado executado com sucesso:
  - `npm --prefix "/home/eduardodlima/Projetos/polymarket-hermes" test -- tests/operator/paper-observer-runtime.test.ts`
- Validação completa executada com sucesso:
  - `npm --prefix "/home/eduardodlima/Projetos/polymarket-hermes" test`: 16 arquivos, 85 testes, todos passando.
  - `npm --prefix "/home/eduardodlima/Projetos/polymarket-hermes" run build`: concluído com sucesso via `tsc -p tsconfig.json`.

### Operação iniciada após a mudança
- Encerrados os observers antigos que rodavam sem `--wallet-state-path`.
- Iniciados novos loops persistentes:
  - `operator-runtime/history-baseline-persistent` + `operator-runtime/paper-wallet-baseline.json`
  - `operator-runtime/history-min-yes-001-persistent` + `operator-runtime/paper-wallet-min-yes-001.json`
- Primeiro ciclo persistente criou ambos os arquivos de carteira com caixa inicial, sem posições abertas.
- Os diretórios persistentes foram semeados com históricos antigos apenas para fallback de forecast; as carteiras começam limpas.

### Próximos passos sugeridos
- Aguardar novos ciclos dos experimentos persistentes para confirmar `forecast_fallbacks>0`, sinais e posições persistindo em carteira.
- Comparar PnL e posições somente a partir dos novos artefatos persistentes.
- Manter os históricos antigos apenas como evidência operacional de forecast/sinais, não como carteira financeira confiável.

## 2026-05-01 — Mitigação de Open-Meteo 429 com fallback auditável

### O que foi criado/adaptado
- Atualizado `src/weather/open-meteo.ts` para classificar payloads de rate limit como `open_meteo_rate_limited`.
- Atualizado `src/operator/simple-operator.ts` para reaproveitar forecasts por `latitude + longitude + forecastDays` dentro do mesmo ciclo.
- Adicionado fallback explícito em 429 usando o último forecast compatível salvo via `src/history/operator-history.ts`.
- Estendidos `WeatherMarketEnrichment` e `OperatorHistoryRecord` com metadados de auditabilidade do forecast: `forecastSource`, `fallbackRunAt` e `fallbackHistoryFilePath`.
- Atualizado `src/dashboard/dashboard-data.ts` para preservar a origem do forecast nos `forecastRows` e exibir mensagem de status específica quando o histórico contém fallback.
- Atualizado `app/page.tsx` para mostrar a origem do forecast na tabela `Weather Forecasts`.
- Adicionados/ajustados testes em `tests/weather/open-meteo.test.ts`, `tests/history/operator-history.test.ts`, `tests/operator/simple-operator.test.ts`, `tests/dashboard/dashboard-data.test.ts` e `tests/app/dashboard-page.test.ts`.

### O que já funciona
- O provider do Open-Meteo agora diferencia rate limit de payload inválido genérico.
- Mercados que compartilham localização e horizonte no mesmo ciclo reutilizam a mesma request de forecast.
- Quando ocorre `open_meteo_rate_limited`, o operador tenta carregar o último forecast compatível salvo no histórico informado.
- Quando o fallback existe, a origem do forecast fica auditável no histórico JSON, nos `outputLines` e na dashboard.
- Quando o fallback não existe, o operador não volta ao estado silencioso: o ciclo passa a expor `forecast_rate_limits`, `forecast_fallbacks` e `forecast_fallback_misses`.
- A dashboard mostra `history_fallback` ou `live` por linha de forecast, junto com `fallbackRunAt` ou `fallbackHistoryFilePath`.

### Resultado atual de testes/build
- Testes focados executados com sucesso:
  - `npx vitest run tests/weather/open-meteo.test.ts`
  - `npx vitest run tests/history/operator-history.test.ts`
  - `npx vitest run tests/operator/simple-operator.test.ts`
  - `npx vitest run tests/dashboard/dashboard-data.test.ts`
  - `npx vitest run tests/app/dashboard-page.test.ts`
- `npm test`: 16 arquivos, 84 testes, todos passando.
- `npm run build`: concluído com sucesso via `tsc -p tsconfig.json`.
- Smoke manual executado com:
  - `npm run operator:paper -- --once --history-dir operator-runtime/history-smoke-429 --runtime-log-path operator-runtime/paper-observer-smoke-429.ndjson`
- Resultado real do smoke:
  - `weather_forecasts=0`
  - `forecast_rate_limits=20`
  - `forecast_fallbacks=0`
  - `forecast_fallback_misses=20`
- Interpretação do smoke: a auditabilidade está correta e o fallback foi tentado, mas não havia histórico compatível prévio para as localizações/horizonte daquele ciclo.

### Próximos passos sugeridos
- Medir se vale reduzir a contagem repetida de `forecast_rate_limits`/fallbacks quando múltiplos mercados compartilham a mesma request rejeitada.
- Validar visualmente em um navegador real a UX do novo campo `Source` em um ambiente com acesso interativo ao browser.

### Complemento — validação manual integrada do `history_fallback`
- Validação adicional executada fora da suíte de testes usando artefatos reais em `operator-runtime/history-fallback-validation-1777643163553`.
- Histórico compatível semeado: `2026-04-30T18-00-00Z.json` com forecast `live` para `latitude=40.71`, `longitude=-74.01` e `forecastDays=1`.
- Execução rate-limited validada: `2026-05-01T19-00-00Z.json`.
- Resultado real do artefato validado:
  - `weather_forecasts=1`
  - `forecast_rate_limits=1`
  - `forecast_fallbacks=1`
  - `forecast_fallback_misses=0`
  - `signals_approved=1`
  - `positions_opened=1`
  - `positions_closed=0`
- O histórico salvo do ciclo rate-limited preserva `forecastSource=history_fallback`, `fallbackRunAt=2026-04-30T18:00:00Z` e `fallbackHistoryFilePath` apontando para o arquivo compatível anterior.
- Nenhuma mudança adicional de código de produção foi feita neste complemento; a validação usou um script temporário removido ao final.
- `npm test` e `npm run build` não foram executados novamente neste complemento porque o escopo foi apenas a validação manual sobre artefatos já gerados.

## 2026-04-30 — Correção do root layout da dashboard Next.js

### O que foi criado/adaptado
- Criado `app/layout.tsx` com as tags obrigatórias `<html lang="pt-BR">` e `<body>` exigidas pelo App Router do Next.js.
- Adicionado `tests/app/root-layout.test.ts` para cobrir a regressão que causava o erro `Missing <html> and <body> tags in the root layout`.

### O que já funciona
- A dashboard carrega no navegador com o título `Polymarket Hermes` sem o erro de root layout.
- O layout raiz mantém a página da dashboard como conteúdo filho, sem alterar o fluxo de dados ou a UI principal.

### Resultado atual de testes/build
- Teste focado: `npm test -- tests/app/root-layout.test.ts`, 1 teste passando.
- `npm test`: 16 arquivos, 80 testes, todos passando.
- `npm run build`: concluído com sucesso via `tsc -p tsconfig.json`.
- Validação manual no navegador: `http://localhost:3000` carregou a dashboard; o único erro de console observado foi `favicon.ico` 404, não relacionado ao root layout.

### Próximos passos sugeridos
- Opcionalmente adicionar um favicon para remover o 404 do console do navegador.

## 2026-04-30 — Dashboard com histórico, controles e auto-refresh

### O que foi criado/adaptado
- Atualizado `src/history/operator-history.ts` para ler o histórico JSON mais recente de um diretório configurável.
- Atualizado `src/dashboard/dashboard-data.ts` para montar a dashboard a partir de `history` por padrão ou de execução `live` quando solicitado.
- Atualizado `app/page.tsx` para aceitar controles via query params e formulário GET: `source`, `historyDir`, `marketLimit`, `forecastDays`, `minEdge`, `maxPositionUsd` e `refreshSeconds`.
- Criado `app/dashboard-auto-refresh.tsx` como client component mínimo para chamar `router.refresh()` em intervalo configurável.
- Atualizados testes da dashboard para cobrir modo live preservado, leitura de histórico salvo, fallback sem histórico e renderização dos controles/status.

### O que já funciona
- A dashboard abre em modo `history` por padrão e usa `operator-runtime/history` como diretório inicial.
- O usuário pode alternar para modo `live` pela própria UI e ajustar parâmetros básicos sem mudar código.
- O topo da dashboard mostra origem, `runAt`, diretório de histórico, arquivo carregado e mensagem de status.
- `refreshSeconds > 0` habilita atualização automática da rota; em modo `live`, cada refresh executa novo ciclo live.
- Cards, mercados, forecasts, decisões, discovery metadata e posições continuam usando o view model existente.

### Resultado atual de testes/build
- `npm test`: 15 arquivos, 79 testes, todos passando.
- `npm run build`: concluído com sucesso via `tsc -p tsconfig.json`.

### Próximos passos sugeridos
- Gerar histórico com `npm run operator:paper -- --once` antes de abrir a dashboard em modo `history`.
- Rodar `npm run dashboard:dev` e validar manualmente no navegador a alternância entre `history` e `live`.
- Usar auto-refresh com cautela em modo `live`, pois cada atualização dispara ingestão e forecast novamente.

## 2026-04-30 — README de comandos e ajuste do CLAUDE.md

### O que foi criado/adaptado
- Criado `README.md` na raiz com instruções de instalação, testes, build, dashboard e execução do observer paper.
- Documentados exemplos de `npm run operator:paper`, flags principais e o alias `--ndjson-log` para `--runtime-log-path`.
- Ajustado `CLAUDE.md` para explicitar `npm install` e a ausência atual de script de lint em `package.json`.

### O que já funciona
- Novos usuários conseguem consultar os comandos principais da ferramenta diretamente no README.
- Futuras sessões do Claude Code recebem orientação mais completa sobre setup e lint inexistente.

### Resultado atual de testes/build
- `npm test` não foi executado porque a mudança foi apenas documental.
- `npm run build` não foi executado porque a mudança foi apenas documental.

### Próximos passos sugeridos
- Adicionar um script de lint ao `package.json` se o projeto passar a adotar uma ferramenta de lint formal.

## 2026-04-30 — CLAUDE.md repository guidance

### O que foi criado/adaptado
- Criado `CLAUDE.md` na raiz do projeto com comandos reais de desenvolvimento, visão arquitetural de alto nível e regras específicas de fluxo do repositório.
- Consolidado o papel dos módulos centrais do operador paper-first, ingestão Polymarket, clima, dashboard, histórico e runtime CLI.

### O que já funciona
- Futuras sessões do Claude Code passam a receber orientação local sobre comandos, estrutura e restrições do projeto.
- O documento referencia `AGENTS.md` como regra operacional obrigatória para mudanças de código e documentação.

### Resultado atual de testes/build
- `npm test`: 15 arquivos, 76 testes, todos passando.
- `npm run build`: concluído com sucesso.

### Próximos passos sugeridos
- Atualizar `CLAUDE.md` apenas quando comandos, arquitetura ou regras operacionais mudarem de forma relevante.

## 2026-04-30 — Paper observer artifact path alias and observability

### O que foi criado/adaptado
- Atualizado `src/operator/paper-observer-runtime.ts` para aceitar `--ndjson-log` como alias retrocompativel de `--runtime-log-path`.
- Ajustada a resolucao de path de log para priorizar `--runtime-log-path`, depois `--ndjson-log`, e por fim fallback padrao.
- Enriquecido o registro de ciclo (`PaperObserverCycleRecord`) com `historyDir` e `runtimeLogPath` efetivos usados na execucao.
- Atualizado `renderPaperObserverCycleSummary` para exibir claramente `history_dir` e `runtime_log_path` em cada ciclo.
- Adicionados testes focados em `tests/operator/paper-observer-runtime.test.ts` cobrindo alias de CLI e visibilidade dos paths no summary.

### O que já funciona
- `--ndjson-log=/caminho/arquivo.ndjson` passa a ser aceito e populado como `runtimeLogPath`.
- O runtime continua aceitando `--runtime-log-path` sem quebra de compatibilidade.
- O NDJSON de runtime e o historico continuam sendo gravados nos paths informados pelo caller.
- O summary por ciclo agora mostra explicitamente os paths efetivos de historico e log.

### Resultado atual de testes/build
- Teste focado executado com sucesso:
  - `npm test -- --run tests/operator/paper-observer-runtime.test.ts`
  - resultado: 1 arquivo, 4 testes, todos passando.
- Build completo nao foi executado neste incremento (escopo focado em runtime/testes do observer).

### Próximos passos sugeridos
- Rodar smoke manual com `npm run operator:paper -- --once --history-dir=... --ndjson-log=...` para validar ergonomia CLI ponta a ponta.
- Opcionalmente documentar no README/scripts que `--ndjson-log` e alias legado de `--runtime-log-path`.

## 2026-04-30 — Opencode + Polymarket MCP validation for polymarket-hermes

### O que foi criado/adaptado
- Nenhuma mudança de código no runtime do observer.
- Validação operacional do ambiente de desenvolvimento para uso de `Opencode` no repo `polymarket-hermes`.
- Confirmação de que o `Opencode` já está funcional no host.
- Confirmação de que o `Opencode` já enxerga um servidor MCP `polymarket` conectado via config global em `~/.config/opencode/opencode.json`.

### O que já funciona
- `opencode --version` responde corretamente.
- `opencode run 'Respond with exactly: OPENCODE_SMOKE_OK'` passou.
- `opencode mcp list` mostra:
  - `polymarket connected`
  - comando: `npx -y @igoforth/polymarket-mcp`
- Smoke adicional via `opencode run ...` confirmou disponibilidade de toolset `polymarket_*`.

### Resultado atual de testes/build
- Não houve mudança de código do projeto.
- Não foi rodado `npm test` nem `npm run build` porque o incremento foi apenas de validação/ferramenta externa.
- Smokes executados com sucesso:
  - `opencode run 'Respond with exactly: OPENCODE_SMOKE_OK'`
  - `opencode mcp list`
  - `opencode run 'List the available MCP servers/tools briefly and respond with OK if polymarket MCP is connected.'`

### Próximos passos sugeridos
- Usar `Opencode + MCP polymarket` como superfície auxiliar de desenvolvimento/análise neste repo, sem acoplar isso ao runtime principal do observer.
- Se desejar isolamento por projeto, criar configuração local/documentada para Opencode neste repositório em vez de depender só de `~/.config/opencode/opencode.json`.
- Em um próximo incremento, adicionar um guia curto de uso no README ou em `docs/` com prompts seguros para pesquisa/refactor usando MCP.
