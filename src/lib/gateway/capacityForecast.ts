/**
 * Capacity Usage Forecasting Engine
 * Analyzes real-time and historical API usage telemetry to forecast
 * infrastructure capacity needs across regions, endpoints, and resource types.
 *
 * Algorithms:
 *  - Exponential Weighted Moving Average (EWMA) for short-term smoothing
 *  - Linear regression for trend detection over rolling windows
 *  - Seasonal decomposition (day-of-week + hour-of-day pattern overlay)
 *  - P95/P99 headroom calculation for auto-scaling thresholds
 */

// ─── Types ──────────────────────────────────────────────────────────────────────

export type ResourceType = 'cpu' | 'memory' | 'rps' | 'egress_gb' | 'cache_hit_rate' | 'db_connections';
export type RegionId = 'us-east-1' | 'eu-west-1' | 'ap-south-1';
export type ForecastHorizon = '1h' | '6h' | '24h' | '7d' | '30d';
export type AlertSeverity = 'info' | 'warning' | 'critical';

export interface UsageDataPoint {
  timestamp: number;
  region: RegionId;
  resource: ResourceType;
  value: number;    // Raw observed value
  capacity: number; // Max available (e.g. 100 for CPU %, maxRPS for rps)
}

export interface ForecastPoint {
  timestamp: number;
  predicted: number;
  lowerBound: number; // 95% CI lower
  upperBound: number; // 95% CI upper
  utilizationPct: number;
}

export interface CapacityForecast {
  region: RegionId;
  resource: ResourceType;
  currentValue: number;
  currentUtilizationPct: number;
  trend: 'growing' | 'stable' | 'declining';
  trendRatePerHour: number;   // units per hour (positive = growing)
  forecastPoints: ForecastPoint[];
  breachAt?: number;          // Unix timestamp when capacity will be breached (if ever)
  breachIn?: string;          // Human-readable: "in ~4.2 hours"
  recommendedAction?: string;
  severity: AlertSeverity;
}

export interface InfrastructureForecastReport {
  generatedAt: number;
  horizon: ForecastHorizon;
  regions: RegionId[];
  forecasts: CapacityForecast[];
  summary: ForecastSummary;
}

export interface ForecastSummary {
  criticalAlerts: number;
  warningAlerts: number;
  scaleUpRecommendations: ScaleRecommendation[];
  estimatedCostImpact: string;
  overallHealthScore: number; // 0-100
}

export interface ScaleRecommendation {
  region: RegionId;
  resource: ResourceType;
  action: 'scale_up' | 'scale_out' | 'optimize' | 'reduce';
  urgency: 'immediate' | 'within_24h' | 'planned';
  detail: string;
}

// ─── Synthetic Time-Series Generator ────────────────────────────────────────────

/**
 * Generates realistic synthetic historical telemetry with:
 * - Diurnal (time-of-day) seasonality
 * - Weekly seasonality
 * - Upward growth trend
 * - Gaussian noise
 */
function generateHistoricalSeries(
  region: RegionId,
  resource: ResourceType,
  hours: number = 168 // 7 days of history
): UsageDataPoint[] {
  const now = Date.now();
  const points: UsageDataPoint[] = [];

  // Base utilization and capacity per resource
  const config: Record<ResourceType, { base: number; capacity: number; growthPerHour: number; amplitude: number }> = {
    cpu:            { base: 38, capacity: 100, growthPerHour: 0.08, amplitude: 18 },
    memory:         { base: 55, capacity: 100, growthPerHour: 0.04, amplitude: 8  },
    rps:            { base: 12000, capacity: 50000, growthPerHour: 12, amplitude: 4000 },
    egress_gb:      { base: 2.1, capacity: 20, growthPerHour: 0.02, amplitude: 0.8 },
    cache_hit_rate: { base: 78, capacity: 100, growthPerHour: 0.01, amplitude: 6  },
    db_connections: { base: 420, capacity: 1000, growthPerHour: 0.5, amplitude: 80 },
  };

  // Regional multipliers — ap-south-1 is growing fastest
  const regionMult: Record<RegionId, number> = {
    'us-east-1': 1.0,
    'eu-west-1': 0.7,
    'ap-south-1': 1.4,
  };

  const cfg = config[resource];
  const mult = regionMult[region];

  for (let i = hours * 4; i >= 0; i--) {
    // 15-minute intervals
    const ts = now - i * 15 * 60 * 1000;
    const date = new Date(ts);
    const hourOfDay = date.getUTCHours();
    const dayOfWeek = date.getUTCDay(); // 0=Sun

    // Diurnal pattern: peak at 10am-2pm UTC, trough at 3am-5am
    const diurnal = Math.sin(((hourOfDay - 4) / 24) * 2 * Math.PI) * cfg.amplitude;

    // Weekly pattern: lower on weekends
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const weeklyMult = isWeekend ? 0.65 : 1.0;

    // Growth trend
    const hoursFromEnd = i / 4;
    const trend = cfg.growthPerHour * (hours - hoursFromEnd) * mult;

    // Gaussian noise (Box-Muller)
    const u1 = Math.random(), u2 = Math.random();
    const noise = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2) * (cfg.amplitude * 0.15);

    const value = Math.max(0, (cfg.base + diurnal + trend + noise) * mult * weeklyMult);

    points.push({
      timestamp: ts,
      region,
      resource,
      value: Math.round(value * 100) / 100,
      capacity: cfg.capacity * (resource === 'rps' ? mult : 1),
    });
  }

  return points;
}

