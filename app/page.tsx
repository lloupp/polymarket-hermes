import { DashboardAutoRefresh } from './dashboard-auto-refresh';
import {
  buildDashboardData,
  type DashboardDataSource,
} from '../src/dashboard/dashboard-data';

const DEFAULT_HISTORY_DIR = 'operator-runtime/history';
const DEFAULT_SOURCE: DashboardDataSource = 'history';
const DEFAULT_MARKET_LIMIT = 20;
const DEFAULT_FORECAST_DAYS = 2;
const DEFAULT_MIN_EDGE = 0.03;
const DEFAULT_MAX_POSITION_USD = 100;
const DEFAULT_REFRESH_SECONDS = 0;
const DEFAULT_STARTING_CAPITAL = 1000;
const DEFAULT_KELLY_FRACTION = 0.5;

const DEFAULT_WEATHER_LOCATIONS = [
  {
    marketId: 'w1',
    latitude: 40.71,
    longitude: -74.01,
    label: 'New York City',
  },
  {
    marketId: 'w2',
    latitude: 25.76,
    longitude: -80.19,
    label: 'Miami',
  },
];

type SearchParamValue = string | string[] | undefined;

type DashboardPageProps = {
  searchParams?: Promise<Record<string, SearchParamValue>> | Record<string, SearchParamValue>;
};

function readParamValue(value: SearchParamValue, fallback: string): string {
  if (Array.isArray(value)) {
    return value[0] ?? fallback;
  }

  return value ?? fallback;
}

