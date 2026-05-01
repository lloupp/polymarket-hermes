# Polymarket API Notes

## Endpoint read-only escolhido
Base inicial adotada para leitura de mercados:

- `https://gamma-api.polymarket.com/markets?limit=N`

## Evidência coletada
Teste manual feito no ambiente retornou `HTTP 200` e payload JSON em lista.

Também foi observado no header:
- `deprecation: true`
- `warning: 299 - "use /markets/keyset"`

## Implicação prática
Para o MVP inicial, o endpoint atual ainda serve para:
- descobrir shape do payload
- normalizar mercados
- validar ingestão read-only

Mas a integração foi escrita de forma que possamos trocar depois a fonte/estratégia de fetch com impacto pequeno.

## Campos observados no payload
Exemplos relevantes vistos no retorno real:
- `id`
- `question`
- `slug`
- `endDate`
- `liquidity`
- `volume24hr`
- `tags`
- `outcomes`
- `outcomePrices`
- `category`

## Observação arquitetural
Como o endpoint atual já acusa depreciação, a camada `src/ingestion/polymarket.ts` foi mantida pequena e focada em:
- validar shape
- normalizar números
- extrair tags
- devolver nosso tipo interno `Market`

Assim, quando migrarmos para `/markets/keyset` ou outra rota, o restante do pipeline não deve quebrar.