// ─── Algorithm Primitives ────────────────────────────────────────────────────────

/** Exponential Weighted Moving Average */
function ewma(values: number[], alpha: number = 0.15): number[] {
  const smoothed: number[] = [];
  let s = values[0];
  for (const v of values) {
    s = alpha * v + (1 - alpha) * s;
    smoothed.push(s);
  }
  return smoothed;
}

/** Ordinary Least Squares linear regression: returns {slope, intercept} */
function linearRegression(xs: number[], ys: number[]): { slope: number; intercept: number; r2: number } {
  const n = xs.length;
  const sumX = xs.reduce((a, b) => a + b, 0);
  const sumY = ys.reduce((a, b) => a + b, 0);
  const sumXY = xs.reduce((s, x, i) => s + x * ys[i], 0);
  const sumXX = xs.reduce((s, x) => s + x * x, 0);

  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX || 1);
  const intercept = (sumY - slope * sumX) / n;

  // R² calculation
  const meanY = sumY / n;
  const ssTot = ys.reduce((s, y) => s + (y - meanY) ** 2, 0);
  const ssRes = ys.reduce((s, y, i) => s + (y - (slope * xs[i] + intercept)) ** 2, 0);
  const r2 = ssTot === 0 ? 1 : 1 - ssRes / ssTot;

  return { slope, intercept, r2 };
}

