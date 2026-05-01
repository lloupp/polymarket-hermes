# polymarket-hermes

Ferramenta TypeScript/Node para operar um observador paper-first de mercados climáticos da Polymarket. O fluxo lê dados públicos, filtra mercados de clima, enriquece com previsões Open-Meteo, calcula sinais determinísticos, simula posições em uma carteira paper, grava artefatos de auditoria e alimenta um dashboard Next.js.

## Instalação

```bash
npm install
```

Use este comando para instalar as dependências registradas em `package-lock.json`.

## Testes

Rodar toda a suíte uma vez:

```bash
npm test
```

Rodar testes em modo watch:

```bash
npm run test:watch
```

Rodar um arquivo de teste específico:

```bash
npx vitest run tests/operator/paper-observer-runtime.test.ts
```

A configuração atual do Vitest inclui `tests/**/*.test.ts`. Arquivos `.test.tsx` não entram no `npm test` padrão enquanto `vitest.config.ts` não for alterado.

## Build

```bash
npm run build
```

Este comando executa `tsc -p tsconfig.json` e compila/type-checka o projeto em `dist/`.

## Dashboard local

```bash
npm run dashboard:dev
```

Inicia o dashboard Next.js em modo de desenvolvimento.

## Observer paper

Rodar um ciclo único:

```bash
npm run operator:paper -- --once
```

Rodar múltiplos ciclos com intervalo:

```bash
npm run operator:paper -- --cycles 3 --interval-ms 60000
```

Exemplo com artefatos explícitos:

```bash
npm run operator:paper -- --once \
  --history-dir operator-runtime/history \
  --runtime-log-path operator-runtime/paper-observer.ndjson
```

`--ndjson-log` também pode ser usado como alias de `--runtime-log-path`.

Flags úteis:

- `--market-limit <n>` — limita a quantidade de mercados ingeridos.
- `--forecast-days <n>` — define quantos dias de previsão serão considerados.
- `--min-edge <n>` — edge mínimo para aprovação de sinal.
- `--kelly-fraction <n>` — fração Kelly usada no sizing paper.
- `--max-position-usd <n>` — limite de tamanho por posição paper.
- `--min-yes-price <n>` — piso de preço YES considerado.
- `--min-repricing-edge <n>` — edge mínimo para repricing.
- `--take-profit-pct <n>` — percentual opcional de take profit.
- `--max-holding-hours <n>` — tempo máximo opcional de manutenção da posição.
- `--history-dir <path>` — diretório dos JSONs de histórico por ciclo.
- `--runtime-log-path <path>` — arquivo NDJSON com resumo dos ciclos.
- `--search-query <texto>` — adiciona consultas suplementares de busca; pode ser repetida.

## Observações

- Não há script de lint definido em `package.json` no momento.
- O operador é paper-first: não executa ordens reais nem usa chaves privadas.
- Artefatos gerados em execução ficam normalmente em `operator-runtime/`.
