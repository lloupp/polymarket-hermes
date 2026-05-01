# AGENTS.md

## Regra obrigatória deste projeto
Todo agente que trabalhar neste repositório deve documentar cada incremento antes de encerrar a sessão.

## Requisitos mínimos de documentação
1. Atualizar `docs/implementation-log.md` com:
   - o que foi criado/adaptado
   - o que já funciona
   - resultado atual de testes/build
   - próximos passos sugeridos
2. Atualizar `docs/operator-cycle.md` sempre que o fluxo operacional mudar.
3. Se a mudança afetar continuidade entre sessões, criar ou atualizar um arquivo em `docs/session-handoff/` com:
   - contexto atual
   - decisões tomadas
   - limitações conhecidas
   - próximo incremento recomendado
4. Não concluir trabalho com código novo sem também registrar o impacto operacional/documental.

## Convenções
- Preferir documentação curta, direta e cumulativa.
- Registrar comportamento real implementado, não intenção genérica.
- Se testes/build não foram rodados, declarar explicitamente.
- Se houver trade-off ou limitação, documentar.

## Fluxo recomendado por tarefa
1. escrever/ajustar testes
2. implementar
3. validar (`npm test`, `npm run build` quando aplicável)
4. atualizar documentação obrigatória
5. só então encerrar a etapa
