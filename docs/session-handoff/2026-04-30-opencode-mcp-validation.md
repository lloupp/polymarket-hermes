# Session handoff — Opencode + Polymarket MCP validation

## Contexto atual
O usuário pediu para usar `Opencode` com `MCP Polymarket` no projeto `polymarket-hermes`.

## Decisões tomadas
- Não alterar o runtime principal do observer neste incremento.
- Tratar `Opencode + MCP Polymarket` como ferramenta de desenvolvimento/análise, não como dependência do loop operacional em produção paper.
- Validar primeiro a disponibilidade real antes de propor qualquer integração mais profunda.

## Evidência validada
- Repo confirmado: `/home/eduardodlima/Projetos/polymarket-hermes`
- `opencode` instalado e funcional
- `opencode` smoke passou com `OPENCODE_SMOKE_OK`
- Config global atual do Opencode contém MCP:
  - arquivo: `~/.config/opencode/opencode.json`
  - servidor: `polymarket`
  - comando: `npx -y @igoforth/polymarket-mcp`
- `opencode mcp list` confirmou `polymarket connected`
- `opencode run ...` confirmou disponibilidade de ferramentas `polymarket_*`

## Limitações conhecidas
- A configuração MCP atual é global do usuário, não específica do repo.
- Não houve alteração no código do `polymarket-hermes` para consumir MCP automaticamente.
- Não houve teste de fluxo complexo dentro do código do projeto; apenas validação da ferramenta externa.

## Próximo incremento recomendado
- Documentar um fluxo padrão de uso do Opencode neste repo (pesquisa, inspeção, refactor assistido).
- Opcionalmente criar isolamento/config local por projeto se o usuário quiser evitar dependência de config global.
- Só depois disso considerar integrar alguma automação do repo que invoque Opencode de forma reproduzível.
