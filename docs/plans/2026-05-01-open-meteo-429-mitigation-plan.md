# Open-Meteo 429 Mitigation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reduzir chamadas repetidas ao Open-Meteo, reaproveitar forecasts dentro do mesmo ciclo e usar fallback explícito para o último forecast válido salvo quando houver HTTP 429, preservando auditabilidade em histórico, log e dashboard.

**Architecture:** A menor mudança segura é manter a orquestração atual em `src/operator/simple-operator.ts` e acrescentar duas capacidades pontuais: cache por `latitude + longitude + forecastDays` dentro do ciclo atual e fallback de leitura do histórico mais recente compatível quando o provider falhar por rate limit. A classificação do erro 429 deve nascer em `src/weather/open-meteo.ts`, e a auditabilidade deve ser preservada adicionando metadados mínimos ao `WeatherMarketEnrichment` e ao histórico já existente, sem criar um novo formato de artefato.

**Tech Stack:** TypeScript, Node.js, Vitest, Next.js dashboard, JSON history artifacts.

---

### Task 1: Classificar rate limit do Open-Meteo na fronteira do provider

**Files:**
- Modify: `src/weather/open-meteo.ts`
- Test: `tests/weather/open-meteo.test.ts`

**Step 1: Write the failing test**

Adicionar cobertura em `tests/weather/open-meteo.test.ts` para dois casos novos:

```ts
it('throws a specific rate-limit error when Open-Meteo returns 429 payload', async () => {
  await expect(
    fetchOpenMeteoForecast({
      latitude: 51.5072,
      longitude: -0.1276,
      forecastDays: 2,
      fetcher: async () => ({
        error: true,
        reason: 'Daily API request limit exceeded. Please try again tomorrow.',
      }),
    }),
  ).rejects.toMatchObject({
    message: 'open_meteo_rate_limited',
  });
});
```

