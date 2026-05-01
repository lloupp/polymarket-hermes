# Polymarket Hermes MVP Foundation Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Criar a base auditável do projeto polymarket-hermes com TypeScript, testes, documentação e primeiro módulo de paper trading.

**Architecture:** O MVP será construído em camadas determinísticas: tipos compartilhados, scoring/edge, risk helpers e paper wallet. A primeira entrega não depende de APIs externas nem de LLM; ela estabelece a base segura para o operador paper-first.

**Tech Stack:** TypeScript, Node.js, Vitest.

---

## Task 1: Inicializar projeto Node/TypeScript
**Objective:** Criar a fundação mínima do projeto com scripts de build/test.

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `.gitignore`

**Verification:**
- `npm install`
- `npm test`

## Task 2: Definir tipos centrais do domínio
**Objective:** Criar os tipos básicos para mercado, decisão e posição paper.

**Files:**
- Create: `src/types/market.ts`
- Create: `src/types/paper.ts`
- Test: `tests/types/domain-types.test.ts`

**Verification:**
- `npm test`

## Task 3: Implementar edge e sinal com TDD
**Objective:** Calcular edge e decisão básica BUY_YES / BUY_NO / HOLD.

**Files:**
- Create: `tests/scoring/edge.test.ts`
- Create: `src/scoring/edge.ts`

**Verification:**
- `npm test -- --runInBand`

## Task 4: Implementar paper wallet com TDD
**Objective:** Abrir e fechar posições simuladas com atualização de caixa e PnL.

**Files:**
- Create: `tests/paper/paper-wallet.test.ts`
- Create: `src/paper/paper-wallet.ts`

**Verification:**
- `npm test`

## Task 5: Documentar o que foi implementado
**Objective:** Registrar a base técnica e o que já roda localmente.

**Files:**
- Create: `docs/implementation-log.md`
- Modify: `docs/architecture.md`

**Verification:**
- leitura dos docs
- `npm test`