/** Standard deviation */
function stddev(values: number[]): number {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

// ─── Forecasting Core ────────────────────────────────────────────────────────────

const HORIZON_HOURS: Record<ForecastHorizon, number> = {
  '1h': 1, '6h': 6, '24h': 24, '7d': 168, '30d': 720,
};

function horizonSteps(horizon: ForecastHorizon): number {
  return Math.min(HORIZON_HOURS[horizon] * 4, 120); // 15-min intervals, max 120 points
}

export function forecastCapacity(
  region: RegionId,
  resource: ResourceType,
  horizon: ForecastHorizon
): CapacityForecast {
  const history = generateHistoricalSeries(region, resource);
  const now = Date.now();

  // Smooth the series
  const values = history.map(p => p.value);
  const smoothed = ewma(values, 0.12);

  // Take only recent 72 hours for regression (more responsive)
  const recentWindow = smoothed.slice(-72 * 4);
  const xs = recentWindow.map((_, i) => i);
  const { slope, intercept, r2 } = linearRegression(xs, recentWindow);

  const capacity = history[history.length - 1].capacity;
  const currentValue = smoothed[smoothed.length - 1];
  const residualStd = stddev(
    recentWindow.map((v, i) => v - (slope * i + intercept))
  );

  // Determine trend
  const trendRatePerHour = slope * 4; // 4 points per hour
  const trend: 'growing' | 'stable' | 'declining' =
    Math.abs(trendRatePerHour) < 0.5 ? 'stable'
    : trendRatePerHour > 0 ? 'growing'
    : 'declining';

  // Build forecast points
  const steps = horizonSteps(horizon);
  const forecastPoints: ForecastPoint[] = [];

  for (let i = 1; i <= steps; i++) {
    const ts = now + i * 15 * 60 * 1000;
    const baseIdx = recentWindow.length + i;

    // Seasonal overlay (hour-of-day sine)
    const futureHour = new Date(ts).getUTCHours();
    const seasonal = Math.sin(((futureHour - 4) / 24) * 2 * Math.PI) * 8;

    const predicted = Math.max(0, slope * baseIdx + intercept + seasonal);
    const growingUncertainty = residualStd * (1 + i * 0.02); // uncertainty grows with horizon

    forecastPoints.push({
      timestamp: ts,
      predicted: Math.round(predicted * 100) / 100,
      lowerBound: Math.max(0, Math.round((predicted - 1.96 * growingUncertainty) * 100) / 100),
      upperBound: Math.round((predicted + 1.96 * growingUncertainty) * 100) / 100,
      utilizationPct: Math.round((predicted / capacity) * 10000) / 100,
    });
  }

  // Find breach time (when upperBound > 85% capacity = "soft breach" for scale-up trigger)
  const softCap = capacity * 0.85;
  const breachPoint = forecastPoints.find(p => p.upperBound >= softCap);
  let breachAt: number | undefined;
  let breachIn: string | undefined;

  if (breachPoint) {
    breachAt = breachPoint.timestamp;
    const msUntil = breachAt - now;
    const hoursUntil = msUntil / (1000 * 60 * 60);
    breachIn = hoursUntil < 1
      ? `in ~${Math.round(hoursUntil * 60)} minutes`
      : hoursUntil < 48
      ? `in ~${hoursUntil.toFixed(1)} hours`
      : `in ~${(hoursUntil / 24).toFixed(1)} days`;
  }

  // Severity + recommendation
  const utilizationPct = (currentValue / capacity) * 100;
  let severity: AlertSeverity = 'info';
  let recommendedAction: string | undefined;

  if (utilizationPct >= 85 || (breachAt && breachAt - now < 3 * 60 * 60 * 1000)) {
    severity = 'critical';
    recommendedAction = `IMMEDIATE: Scale ${resource} capacity in ${region}. Current utilization at ${utilizationPct.toFixed(1)}%.`;
  } else if (utilizationPct >= 65 || (breachAt && breachAt - now < 24 * 60 * 60 * 1000)) {
    severity = 'warning';
    recommendedAction = `Schedule capacity expansion for ${resource} in ${region} within 24 hours.`;
  } else if (trend === 'growing' && r2 > 0.8) {
    recommendedAction = `Plan capacity review for ${resource} in ${region} — strong growth trend detected (R²=${r2.toFixed(2)}).`;
  }

  return {
    region,
    resource,
    currentValue: Math.round(currentValue * 100) / 100,
    currentUtilizationPct: Math.round(utilizationPct * 100) / 100,
    trend,
    trendRatePerHour: Math.round(trendRatePerHour * 1000) / 1000,
    forecastPoints,
    breachAt,
    breachIn,
    recommendedAction,
    severity,
  };
}

// ─── Full Multi-Region Report ─────────────────────────────────────────────────────

export function generateForecastReport(
  horizon: ForecastHorizon = '24h',
  regions: RegionId[] = ['us-east-1', 'eu-west-1', 'ap-south-1'],
  resources: ResourceType[] = ['cpu', 'memory', 'rps', 'egress_gb', 'db_connections']
): InfrastructureForecastReport {
  const forecasts: CapacityForecast[] = [];

  for (const region of regions) {
    for (const resource of resources) {
      forecasts.push(forecastCapacity(region, resource, horizon));
    }
  }

  // Summarize
  const critical = forecasts.filter(f => f.severity === 'critical');
  const warnings = forecasts.filter(f => f.severity === 'warning');

  const recommendations: ScaleRecommendation[] = [];

  for (const f of forecasts) {
    if (f.severity === 'critical') {
      recommendations.push({
        region: f.region,
        resource: f.resource,
        action: f.trend === 'growing' ? 'scale_out' : 'scale_up',
        urgency: 'immediate',
        detail: f.recommendedAction || '',
      });
    } else if (f.severity === 'warning') {
      recommendations.push({
        region: f.region,
        resource: f.resource,
        action: 'scale_up',
        urgency: 'within_24h',
        detail: f.recommendedAction || '',
      });
    } else if (f.trend === 'declining') {
      recommendations.push({
        region: f.region,
        resource: f.resource,
        action: 'reduce',
        urgency: 'planned',
        detail: `${f.resource} in ${f.region} is declining — consider rightsizing to reduce costs.`,
      });
    }
  }

  const healthScore = Math.max(0, 100 - critical.length * 25 - warnings.length * 8);

  return {
    generatedAt: Date.now(),
    horizon,
    regions,
    forecasts,
    summary: {
      criticalAlerts: critical.length,
      warningAlerts: warnings.length,
      scaleUpRecommendations: recommendations,
      estimatedCostImpact: critical.length > 0
        ? `+$${(critical.length * 1200 + warnings.length * 300).toLocaleString()}/mo if unaddressed`
        : 'No unplanned cost exposure detected',
      overallHealthScore: healthScore,
    },
  };
}

// ─── Live Telemetry Snapshot ──────────────────────────────────────────────────────

export function getCurrentUsageSnapshot(): Record<RegionId, Record<ResourceType, number>> {
  const regions: RegionId[] = ['us-east-1', 'eu-west-1', 'ap-south-1'];
  const resources: ResourceType[] = ['cpu', 'memory', 'rps', 'egress_gb', 'cache_hit_rate', 'db_connections'];
  const snapshot: any = {};

  for (const region of regions) {
    snapshot[region] = {};
    for (const resource of resources) {
      const series = generateHistoricalSeries(region, resource, 2);
      const smoothed = ewma(series.map(p => p.value), 0.2);
      snapshot[region][resource] = Math.round(smoothed[smoothed.length - 1] * 100) / 100;
    }
  }

  return snapshot;
}
