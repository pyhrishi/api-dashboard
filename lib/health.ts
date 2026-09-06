/**
 * Platform health — deterministic snapshot (single source of truth).
 *
 * Powers both the programmatic `GET /api/health` endpoint and the public
 * `/status` page, so the page can never disagree with the API. Per-component
 * status, latency, and a 60-day uptime history are derived from a stable hash
 * (no `Math.random`, no wall-clock read), so the snapshot is identical every
 * time — the property a status source must have.
 */

export type ComponentStatus = 'operational' | 'degraded' | 'down';

export interface HealthComponent {
  key: string;
  name: string;
  /** Current status. */
  status: ComponentStatus;
  /** Median response time, ms. */
  latency_ms: number;
  /** Uptime over the window, percent (e.g. 99.98). */
  uptime: number;
  /** Oldest → newest daily status over `window_days`. */
  history: ComponentStatus[];
}

export interface HealthSnapshot {
  /** Worst current component status. */
  status: ComponentStatus;
  degraded: boolean;
  components: HealthComponent[];
  /** Mean component uptime over the window, percent. */
  uptime: number;
  window_days: number;
  updated_at: string;
}

const WINDOW_DAYS = 60;
/** Fixed demo clock so the snapshot is deterministic (never Date.now here). */
const HEALTH_NOW = Date.UTC(2026, 8, 6);

const COMPONENTS: { key: string; name: string }[] = [
  { key: 'gateway', name: 'API Gateway' },
  { key: 'identity', name: 'Identity Engine' },
  { key: 'company', name: 'Company Graph' },
  { key: 'billing', name: 'Billing & Metering' },
  { key: 'webhooks', name: 'Webhook Dispatcher' },
  { key: 'console', name: 'Zinbit Console' },
];

function hash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const worst = (a: ComponentStatus, b: ComponentStatus): ComponentStatus =>
  a === 'down' || b === 'down' ? 'down' : a === 'degraded' || b === 'degraded' ? 'degraded' : 'operational';

function buildComponent(key: string, name: string): HealthComponent {
  const history: ComponentStatus[] = [];
  for (let day = 0; day < WINDOW_DAYS; day++) {
    // Rare, deterministic historical blips; today (last day) is always green.
    const isToday = day === WINDOW_DAYS - 1;
    const roll = hash(`${key}:${day}`) % 1000;
    history.push(!isToday && roll < 6 ? 'degraded' : 'operational');
  }
  const good = history.filter((s) => s === 'operational').length;
  const uptime = Math.round((good / WINDOW_DAYS) * 10000) / 100;
  return {
    key,
    name,
    status: history[WINDOW_DAYS - 1], // current = today
    latency_ms: 28 + (hash(key) % 140),
    uptime,
    history,
  };
}

export function getHealthSnapshot(): HealthSnapshot {
  const components = COMPONENTS.map((c) => buildComponent(c.key, c.name));
  const status = components.reduce<ComponentStatus>((acc, c) => worst(acc, c.status), 'operational');
  const uptime = Math.round((components.reduce((n, c) => n + c.uptime, 0) / components.length) * 100) / 100;
  return {
    status,
    degraded: status !== 'operational',
    components,
    uptime,
    window_days: WINDOW_DAYS,
    updated_at: new Date(HEALTH_NOW).toISOString(),
  };
}
