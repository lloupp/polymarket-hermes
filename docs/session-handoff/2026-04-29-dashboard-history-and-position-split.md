# Session Handoff — 2026-04-29 dashboard history and position split

## Contexto
Conclusão incremental dos dois próximos passos sugeridos no handoff anterior: separar visualmente posições abertas/fechadas na dashboard e introduzir persistência determinística de histórico por ciclo do operador, sem mexer na lógica central de score/execução além do necessário para expor a trilha auditável.

## O que mudou
- `src/dashboard/view-model.ts`
  - `DashboardViewModel` agora expõe `openPositionRows` e `closedPositionRows`
  - o builder separa as posições por `status`
- `app/page.tsx`
  - painel de posições dividido em:
    - `Open Positions`
    - `Closed Positions`
  - estados vazios independentes para abertas e fechadas
  - `exitReason` continua visível nas fechadas
- `src/history/operator-history.ts`
  - novo writer de histórico JSON por ciclo
  - grava `snapshot`, `weatherEnrichment`, `decisions`, `executedPositions`, `closedPositions`, `allPositions` e `outputLines`
- `src/operator/simple-operator.ts`
  - aceita `historyDir?`
  - retorna `historyFilePath?`
  - quando `historyDir` + `nowIso` existem, persiste um arquivo determinístico `<runAt com : trocado por ->.json`
- `tests/operator/simple-operator.test.ts`
  - novo teste de persistência determinística do histórico
- `tests/dashboard/dashboard-view-model.test.ts`
  - cobre split entre abertas e fechadas
- `tests/dashboard/dashboard-data.test.ts`
  - valida saída da dashboard já segmentada

## O que foi reaproveitado
- `PaperWallet.listPositions()` já preservava trilha completa de posições abertas e fechadas
- `runSimpleWeatherOperator(...)` já centralizava todos os artefatos necessários para persistência
- output textual e resumo de exit reasons já existiam e foram só acoplados ao snapshot persistido

## O que foi adaptado
- view-model da dashboard para expor duas coleções em vez de uma só
- página Next para renderização segmentada sem alterar o restante do layout
- operador para consolidar `allPositions` e `outputLines` antes da escrita do histórico

## O que foi criado do zero
- `src/history/operator-history.ts`
- teste de integração do arquivo histórico com diretório temporário
- convenção de filename determinístico a partir de `nowIso`

## Validação
```bash
npm test -- tests/operator/simple-operator.test.ts tests/dashboard/dashboard-data.test.ts tests/dashboard/dashboard-view-model.test.ts tests/paper/paper-wallet.test.ts
```

Resultado observado:
- 4 arquivos de teste / 11 testes passando

## Formato atual do histórico
Cada ciclo gravado contém:
- `runAt`
- `snapshot`
- `weatherEnrichment`
- `decisions`
- `executedPositions`
- `closedPositions`
- `allPositions`
- `outputLines`

## Limites atuais
- a persistência só acontece se o chamador passar `historyDir` e `nowIso`
- ainda não existe leitor/agregador multi-run para alimentar séries temporais na dashboard
- ainda não existe rotação, compressão ou índice do histórico

## Próximo passo seguro
1. criar leitor/agregador dos JSONs de histórico
2. expor métricas temporais na dashboard/supervisor
3. depois avaliar loop contínuo consumindo essa trilha persistida
