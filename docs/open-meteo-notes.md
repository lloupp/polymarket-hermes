# Open-Meteo Notes

## Endpoint validado
- `https://api.open-meteo.com/v1/forecast`

## Query base usada
```text
latitude=40.71
longitude=-74.01
forecast_days=1
timezone=auto
daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,wind_speed_10m_max
```

## Campos usados no MVP
- `latitude`
- `longitude`
- `timezone`
- `daily.time`
- `daily.temperature_2m_max`
- `daily.temperature_2m_min`
- `daily.precipitation_probability_max`
- `daily.precipitation_sum`
- `daily.wind_speed_10m_max`

## Evidência rápida
Resposta observada via teste HTTP/Python:
- payload tipo `dict`
- chaves presentes: `daily`, `latitude`, `longitude`, `timezone`
- exemplo `daily.time[0] = '2026-04-28'`

## Observação
Nesta fase o projeto usa Open-Meteo apenas como enriquecimento read-only para mercados filtrados de clima.
Ainda não há execução automática de ordens reais nem dependência de OpenClaw.