Se preferir manter a detecção mais fiel ao runtime real, dividir a implementação do fetch padrão em uma função interna que inspeciona `response.status` e escrever um teste unitário para um helper como `classifyOpenMeteoPayload(...)`.

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/weather/open-meteo.test.ts`
Expected: FAIL porque hoje qualquer payload inválido vira apenas `invalid_open_meteo_payload`.

**Step 3: Write minimal implementation**

Em `src/weather/open-meteo.ts`:
- Introduzir um erro específico e determinístico para rate limit, por exemplo `open_meteo_rate_limited`.
- Detectar 429 do jeito mais cirúrgico possível:
  - ideal: no fetch default, verificar `response.status === 429` antes de `response.json()`;
  - complementarmente, aceitar o payload de erro usado nos testes (`{ error: true, reason: '...' }`) para manter a API injetável simples.
- Preservar `invalid_open_meteo_payload` para outros formatos inválidos.

Exemplo mínimo de direção:

```ts
function isOpenMeteoRateLimitPayload(input: unknown): boolean {
  return typeof input === 'object'
    && input !== null
    && 'reason' in input
    && typeof (input as { reason?: unknown }).reason === 'string'
    && (input as { reason: string }).reason.toLowerCase().includes('limit exceeded');
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/weather/open-meteo.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add tests/weather/open-meteo.test.ts src/weather/open-meteo.ts
git commit -m "fix: classify open-meteo rate limits"
```

### Task 2: Reusar forecast por localização dentro do mesmo ciclo

**Files:**
- Modify: `src/operator/simple-operator.ts`
- Test: `tests/operator/simple-operator.test.ts`

**Step 1: Write the failing test**

Adicionar um teste em `tests/operator/simple-operator.test.ts` cobrindo dois mercados da mesma cidade/data e provando que o provider é chamado apenas uma vez:

```ts
it('reuses the same forecast for markets sharing location and forecastDays', async () => {
  let calls = 0;

  const result = await runSimpleWeatherOperator({
    startingCapital: 1000,
    marketLimit: 10,
    forecastDays: 1,
    minEdge: 0.03,
    kellyFraction: 0.5,
    maxPositionUsd: 100,
    weatherLocations: [],
    gammaFetcher: async () => sameCityTemperatureMarkets,
    forecastProvider: {
      name: 'test-provider',
      fetchForecast: async () => {
        calls += 1;
        return londonForecast;
      },
    },
  });

  expect(calls).toBe(1);
  expect(result.weatherEnrichment).toHaveLength(2);
  expect(result.outputLines).toContain('weather_forecasts=2');
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/operator/simple-operator.test.ts -t "reuses the same forecast"`
Expected: FAIL porque hoje cada mercado chama `forecastProvider.fetchForecast(...)` separadamente.

**Step 3: Write minimal implementation**

Em `src/operator/simple-operator.ts`:
- Dentro de `enrichWeatherMarkets(...)`, criar um `Map<string, Promise<WeatherForecast>>` local ao ciclo.
- Chave sugerida: `${latitude}:${longitude}:${forecastDays}`.
- Ao encontrar a mesma chave, reutilizar a mesma promise/forecast em vez de chamar o provider novamente.
- Não criar cache global, TTL, nem persistência nova; o escopo deve ser somente o ciclo atual.

Direção mínima:

```ts
const forecastRequests = new Map<string, Promise<WeatherForecast>>();
const cacheKey = `${location.latitude}:${location.longitude}:${forecastDays}`;
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/operator/simple-operator.test.ts -t "reuses the same forecast"`
Expected: PASS

**Step 5: Commit**

```bash
git add tests/operator/simple-operator.test.ts src/operator/simple-operator.ts
git commit -m "fix: reuse forecasts within operator cycle"
```

### Task 3: Ler do histórico o último forecast válido compatível

**Files:**
- Modify: `src/history/operator-history.ts`
- Test: `tests/dashboard/dashboard-data.test.ts` (reference for record shape)
- Create or Modify: `tests/history/operator-history.test.ts`

**Step 1: Write the failing test**

Criar `tests/history/operator-history.test.ts` com um helper de leitura do último forecast válido por localização:

```ts
it('returns the latest compatible forecast from saved history for a location', async () => {
  // grava dois arquivos de histórico
  // o mais recente contém weatherEnrichment com latitude/longitude esperados
  const fallback = await readLatestForecastFallback({
    historyDir,
    latitude: 51.5072,
    longitude: -0.1276,
    forecastDays: 1,
  });

  expect(fallback).toMatchObject({
    source: 'history_fallback',
    runAt: '2026-05-01T12:00:00Z',
    historyFilePath: expect.stringContaining('.json'),
    forecast: expect.objectContaining({
      timezone: 'Europe/London',
      days: [expect.objectContaining({ date: '2026-05-01' })],
    }),
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/history/operator-history.test.ts`
Expected: FAIL porque hoje só existe `readLatestOperatorHistory(...)` e não há leitura seletiva de forecast.

**Step 3: Write minimal implementation**

Em `src/history/operator-history.ts`:
- Adicionar um helper pequeno, por exemplo `readLatestForecastFallback(...)`.
- Reutilizar os arquivos JSON existentes; não criar nova pasta nem novo artefato.
- Percorrer os históricos mais recentes para mais antigos até encontrar um `weatherEnrichment` com:
  - `forecast.latitude === latitude`
  - `forecast.longitude === longitude`
  - `forecast.days.length >= forecastDays`
- Retornar apenas o mínimo necessário para fallback auditável:

```ts
export interface ForecastHistoryFallback {
  forecast: WeatherForecast;
  runAt: string;
  historyFilePath: string;
}
```

Se `forecastDays` precisar ser estritamente igual em vez de `>=`, preferir igualdade para evitar reaproveitar horizonte diferente sem intenção.

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/history/operator-history.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add tests/history/operator-history.test.ts src/history/operator-history.ts
git commit -m "feat: load forecast fallback from history"
```

### Task 4: Aplicar fallback explícito no operador quando houver 429

**Files:**
- Modify: `src/operator/simple-operator.ts`
- Modify: `src/history/operator-history.ts`
- Test: `tests/operator/simple-operator.test.ts`

**Step 1: Write the failing test**

Adicionar um teste em `tests/operator/simple-operator.test.ts` para o comportamento crítico:

```ts
it('uses the latest saved forecast when Open-Meteo is rate-limited', async () => {
  const historyDir = await mkdtemp(join(tmpdir(), 'polymarket-fallback-'));
  // gravar histórico anterior com forecast válido para London

  const result = await runSimpleWeatherOperator({
    startingCapital: 1000,
    marketLimit: 10,
    forecastDays: 1,
    minEdge: 0.03,
    kellyFraction: 0.5,
    maxPositionUsd: 100,
    historyDir,
    weatherLocations: [],
    gammaFetcher: async () => londonMarkets,
    forecastProvider: {
      name: 'open-meteo',
      fetchForecast: async () => {
        throw new Error('open_meteo_rate_limited');
      },
    },
  });

  expect(result.weatherEnrichment[0]).toMatchObject({
    marketId: '2091487',
    providerName: 'open-meteo',
    forecastSource: 'history_fallback',
    fallbackReason: 'open_meteo_rate_limited',
    fallbackHistoryRunAt: '2026-05-01T12:00:00Z',
  });
  expect(result.outputLines).toContain('forecast_fallbacks=1');
  expect(result.outputLines).toContain('forecast_rate_limits=1');
});
```

Adicionar também o caso sem fallback disponível:

```ts
expect(result.weatherEnrichment).toEqual([]);
expect(result.outputLines).toContain('forecast_rate_limits=1');
expect(result.outputLines).toContain('forecast_fallbacks=0');
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/operator/simple-operator.test.ts -t "rate-limited"`
Expected: FAIL porque hoje o `catch` simplesmente faz `continue`.

**Step 3: Write minimal implementation**

Em `src/operator/simple-operator.ts`:
- Estender `WeatherMarketEnrichment` com metadados mínimos de auditabilidade:

```ts
forecastSource?: 'live' | 'history_fallback';
fallbackReason?: 'open_meteo_rate_limited';
fallbackHistoryRunAt?: string;
fallbackHistoryFilePath?: string;
```

- Em `enrichWeatherMarkets(...)`, quando `fetchForecast(...)` lançar `open_meteo_rate_limited`:
  - consultar `readLatestForecastFallback(...)` usando `options.historyDir`, `latitude`, `longitude`, `forecastDays`;
  - se existir fallback, usar esse forecast e preencher os metadados;
  - se não existir, continuar sem enrichment, mas registrar a falha em contadores/output lines.
- Quando o forecast vier normalmente, preencher `forecastSource: 'live'`.
- Manter o comportamento atual para outros erros não relacionados a 429.

Também atualizar `buildOutputLines(...)` para emitir métricas explícitas, por exemplo:

```ts
forecast_rate_limits=1
forecast_fallbacks=1
forecast_fallback_misses=0
```

Essas linhas preservam auditabilidade no runtime log, no histórico salvo e na dashboard que já consome `outputLines`.

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/operator/simple-operator.test.ts -t "rate-limited"`
Expected: PASS

**Step 5: Commit**

```bash
git add tests/operator/simple-operator.test.ts src/operator/simple-operator.ts src/history/operator-history.ts
git commit -m "fix: fallback to saved forecasts on open-meteo 429"
```

### Task 5: Persistir e expor a origem do forecast sem mudar a arquitetura da dashboard

**Files:**
- Modify: `src/history/operator-history.ts`
- Modify: `src/dashboard/dashboard-data.ts`
- Test: `tests/dashboard/dashboard-data.test.ts`

**Step 1: Write the failing test**

Adicionar cobertura em `tests/dashboard/dashboard-data.test.ts` validando que um histórico com fallback preserva os metadados na leitura da dashboard:

```ts
expect(data.outputLines).toContain('forecast_fallbacks=1');
expect(data.status.source).toBe('history');
expect(data.forecastRows[0]).toMatchObject({
  marketId: 'w1',
  locationLabel: 'London',
});
```

Se a UI já renderiza `outputLines`, isso pode bastar. Se não renderiza nenhum texto operacional do forecast, acrescentar ao `DashboardDataStatus.message` uma mensagem derivada quando houver fallback, por exemplo `Histórico carregado do último ciclo salvo; contém forecast reaproveitado por fallback.`

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/dashboard/dashboard-data.test.ts`
Expected: FAIL se os metadados/linhas novas ainda não estiverem preservados.

**Step 3: Write minimal implementation**

- Garantir que `OperatorHistoryRecord` continue serializando `weatherEnrichment` com os novos campos, sem criar um novo esquema paralelo.
- Em `src/dashboard/dashboard-data.ts`, reaproveitar `outputLines` já existentes para surfaced observability.
- Só adicionar mensagem de status extra se necessário para tornar o fallback visível sem redesenhar a página.

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/dashboard/dashboard-data.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add tests/dashboard/dashboard-data.test.ts src/dashboard/dashboard-data.ts src/history/operator-history.ts
git commit -m "feat: surface forecast fallback in dashboard status"
```

### Task 6: Full verification and required docs

**Files:**
- Modify: `docs/implementation-log.md`
- Modify: `docs/operator-cycle.md`
- Optional if continuity changes matter: `docs/session-handoff/*.md`

**Step 1: Run targeted tests**

Run:

```bash
npx vitest run tests/weather/open-meteo.test.ts
npx vitest run tests/history/operator-history.test.ts
npx vitest run tests/operator/simple-operator.test.ts
npx vitest run tests/dashboard/dashboard-data.test.ts
```

Expected: PASS

**Step 2: Run full validation**

Run:

```bash
npm test
npm run build
```

Expected: PASS

**Step 3: Manual operator smoke test**

Run:

```bash
npm run operator:paper -- --once --history-dir operator-runtime/history-smoke-429 --runtime-log-path operator-runtime/paper-observer-smoke-429.ndjson
```

Expected:
- Se o provider responder normalmente: `forecast_rate_limits=0`
- Se responder 429 e houver histórico compatível: `forecast_rate_limits>0` e `forecast_fallbacks>0`
- Nunca voltar ao estado silencioso em que `weather_forecasts=0` ocorre sem explicação operacional.

**Step 4: Update docs**

Atualizar `docs/implementation-log.md` com:
- cache intra-ciclo por localização
- fallback explícito por histórico em 429
- novos campos/métricas de auditabilidade
- resultado real de testes/build

Atualizar `docs/operator-cycle.md` com:
- quando o operador usa forecast live
- quando reaproveita histórico por rate limit
- como isso aparece em `outputLines`, histórico JSON e dashboard

Se a mudança afetar o handoff entre sessões, criar/atualizar `docs/session-handoff/...` com a limitação remanescente: fallback depende de existir histórico compatível previamente salvo.

**Step 5: Commit**

```bash
git add docs/implementation-log.md docs/operator-cycle.md docs/session-handoff/*.md
git commit -m "docs: record forecast fallback operational flow"
```

## Notes for the implementing agent

- Preferir igualdade de `forecastDays` no fallback. Reusar horizonte diferente pode mascarar erro de modelagem.
- Não introduzir cache global nem arquivo novo de cache. O histórico JSON já é a trilha auditável existente.
- Não esconder outros erros de forecast. O fallback é só para `open_meteo_rate_limited`.
- Não mudar o formato principal da dashboard. O topo/status e `outputLines` já são suficientes para a primeira versão.
- Se o teste de cache intra-ciclo mostrar que múltiplos mercados compartilham a mesma `Promise`, manter esse formato: evita race sem complexidade extra.
