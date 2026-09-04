import { DailyMetric } from './store';
import { ENDPOINTS } from './constants';

export interface AIInsight {
  id: string;
  type: 'success' | 'warning' | 'info';
  message: string;
  metricData?: number[];
  metricLabel?: string;
}

export function generateInsights(dailyMetrics: DailyMetric[], environment: string): AIInsight[] {
  const envMetrics = dailyMetrics.filter(m => m.environment === environment).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  
  if (envMetrics.length < 7) return []; // Need at least 7 days for analysis

  const insights: AIInsight[] = [];
  const latestWeek = envMetrics.slice(-7);
  const previousWeek = envMetrics.slice(-14, -7);

  let latestVol = 0;
  let previousVol = 0;

  latestWeek.forEach(d => {
    Object.values(d.endpoints).forEach(m => {
      latestVol += m.volume;
    });
  });

  previousWeek.forEach(d => {
    Object.values(d.endpoints).forEach(m => {
      previousVol += m.volume;
    });
  });

  // 1. Volume Spikes
  if (previousVol > 0 && latestVol > previousVol * 1.2) {
    const increase = (((latestVol - previousVol) / previousVol) * 100).toFixed(0);
    insights.push({
      id: 'vol_spike',
      type: 'success',
      message: `Excellent growth! Overall API traffic has surged by ${increase}% compared to last week.`,
      metricData: latestWeek.map(d => {
        let v = 0;
        Object.values(d.endpoints).forEach(m => v += m.volume);
        return v;
      }),
      metricLabel: 'Volume'
    });
  }

  // 2. Error Rate Spikes (Specific endpoints)
  ENDPOINTS.slice(1).forEach(ep => {
    let epLatestErrs = 0;
    let epLatestVol = 0;
    latestWeek.forEach(d => {
      const m = d.endpoints[ep.id];
      if (m) {
        epLatestErrs += m.errors5xx + m.errors4xx;
        epLatestVol += m.volume;
      }
    });

    if (epLatestVol > 0) {
      const rate = (epLatestErrs / epLatestVol);
      if (rate > 0.05) { // Over 5% error rate on an endpoint over 7 days
        insights.push({
          id: `err_${ep.id}`,
          type: 'warning',
          message: `Elevated error rate detected on ${ep.label}. ${ (rate * 100).toFixed(1) }% of requests failed in the last 7 days.`,
          metricData: latestWeek.map(d => (d.endpoints[ep.id]?.errors5xx || 0) + (d.endpoints[ep.id]?.errors4xx || 0)),
          metricLabel: 'Errors'
        });
      }
    }
  });

  // 3. Fallback info
  if (insights.length === 0) {
    insights.push({
      id: 'stable',
      type: 'info',
      message: 'All systems are operating normally. Traffic and error rates remain stable across all endpoints.',
    });
  }

  return insights;
}
