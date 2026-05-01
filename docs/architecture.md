# Polymarket Hermes — Arquitetura Inicial

## Objetivo
Construir um operador **paper-first** para Polymarket com foco inicial em mercados de **clima**, usando:
- ingestão de mercados
- scoring determinístico
- carteira fictícia
- regras de risco
- documentação auditável
- futura camada analítica com OpenClaw/Hermes

## Princípios
- **Paper only** no início
- **TDD obrigatório** para código novo
- **Determinístico primeiro, LLM depois**
- **Sem execução live** nesta fase
- **Logs e explicações desde o começo**

## Fases planejadas

### Fase 1 — Base local auditável
- estrutura TypeScript + Node
- testes com Vitest
- tipos principais
- cálculo de edge
- paper wallet
- regras mínimas de sizing/abertura/fechamento

### Fase 2 — Mercado e clima
- cliente Polymarket read-only
- filtro por categoria/tag
- cliente de clima (ex.: Open-Meteo)
- normalização de dados

### Fase 3 — Motor de decisão
- adjusted score
- edge = adjusted_score - yes_price
- filtros de liquidez/spread/volume
- sizing por risco

### Fase 4 — Supervisor e observabilidade
- relatório por ciclo
- histórico de decisões
- PnL por mercado
- recomendações automáticas

### Fase 5 — Camada OpenClaw/Hermes
- interpretação textual do mercado
- comparação com notícias/contexto
- justificativa estruturada da tese
- fallback seguro para heurística

**Status atual:** OpenClaw ainda não está instalado no ambiente. A arquitetura já está sendo preparada para receber essa camada depois, mas nenhuma parte crítica do MVP dependerá dele por enquanto. Quando a integração real com OpenClaw passar a ser necessária, isso será sinalizado explicitamente antes.

## Estrutura inicial do repositório
- `src/`
- `tests/`
- `config/`
- `docs/`

## Estrutura de código proposta
- `src/types/` — tipos compartilhados
- `src/scoring/` — score, edge, decisão
- `src/risk/` — sizing e bloqueios
- `src/paper/` — carteira, posições, PnL
- `src/ingestion/` — Polymarket read-only
- `src/weather/` — integração clima
- `src/operator/` — ciclo do operador
- `src/reporting/` — saídas e relatórios
- `src/dashboard/` — adaptadores e view-models para dashboard
- `app/` — dashboard visual futura em Next.js

## Visão inicial da dashboard
A dashboard será pensada desde cedo como parte do operador, não como extra tardio. O objetivo é ter uma interface visual para acompanhar:
- banca atual
- PnL realizado / não realizado
- posições abertas
- mercados de clima em análise
- sinais aprovados / bloqueados
- motivos de bloqueio
- histórico recente de decisões

Primeira meta visual:
- cards de métricas no topo
- tabela de mercados analisados
- painel de posições abertas
- timeline/registro de decisões recentes

Nesta fase inicial, vamos preparar a base de dados e contratos para alimentar essa dashboard, mesmo antes do frontend completo existir.

## MVP em execução agora
1. configurar projeto TypeScript/Vitest ✅
2. implementar cálculo de edge ✅
3. implementar paper wallet com banca inicial fictícia ✅
4. permitir abrir/fechar posição simulada ✅
5. documentar tudo em `docs/` ✅

## Estado atual da implementação
Já existem módulos iniciais para:
- tipos de mercado e posição paper
- cálculo de edge e sinal básico
- carteira fictícia com abertura/fechamento de posição
- suíte de testes automatizada para a base do domínio

A próxima camada será ingestão read-only da Polymarket e filtro de mercados de clima.

## Fora de escopo por enquanto
- ordens reais
- chaves privadas
- integração live
- automação autônoma sem auditoria

## Convenções iniciais
- Edge principal: `adjusted_score - yes_price`
- Banca inicial default: `1000`
- Tudo que afetar decisão deve ser serializável e auditável
- Toda nova regra deve vir com teste antes da implementação