function readIntParam(value: SearchParamValue, fallback: number): number {
  const parsed = Number.parseInt(readParamValue(value, String(fallback)), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readFloatParam(value: SearchParamValue, fallback: number): number {
  const parsed = Number.parseFloat(readParamValue(value, String(fallback)));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readSource(value: SearchParamValue): DashboardDataSource {
  return readParamValue(value, DEFAULT_SOURCE) === 'live' ? 'live' : 'history';
}

export default async function DashboardPage({ searchParams }: DashboardPageProps = {}) {
  const params = searchParams ? await searchParams : {};
  const source = readSource(params.source);
  const historyDir = readParamValue(params.historyDir, DEFAULT_HISTORY_DIR);
  const marketLimit = readIntParam(params.marketLimit, DEFAULT_MARKET_LIMIT);
  const forecastDays = readIntParam(params.forecastDays, DEFAULT_FORECAST_DAYS);
  const minEdge = readFloatParam(params.minEdge, DEFAULT_MIN_EDGE);
  const maxPositionUsd = readFloatParam(params.maxPositionUsd, DEFAULT_MAX_POSITION_USD);
  const refreshSeconds = Math.max(0, readIntParam(params.refreshSeconds, DEFAULT_REFRESH_SECONDS));

  const data = source === 'live'
    ? await buildDashboardData({
        source: 'live',
        operatorOptions: {
          startingCapital: DEFAULT_STARTING_CAPITAL,
          marketLimit,
          forecastDays,
          minEdge,
          kellyFraction: DEFAULT_KELLY_FRACTION,
          maxPositionUsd,
          nowIso: new Date().toISOString(),
          historyDir,
          weatherLocations: DEFAULT_WEATHER_LOCATIONS,
        },
      })
    : await buildDashboardData({
        source: 'history',
        historyDir,
        startingCapital: DEFAULT_STARTING_CAPITAL,
      });

  return (
    <main style={styles.page}>
      {refreshSeconds > 0 ? <DashboardAutoRefresh refreshSeconds={refreshSeconds} /> : null}

      <section style={styles.headerSection}>
        <div>
          <p style={styles.eyebrow}>{data.hero.eyebrow}</p>
          <h1 style={styles.title}>{data.hero.title}</h1>
          <p style={styles.subtitle}>{data.hero.subtitle}</p>
        </div>
      </section>

      <section style={styles.panel}>
        <div style={styles.controlsHeader}>
          <div style={styles.stackCompact}>
            <h2 style={styles.panelTitle}>Controls</h2>
            <p style={styles.statusMessage}>{data.status.message ?? 'Sem mensagem de status.'}</p>
          </div>

          <div style={styles.statusGrid}>
            <div style={styles.statusItem}>
              <span style={styles.statusLabel}>Source</span>
              <strong>{data.status.source}</strong>
            </div>
            <div style={styles.statusItem}>
              <span style={styles.statusLabel}>Run At</span>
              <strong>{data.status.runAt ?? 'n/a'}</strong>
            </div>
            <div style={styles.statusItem}>
              <span style={styles.statusLabel}>History Dir</span>
              <strong style={styles.pathValue}>{data.status.historyDir ?? historyDir}</strong>
            </div>
            <div style={styles.statusItem}>
              <span style={styles.statusLabel}>History File</span>
              <strong style={styles.pathValue}>{data.status.historyFilePath ?? 'n/a'}</strong>
            </div>
          </div>
        </div>

        <form method="GET" style={styles.formGrid}>
          <label style={styles.field}>
            <span style={styles.fieldLabel}>Source</span>
            <select name="source" defaultValue={source} style={styles.input}>
              <option value="history">history</option>
              <option value="live">live</option>
            </select>
          </label>

          <label style={styles.fieldWide}>
            <span style={styles.fieldLabel}>History directory</span>
            <input name="historyDir" defaultValue={historyDir} style={styles.input} />
          </label>

          <label style={styles.field}>
            <span style={styles.fieldLabel}>Market limit</span>
            <input name="marketLimit" type="number" min={1} defaultValue={String(marketLimit)} style={styles.input} />
          </label>

          <label style={styles.field}>
            <span style={styles.fieldLabel}>Forecast days</span>
            <input name="forecastDays" type="number" min={1} defaultValue={String(forecastDays)} style={styles.input} />
          </label>

          <label style={styles.field}>
            <span style={styles.fieldLabel}>Min edge</span>
            <input name="minEdge" type="number" step="0.01" min={0} defaultValue={String(minEdge)} style={styles.input} />
          </label>

          <label style={styles.field}>
            <span style={styles.fieldLabel}>Max position USD</span>
            <input name="maxPositionUsd" type="number" step="0.01" min={0} defaultValue={String(maxPositionUsd)} style={styles.input} />
          </label>

          <label style={styles.field}>
            <span style={styles.fieldLabel}>Refresh seconds</span>
            <input name="refreshSeconds" type="number" min={0} defaultValue={String(refreshSeconds)} style={styles.input} />
          </label>

          <div style={styles.actionsRow}>
            <button type="submit" style={styles.button}>Apply</button>
          </div>
        </form>
      </section>

      <section style={styles.grid}>
        {data.dashboard.summaryCards.map((card) => (
          <article key={card.label} style={styles.card}>
            <p style={styles.cardLabel}>{card.label}</p>
            <strong style={styles.cardValue}>{card.value}</strong>
          </article>
        ))}
      </section>

      <section style={styles.columns}>
        <article style={styles.panel}>
          <h2 style={styles.panelTitle}>Weather Markets</h2>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Market</th>
                <th style={styles.th}>Category</th>
                <th style={styles.th}>YES</th>
                <th style={styles.th}>Liquidity</th>
                <th style={styles.th}>24h Volume</th>
                <th style={styles.th}>Discovery</th>
              </tr>
            </thead>
            <tbody>
              {data.dashboard.marketRows.map((row) => (
                <tr key={row.marketId}>
                  <td style={styles.td}>{row.question}</td>
                  <td style={styles.td}>{row.category}</td>
                  <td style={styles.td}>{row.yesPrice}</td>
                  <td style={styles.td}>{row.liquidity}</td>
                  <td style={styles.td}>{row.volume24h}</td>
                  <td style={styles.td}>
                    <div style={styles.discoveryCell}>
                      <span>{row.discoverySource ?? 'base'}</span>
                      <span style={styles.discoveryQuery}>{row.discoveryQuery ?? 'n/a'}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>

        <article style={styles.panel}>
          <h2 style={styles.panelTitle}>Positions</h2>
          <div style={styles.stack}>
            <div style={styles.stack}>
              <h3 style={styles.sectionTitle}>Open Positions</h3>
              {data.dashboard.openPositionRows.length === 0 ? (
                <div style={styles.emptyState}>Nenhuma posição aberta ainda.</div>
              ) : (
                data.dashboard.openPositionRows.map((position) => (
                  <div key={`${position.marketId}-${position.status}`} style={styles.positionCard}>
                    <strong>{position.marketId}</strong>
                    <span>Outcome: {position.outcome}</span>
                    <span>Entry: {position.entryPrice}</span>
                    <span>Shares: {position.shares}</span>
                    <span>Notional: {position.notional}</span>
                    <span>Status: {position.status}</span>
                  </div>
                ))
              )}
            </div>

            <div style={styles.stack}>
              <h3 style={styles.sectionTitle}>Closed Positions</h3>
              {data.dashboard.closedPositionRows.length === 0 ? (
                <div style={styles.emptyState}>Nenhuma posição fechada ainda.</div>
              ) : (
                data.dashboard.closedPositionRows.map((position) => (
                  <div key={`${position.marketId}-${position.status}`} style={styles.positionCard}>
                    <strong>{position.marketId}</strong>
                    <span>Outcome: {position.outcome}</span>
                    <span>Entry: {position.entryPrice}</span>
                    <span>Shares: {position.shares}</span>
                    <span>Notional: {position.notional}</span>
                    <span>Status: {position.status}</span>
                    {position.exitReason ? <span>Exit reason: {position.exitReason}</span> : null}
                  </div>
                ))
              )}
            </div>
          </div>
        </article>
      </section>

      <section style={styles.columns}>
        <article style={styles.panel}>
          <h2 style={styles.panelTitle}>Weather Forecasts</h2>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Market</th>
                <th style={styles.th}>Location</th>
                <th style={styles.th}>Date</th>
                <th style={styles.th}>Rain %</th>
                <th style={styles.th}>Rain (mm)</th>
                <th style={styles.th}>Wind</th>
                <th style={styles.th}>Source</th>
              </tr>
            </thead>
            <tbody>
              {data.forecastRows.map((row) => (
                <tr key={`${row.marketId}-${row.locationLabel}`}>
                  <td style={styles.td}>{row.marketId}</td>
                  <td style={styles.td}>{row.locationLabel}</td>
                  <td style={styles.td}>{row.nextDate}</td>
                  <td style={styles.td}>{row.precipitationProbability}</td>
                  <td style={styles.td}>{row.precipitationSum}</td>
                  <td style={styles.td}>{row.windSpeed}</td>
                  <td style={styles.td}>
                    <div style={styles.discoveryCell}>
                      <span>{row.forecastSource ?? 'live'}</span>
                      <span style={styles.discoveryQuery}>{row.fallbackRunAt ?? row.fallbackHistoryFilePath ?? 'n/a'}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>

        <article style={styles.panel}>
          <h2 style={styles.panelTitle}>Operator Output</h2>
          <div style={styles.stack}>
            {data.outputLines.map((line) => (
              <div key={line} style={styles.logRow}>
                {line}
              </div>
            ))}
          </div>
        </article>
      </section>

      <section style={styles.panel}>
        <h2 style={styles.panelTitle}>Recent Decisions</h2>
        <div style={styles.stack}>
          {data.dashboard.recentDecisions.map((decision) => (
            <div key={decision} style={styles.logRow}>
              {decision}
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: 'linear-gradient(180deg, #07111f 0%, #0f172a 100%)',
    color: '#e2e8f0',
    padding: '32px',
    fontFamily: 'Inter, Arial, sans-serif',
  },
  headerSection: {
    marginBottom: '24px',
  },
  eyebrow: {
    textTransform: 'uppercase',
    letterSpacing: '0.12em',
    color: '#38bdf8',
    margin: 0,
    fontSize: '12px',
  },
  title: {
    margin: '8px 0',
    fontSize: '36px',
  },
  subtitle: {
    margin: 0,
    color: '#94a3b8',
    maxWidth: '760px',
  },
  controlsHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '20px',
    marginBottom: '20px',
    flexWrap: 'wrap',
  },
  statusGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: '12px',
    flex: 1,
  },
  statusItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    padding: '12px 14px',
    borderRadius: '12px',
    background: 'rgba(30, 41, 59, 0.65)',
  },
  statusLabel: {
    color: '#94a3b8',
    fontSize: '12px',
  },
  statusMessage: {
    margin: 0,
    color: '#94a3b8',
  },
  pathValue: {
    wordBreak: 'break-all',
  },
  formGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: '16px',
    alignItems: 'end',
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  fieldWide: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    gridColumn: 'span 2',
  },
  fieldLabel: {
    fontSize: '12px',
    color: '#94a3b8',
  },
  input: {
    background: 'rgba(15, 23, 42, 0.95)',
    color: '#e2e8f0',
    border: '1px solid rgba(148, 163, 184, 0.25)',
    borderRadius: '10px',
    padding: '10px 12px',
  },
  actionsRow: {
    display: 'flex',
    alignItems: 'flex-end',
  },
  button: {
    background: '#38bdf8',
    color: '#07111f',
    border: 'none',
    borderRadius: '10px',
    padding: '10px 16px',
    fontWeight: 700,
    cursor: 'pointer',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: '16px',
    marginBottom: '24px',
    marginTop: '24px',
  },
  card: {
    background: 'rgba(15, 23, 42, 0.75)',
    border: '1px solid rgba(56, 189, 248, 0.15)',
    borderRadius: '16px',
    padding: '16px',
    boxShadow: '0 8px 30px rgba(2, 6, 23, 0.35)',
  },
  cardLabel: {
    margin: 0,
    color: '#94a3b8',
    fontSize: '13px',
  },
  cardValue: {
    display: 'block',
    marginTop: '8px',
    fontSize: '24px',
  },
  columns: {
    display: 'grid',
    gridTemplateColumns: '2fr 1fr',
    gap: '24px',
    marginBottom: '24px',
  },
  panel: {
    background: 'rgba(15, 23, 42, 0.75)',
    border: '1px solid rgba(148, 163, 184, 0.15)',
    borderRadius: '20px',
    padding: '20px',
    boxShadow: '0 8px 30px rgba(2, 6, 23, 0.35)',
  },
  panelTitle: {
    marginTop: 0,
    marginBottom: '16px',
    fontSize: '20px',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
  },
  th: {
    textAlign: 'left',
    fontSize: '12px',
    color: '#94a3b8',
    paddingBottom: '12px',
    borderBottom: '1px solid rgba(148, 163, 184, 0.2)',
  },
  td: {
    padding: '12px 0',
    borderBottom: '1px solid rgba(30, 41, 59, 0.9)',
    verticalAlign: 'top',
  },
  discoveryCell: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  discoveryQuery: {
    color: '#94a3b8',
    fontSize: '12px',
  },
  stack: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  stackCompact: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  sectionTitle: {
    margin: '0 0 8px',
    fontSize: '16px',
    color: '#cbd5e1',
  },
  positionCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    padding: '14px',
    borderRadius: '14px',
    background: 'rgba(30, 41, 59, 0.65)',
  },
  emptyState: {
    padding: '14px',
    borderRadius: '14px',
    background: 'rgba(30, 41, 59, 0.65)',
    color: '#94a3b8',
  },
  logRow: {
    padding: '12px 14px',
    borderRadius: '12px',
    background: 'rgba(30, 41, 59, 0.65)',
    color: '#cbd5e1',
  },
};
