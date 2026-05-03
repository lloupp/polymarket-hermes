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

Rodar um ciclo único sem persistência financeira:

```bash
npm run operator:paper -- --once
```

Rodar múltiplos ciclos com intervalo:

```bash
npm run operator:paper -- --cycles 3 --interval-ms 60000
```

Exemplo recomendado para experimento persistente:

```bash
npm run operator:paper -- --cycles 288 --interval-ms 300000 \
  --market-limit 12 \
  --forecast-days 2 \
  --min-edge 0.05 \
  --max-position-usd 25 \
  --history-dir operator-runtime/history-baseline-persistent \
  --runtime-log-path operator-runtime/paper-observer-baseline-persistent.ndjson \
  --wallet-state-path operator-runtime/paper-wallet-baseline.json \
  --search-query "temperature in london" \
  --search-query "temperature in seoul" \
  --search-query "temperature in hong kong"
```

Exemplo de variação mais agressiva permitindo YES a partir de `0.01`:

```bash
npm run operator:paper -- --cycles 288 --interval-ms 300000 \
  --market-limit 12 \
  --forecast-days 2 \
  --min-edge 0.05 \
  --max-position-usd 25 \
  --min-yes-price 0.01 \
  --history-dir operator-runtime/history-min-yes-001-persistent \
  --runtime-log-path operator-runtime/paper-observer-min-yes-001-persistent.ndjson \
  --wallet-state-path operator-runtime/paper-wallet-min-yes-001.json \
  --search-query "temperature in london" \
  --search-query "temperature in seoul" \
  --search-query "temperature in hong kong"
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
- `--wallet-state-path <path>` — arquivo JSON da carteira paper persistente; use sempre para comparar PnL entre ciclos.
- `--search-query <texto>` — adiciona consultas suplementares de busca; pode ser repetida.

## Como acompanhar resultados

- Histórico por ciclo: leia os JSONs em `operator-runtime/history-*`.
- Log operacional: leia o NDJSON configurado em `--runtime-log-path`.
- Carteira paper: leia o JSON configurado em `--wallet-state-path`; ele contém caixa, PnL realizado, posições abertas/fechadas e próximo id.
- A dashboard abre em modo histórico por padrão e pode apontar para um diretório persistente via query/form.

Campos importantes no histórico e nos logs:

- `weather_forecasts` — quantidade de mercados enriquecidos com forecast.
- `forecast_rate_limits`, `forecast_fallbacks`, `forecast_fallback_misses` — auditam rate limit da Open-Meteo e uso de fallback histórico.
- `signals_approved` e `signals_blocked` — resumem decisões do ciclo.
- `positions_opened` e `positions_closed` — resumem execução paper do ciclo.
- `closed_position_exit_reasons` — indica fechamentos por `take_profit`, `timeout` ou `resolution`.

## Regras operacionais importantes

- O operador é paper-first: não executa ordens reais nem usa chaves privadas.
- Use um `historyDir`, um NDJSON e um `wallet-state-path` separados para cada experimento.
- Sem `--wallet-state-path`, a carteira é stateless e não serve para avaliar PnL entre ciclos.
- Quando a Gamma/Polymarket marca um mercado como `closed=true`, posições paper abertas daquele mercado são fechadas com `exitReason=resolution` e preço final do outcome.
- Mercados fechados podem aparecer no snapshot para liquidar posições antigas, mas não abrem novas posições.
- `operator-runtime/` e `.next/` são artefatos locais ignorados pelo Git.
- Não há script de lint definido em `package.json` no momento.
