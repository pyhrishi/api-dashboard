'use client';

import { useMemo, useState, useEffect } from 'react';
import { useStore } from '@/lib/store';
import { motion, AnimatePresence } from 'framer-motion';
import { Activity, Clock, AlertTriangle, CheckCircle2, TrendingUp, TrendingDown, ArrowUpRight, Inbox, RefreshCw, Zap, Sparkles, Network, BellPlus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, LineChart, Line, ComposedChart, Bar, BarChart, Legend } from 'recharts';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ENDPOINTS } from '@/lib/constants';
import { ENDPOINTS as FULL_ENDPOINTS } from '@/src/data/endpoints';
import { EndpointFilter } from '@/components/EndpointFilter';
import { StatusPageModal } from './StatusPageModal';
import { generateRootCauseAnalysis } from '@/lib/insight-engine';
import { AlertConfigDrawer } from './AlertConfigDrawer';
import { LiveFirehose } from '@/components/LiveFirehose';
import { AIInsightsBanner } from '@/components/AIInsightsBanner';
import { BellRing } from 'lucide-react';

type Timeframe = '24h' | '7d' | '30d';

export default function AnalyticsPage() {
  const router = useRouter();
  const { environment, dailyMetrics, initializeAnalyticsIfNeeded, statusPageConfig, apiLogs } = useStore();
  
  const [status, setStatus] = useState<'loading' | 'error' | 'success'>('loading');
  const [timeframe, setTimeframe] = useState<Timeframe>('30d');
  const [selectedEndpoint, setSelectedEndpoint] = useState('all');
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [isAlertDrawerOpen, setIsAlertDrawerOpen] = useState(false);
  
  // AI RCA State
  const [isRcaScanning, setIsRcaScanning] = useState(false);
  const [rcaResult, setRcaResult] = useState<string | null>(null);

  useEffect(() => {
    // Simulate robust network lifecycle
    setStatus('loading');
    const timer = setTimeout(() => {
      try {
        initializeAnalyticsIfNeeded();
        setStatus('success');
      } catch {
        setStatus('error');
      }
    }, 1200);
    return () => clearTimeout(timer);
  }, [initializeAnalyticsIfNeeded, environment]); // Re-trigger load on env switch for premium feel

  // Data Aggregation logic
  const envMetrics = useMemo(() => {
    let days = 30;
    if (timeframe === '7d') days = 7;
    if (timeframe === '24h') days = 1;
    
    const sorted = [...dailyMetrics]
      .filter(m => m.environment === environment)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      
    return sorted.slice(-days);
  }, [dailyMetrics, environment, timeframe]);

  const isEmpty = envMetrics.length === 0;

  // Chart Data
  const chartData = useMemo(() => {
    return envMetrics.map(d => {
      const point: Record<string, string | number> = { date: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) };
      
      let totalVol = 0;
      let totalLat = 0;
      
      if (selectedEndpoint === 'all') {
        Object.entries(d.endpoints).forEach(([path, m]) => {
          point[path] = m.volume;
          totalVol += m.volume;
          totalLat += m.totalLatency;
        });
      } else {
        const m = d.endpoints[selectedEndpoint];
        if (m) {
          point[selectedEndpoint] = m.volume;
          totalVol += m.volume;
          totalLat += m.totalLatency;
        } else {
          point[selectedEndpoint] = 0;
        }
      }
      
      point.volume = totalVol;
      point.latency = totalVol > 0 ? Math.floor(totalLat / totalVol) : 0;
      return point;
    });
  }, [envMetrics, selectedEndpoint]);

  // Migration Velocity Data
  const migrationVelocityData = useMemo(() => {
    return envMetrics.map(d => {
      let legacy = 0;
      let modern = 0;
      Object.entries(d.endpoints).forEach(([path, m]) => {
        const ep = FULL_ENDPOINTS.find(e => e.path === path);
        if (ep?.isDeprecated) {
          legacy += m.volume;
        } else {
          modern += m.volume;
        }
      });
      return {
        date: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        Legacy: legacy,
        Modern: modern
      };
    });
  }, [envMetrics]);

  // KPIs
  const kpis = useMemo(() => {
    let volume = 0, success = 0, err4xx = 0, err5xx = 0, totalLat = 0;
    
    envMetrics.forEach(d => {
      Object.entries(d.endpoints).forEach(([path, m]) => {
        if (selectedEndpoint === 'all' || selectedEndpoint === path) {
          volume += m.volume;
          success += m.success;
          err4xx += m.errors4xx;
          err5xx += m.errors5xx;
          totalLat += m.totalLatency;
        }
      });
    });

    const avgLatency = volume > 0 ? Math.floor(totalLat / volume) : 0;
    const successRate = volume > 0 ? ((success / volume) * 100).toFixed(2) : '0.00';
    const errorRate = volume > 0 ? (((err4xx + err5xx) / volume) * 100).toFixed(2) : '0.00';

    // Mock trends based on previous period logic
    const isLive = environment === 'live';

    return {
      volume,
      successRate,
      latency: avgLatency,
      errorRate,
      trends: {
        volume: { val: isLive ? '+12.5%' : '+4.2%', up: true },
        success: { val: isLive ? '+0.01%' : '-0.5%', up: isLive },
        latency: { val: isLive ? '-12ms' : '+45ms', up: isLive },
        error: { val: isLive ? '-0.01%' : '+2.4%', up: isLive }
      }
    };
  }, [envMetrics, selectedEndpoint, environment]);

  // Table Data
  const endpointTableData = useMemo(() => {
    const paths = Array.from(new Set(envMetrics.flatMap(d => Object.keys(d.endpoints))));
    
    return paths.map(path => {
      let vol = 0, succ = 0, lat = 0;
      const trend: { val: number }[] = [];
      
      envMetrics.forEach(d => {
        const m = d.endpoints[path];
        if (m) {
          vol += m.volume;
          succ += m.success;
          lat += m.totalLatency;
          trend.push({ val: m.volume });
        } else {
          trend.push({ val: 0 });
        }
      });

      return {
        path,
        volume: vol,
        latency: vol > 0 ? Math.floor(lat / vol) : 0,
        success: vol > 0 ? Number(((succ / vol) * 100).toFixed(2)) : 0,
        trend
      };
    }).sort((a, b) => b.volume - a.volume);
  }, [envMetrics]);

  // Error Chart Data
  const errorChartData = useMemo(() => {
    if (selectedEndpoint === 'all') {
      const data: Record<string, { endpoint: string; '4xx': number; '5xx': number }> = {};
      envMetrics.forEach(d => {
        Object.entries(d.endpoints).forEach(([path, m]) => {
          if (!data[path]) data[path] = { endpoint: path, '4xx': 0, '5xx': 0 };
          data[path]['4xx'] += m.errors4xx;
          data[path]['5xx'] += m.errors5xx;
        });
      });
      return Object.values(data);
    } else {
      // Endpoint View - Time Series
      return envMetrics.map(d => {
        const m = d.endpoints[selectedEndpoint];
        return {
          date: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          '4xx': m ? m.errors4xx : 0,
          '5xx': m ? m.errors5xx : 0,
          endpoint: selectedEndpoint
        };
      });
    }
  }, [envMetrics, selectedEndpoint]);

  // Total Errors check for Zero State
  const totalErrors = useMemo(() => {
    return errorChartData.reduce((acc, curr) => acc + (curr['4xx'] || 0) + (curr['5xx'] || 0), 0);
  }, [errorChartData]);

  // Extract HTTP Error Taxonomy & Blast Radius from Live Logs
  const { errorTaxonomy, blastRadius, errorLogs } = useMemo(() => {
    if (selectedEndpoint === 'all') return { errorTaxonomy: [], blastRadius: 0, errorLogs: [] };
    
    // Scan apiLogs for the last selected timeframe errors
    const timeframeMs = timeframe === '24h' ? 24*60*60*1000 : timeframe === '7d' ? 7*24*60*60*1000 : 30*24*60*60*1000;
    const now = Date.now();
    
    const relevantLogs = apiLogs.filter(log => 
      log.environment === environment &&
      log.path === selectedEndpoint &&
      log.status >= 400 &&
      (now - new Date(log.timestamp).getTime() <= timeframeMs)
    );
    
    const counts: Record<number, number> = {};
    const uniqueIps = new Set<string>();
    
    relevantLogs.forEach(log => {
      counts[log.status] = (counts[log.status] || 0) + 1;
      if (log.ip) uniqueIps.add(log.ip);
    });
    
    return {
      errorTaxonomy: Object.entries(counts).map(([status, count]) => ({ status: Number(status), count })).sort((a,b) => b.count - a.count),
      blastRadius: uniqueIps.size,
      errorLogs: relevantLogs.map(l => ({ status: l.status, ip: l.ip, timestamp: l.timestamp, duration: l.duration }))
    };
  }, [apiLogs, selectedEndpoint, environment, timeframe]);

  const handleGenerateRca = () => {
    setIsRcaScanning(true);
    setRcaResult(null);
    setTimeout(() => {
      setIsRcaScanning(false);
      setRcaResult(generateRootCauseAnalysis(selectedEndpoint, errorLogs));
    }, 2500);
  };

  type TooltipPayloadItem = { dataKey?: string | number; value?: number | string };
  const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: TooltipPayloadItem[]; label?: string | number }) => {
    if (active && payload && payload.length) {
      return (
        <div className="glass-inner bg-[#14131E]/90 border border-border p-4 rounded-xl shadow-2xl backdrop-blur-xl">
          <p className="text-fg-muted text-xs font-bold uppercase tracking-widest mb-3">{label}</p>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-6">
              <span className="text-teal font-medium flex items-center gap-1.5"><Activity className="w-3.5 h-3.5" /> Volume</span>
              <span className="text-fg font-bold">{payload[0]?.value?.toLocaleString() || 0} reqs</span>
            </div>
            <div className="flex items-center justify-between gap-6">
              <span className="text-semantic-warning font-medium flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> Latency</span>
              <span className="text-fg font-bold">{payload.find((p) => p.dataKey === 'latency')?.value || 0} ms</span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  if (status === 'error') {
    return (
      <div className="max-w-[1200px] mx-auto h-[600px] flex flex-col items-center justify-center text-center">
        <AlertTriangle className="w-16 h-16 text-semantic-error mb-4 opacity-80" />
        <h2 className="text-2xl font-bold text-fg mb-2">Failed to load analytics</h2>
        <p className="text-fg-muted max-w-md mb-6">We encountered an issue retrieving your global health metrics. Please try again.</p>
        <button 
          onClick={() => setStatus('loading')}
          className="px-6 py-3 bg-glass hover:bg-glass-2 border border-border text-fg font-bold rounded-xl flex items-center gap-2 transition-colors"
        >
          <RefreshCw className="w-4 h-4" /> Retry Connection
        </button>
      </div>
    );
  }

  if (status === 'loading') {
    return (
      <div className="max-w-[1200px] mx-auto space-y-8 pb-12 animate-pulse">
        <div className="flex justify-between items-center">
          <div className="h-10 w-48 bg-glass rounded-lg" />
          <div className="h-10 w-64 bg-glass rounded-lg" />
        </div>
        <div className="grid grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <div key={i} className="h-32 bg-glass rounded-2xl" />)}
        </div>
        <div className="h-[400px] bg-glass rounded-2xl" />
        <div className="h-[300px] bg-glass rounded-2xl" />
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div className="max-w-[1200px] mx-auto h-[700px] flex flex-col items-center justify-center text-center animate-fade-in">
        <div className="w-24 h-24 bg-teal/10 rounded-full flex items-center justify-center mb-6 border border-teal/20 shadow-[0_0_30px_rgba(0,240,255,0.1)]">
          <Inbox className="w-10 h-10 text-teal" />
        </div>
        <h2 className="text-3xl font-display font-bold text-fg mb-3">No Traffic Yet</h2>
        <p className="text-fg-muted max-w-lg mb-8 text-lg">
          Your {environment} environment hasn&apos;t received any API requests in the selected timeframe. Start making requests to populate your global health metrics.
        </p>
        <button 
          onClick={() => router.push('/console/explorer')}
          className="px-8 py-4 bg-teal hover:bg-teal-hover text-black font-extrabold rounded-xl flex items-center gap-3 transition-colors shadow-[0_0_20px_rgba(0,240,255,0.3)]"
        >
          <Zap className="w-5 h-5" /> Go to API Explorer
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-[1200px] mx-auto space-y-8 pb-12">
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6"
      >
        <div>
          <h1 className="text-3xl font-display font-extrabold text-fg flex items-center gap-3">
            Global Health
            <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-widest border", environment === 'live' ? "bg-[#5D5FEF]/10 text-[#5D5FEF] border-[#5D5FEF]/20" : "bg-[#00F0FF]/10 text-[#00F0FF] border-[#00F0FF]/20")}>
              {environment}
            </span>
          </h1>
          <div className="flex items-center gap-4 mt-1">
            <p className="text-fg-muted max-w-xl text-sm hidden lg:block">Real-time telemetry, traffic volume, and endpoint performance monitoring.</p>
            <button
              onClick={() => setIsStatusModalOpen(true)}
              className={cn(
                "px-3 py-1.5 text-xs font-bold rounded-lg border transition-colors flex items-center gap-2",
                statusPageConfig.isPublished 
                  ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20 hover:bg-emerald-500/20"
                  : "bg-glass text-fg-muted border-border hover:bg-glass-2"
              )}
            >
              {statusPageConfig.isPublished ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Activity className="w-3.5 h-3.5" />}
              Status Page
            </button>
            <button
              onClick={() => setIsAlertDrawerOpen(true)}
              className="px-3 py-1.5 text-xs font-bold rounded-lg border bg-glass text-fg-muted border-border hover:bg-glass-2 transition-colors flex items-center gap-2"
            >
              <BellRing className="w-3.5 h-3.5" />
              Configure Alerts
            </button>
          </div>
        </div>
        
        <div className="flex items-center gap-4 z-50 relative bg-[#121212] p-1.5 rounded-xl border border-border">
          <EndpointFilter 
            selected={selectedEndpoint} 
            onChange={(id) => setSelectedEndpoint(id)} 
          />
          <div className="w-[1px] h-6 bg-white/10" />
          <div className="flex items-center gap-1">
            {(['24h', '7d', '30d'] as Timeframe[]).map((tf) => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={cn(
                  "relative px-4 py-1.5 text-xs font-bold rounded-lg transition-colors",
                  timeframe === tf ? "text-fg" : "text-fg-muted hover:text-fg"
                )}
              >
                {timeframe === tf && (
                  <motion.div
                    layoutId="timeframe-indicator"
                    className="absolute inset-0 bg-white/10 rounded-lg border border-border-subtle"
                    transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                  />
                )}
                <span className="relative z-10">{tf}</span>
              </button>
            ))}
          </div>
        </div>
      </motion.div>

      <AIInsightsBanner />

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Volume', value: kpis.volume.toLocaleString(), icon: Activity, color: environment === 'live' ? 'text-[#5D5FEF]' : 'text-[#00F0FF]', trend: kpis.trends.volume, isLatency: false },
          { label: 'Success Rate', value: `${kpis.successRate}%`, icon: CheckCircle2, color: 'text-semantic-success', trend: kpis.trends.success, isLatency: false },
          { label: 'Avg Latency', value: `${kpis.latency}ms`, icon: Clock, color: 'text-semantic-warning', trend: kpis.trends.latency, isLatency: true },
          { label: 'Error Rate', value: `${kpis.errorRate}%`, icon: AlertTriangle, color: 'text-semantic-error', trend: kpis.trends.error, isLatency: false },
        ].map((kpi, idx) => {
          const isRisingLatency = kpi.isLatency && !kpi.trend.up;
          return (
          <motion.div 
            key={kpi.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.1 }}
            className="glass-inner rounded-2xl p-6 border border-border-subtle hover:border-border transition-colors group relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
              <kpi.icon className={cn("w-16 h-16", kpi.color)} />
            </div>
            <div className="relative z-10">
              <div className="flex items-center gap-2 text-fg-muted mb-3">
                <kpi.icon className="w-4 h-4" />
                <span className="text-xs font-bold uppercase tracking-widest">{kpi.label}</span>
              </div>
              <div className="flex items-end justify-between">
                <div className="text-3xl font-display font-bold text-fg">{kpi.value}</div>
                <div className={cn(
                  "flex items-center gap-1 text-xs font-bold px-2 py-1 rounded", 
                  isRisingLatency 
                    ? "bg-[#DD1B24]/10 text-[#DD1B24]" 
                    : kpi.trend.up ? "bg-semantic-success/10 text-semantic-success" : "bg-semantic-error/10 text-semantic-error"
                )}>
                  {kpi.trend.up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                  {kpi.trend.val}
                </div>
              </div>
            </div>
          </motion.div>
        )})}
      </div>

      {/* Main Chart */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="glass-inner rounded-2xl border border-border-subtle p-6"
      >
        <div className="flex items-center justify-between mb-8">
          <div>
            <h3 className="text-lg font-bold text-fg">Traffic Volume vs. Latency</h3>
            <p className="text-sm text-fg-muted mt-1">Comparing total requests to response times</p>
          </div>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <div className={cn("w-3 h-3 rounded-full", environment === 'sandbox' ? "bg-[#00F0FF] shadow-[0_0_10px_rgba(0,240,255,0.5)]" : "bg-[#5D5FEF] shadow-[0_0_10px_rgba(93,95,239,0.5)]")} />
              <span className="text-xs font-bold text-fg-muted uppercase tracking-widest">Volume</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-semantic-warning shadow-[0_0_10px_rgba(255,176,32,0.5)]" />
              <span className="text-xs font-bold text-fg-muted uppercase tracking-widest">Latency</span>
            </div>
          </div>
        </div>
        
        <div className="h-[400px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                {ENDPOINTS.slice(1).map(ep => (
                  <linearGradient key={ep.id} id={`color_${ep.id}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={ep.color} stopOpacity={0.3}/>
                    <stop offset="95%" stopColor={ep.color} stopOpacity={0}/>
                  </linearGradient>
                ))}
                <linearGradient id="colorVolume" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={environment === 'sandbox' ? '#00F0FF' : '#5D5FEF'} stopOpacity={0.3}/>
                  <stop offset="95%" stopColor={environment === 'sandbox' ? '#00F0FF' : '#5D5FEF'} stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis 
                dataKey="date" 
                stroke="rgba(255,255,255,0.2)" 
                tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: 600 }}
                tickMargin={12}
                axisLine={false}
                tickLine={false}
              />
              <YAxis 
                yAxisId="left"
                stroke="rgba(255,255,255,0.2)" 
                tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: 600 }}
                tickFormatter={(value) => value >= 1000 ? `${(value/1000).toFixed(0)}k` : value}
                axisLine={false}
                tickLine={false}
                tickMargin={12}
              />
              <YAxis 
                yAxisId="right"
                orientation="right"
                stroke="rgba(255,255,255,0.2)" 
                tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: 600 }}
                tickFormatter={(value) => `${value}ms`}
                axisLine={false}
                tickLine={false}
                tickMargin={12}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.02)' }} />
              <Legend wrapperStyle={{ paddingTop: '20px' }} />
              {selectedEndpoint === 'all' ? (
                ENDPOINTS.slice(1).map(ep => (
                  <Area 
                    key={ep.id}
                    stackId="1"
                    yAxisId="left"
                    type="monotone" 
                    dataKey={ep.id} 
                    name={ep.label}
                    stroke={ep.color} 
                    strokeWidth={2}
                    fillOpacity={1} 
                    fill={`url(#color_${ep.id})`} 
                    animationDuration={1500}
                  />
                ))
              ) : (
                <Area 
                  yAxisId="left"
                  type="monotone" 
                  dataKey={selectedEndpoint} 
                  name={ENDPOINTS.find(e => e.id === selectedEndpoint)?.label}
                  stroke={environment === 'sandbox' ? '#00F0FF' : '#5D5FEF'} 
                  strokeWidth={2}
                  fillOpacity={1} 
                  fill="url(#colorVolume)" 
                  animationDuration={1500}
                />
              )}
              <Line 
                yAxisId="right"
                type="monotone" 
                dataKey="latency" 
                stroke={environment === 'sandbox' ? '#DD1B24' : '#FFB020'} 
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: environment === 'sandbox' ? '#DD1B24' : '#FFB020', stroke: "#14131E", strokeWidth: 2 }}
                animationDuration={1500}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        {/* Endpoint Table */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="glass-inner rounded-2xl border border-border-subtle overflow-hidden xl:col-span-2"
        >
          <div className="p-6 border-b border-border-subtle flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-fg">Endpoint Health</h3>
              <p className="text-sm text-fg-muted mt-1">Performance breakdown by specific API routes</p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border-subtle bg-surface/5 text-fg-muted font-mono text-xs uppercase tracking-widest">
                  <th className="px-6 py-4 font-semibold">Endpoint</th>
                  <th className="px-6 py-4 font-semibold text-right">Volume</th>
                  <th className="px-6 py-4 font-semibold w-32">Trend</th>
                  <th className="px-6 py-4 font-semibold text-right">Avg Latency</th>
                  <th className="px-6 py-4 font-semibold text-right">Success Rate</th>
                </tr>
              </thead>
              <tbody>
                {endpointTableData.map((ep) => {
                  const method = ep.path.split(' ')[0];
                  const route = ep.path.split(' ')[1];
                  return (
                    <tr 
                      key={ep.path} 
                      onClick={() => router.push(`/console/explorer?endpoint=${route}`)}
                      className="border-b border-border-subtle last:border-0 hover:bg-glass transition-colors cursor-pointer group"
                    >
                      <td className="px-6 py-4 font-mono font-medium text-fg flex items-center gap-3">
                        <span className={cn("px-2 py-1 rounded text-[10px] font-bold border", method === 'GET' ? (environment === 'sandbox' ? 'bg-[#00F0FF]/10 text-[#00F0FF] border-[#00F0FF]/20' : 'bg-[#5D5FEF]/10 text-[#5D5FEF] border-[#5D5FEF]/20') : 'bg-[#5865F2]/10 text-[#5865F2] border-[#5865F2]/20')}>
                          {method}
                        </span>
                        <span className="group-hover:text-teal transition-colors flex items-center gap-2">
                          {route} <ArrowUpRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right font-mono text-fg-muted">
                        {ep.volume.toLocaleString()}
                      </td>
                      <td className="px-6 py-2 w-32">
                        <div className="h-8 w-full opacity-70 group-hover:opacity-100 transition-opacity">
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={ep.trend}>
                              <Line type="monotone" dataKey="val" stroke={environment === 'sandbox' ? '#00F0FF' : '#5D5FEF'} strokeWidth={2} dot={false} isAnimationActive={false} />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right font-mono text-fg-muted">
                        {ep.latency}ms
                      </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-3">
                        <span className={cn("font-mono", ep.success >= 99 ? 'text-semantic-success' : 'text-semantic-warning')}>
                          {ep.success}%
                        </span>
                        <div className="w-16 h-1.5 bg-surface/50 rounded-full overflow-hidden flex">
                          <div className="h-full bg-semantic-success" style={{ width: `${ep.success}%` }} />
                          <div className="h-full bg-semantic-error" style={{ width: `${100 - ep.success}%` }} />
                        </div>
                      </div>
                    </td>
                  </tr>
                )})}
              </tbody>
            </table>
          </div>
        </motion.div>
      
      {/* Migration Velocity Chart */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="glass-inner rounded-2xl border border-border-subtle p-6 mt-8"
      >
        <div className="flex items-center justify-between mb-8">
          <div>
            <h3 className="text-lg font-bold text-fg flex items-center gap-2">
              <Zap className="w-5 h-5 text-teal" /> Migration Velocity
            </h3>
            <p className="text-sm text-fg-muted mt-1">Comparing Modern API traffic vs Legacy (Deprecated) traffic over time.</p>
          </div>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-teal shadow-[0_0_10px_rgba(70,189,198,0.5)]" />
              <span className="text-xs font-bold text-fg-muted uppercase tracking-widest">Modern</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-semantic-error shadow-[0_0_10px_rgba(221,27,36,0.5)]" />
              <span className="text-xs font-bold text-fg-muted uppercase tracking-widest">Legacy</span>
            </div>
          </div>
        </div>
        
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={migrationVelocityData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorModern" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#46BDC6" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#46BDC6" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorLegacy" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#DD1B24" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#DD1B24" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis 
                dataKey="date" 
                stroke="rgba(255,255,255,0.2)" 
                tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: 600 }}
                tickMargin={12}
                axisLine={false}
                tickLine={false}
              />
              <YAxis 
                stroke="rgba(255,255,255,0.2)" 
                tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: 600 }}
                tickFormatter={(value) => value >= 1000 ? `${(value/1000).toFixed(0)}k` : value}
                axisLine={false}
                tickLine={false}
                tickMargin={12}
              />
              <Tooltip 
                contentStyle={{ backgroundColor: '#14131E', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '12px' }}
                itemStyle={{ fontWeight: 'bold' }}
              />
              <Area 
                type="monotone" 
                dataKey="Legacy" 
                stackId="1"
                stroke="#DD1B24" 
                strokeWidth={2}
                fillOpacity={1} 
                fill="url(#colorLegacy)" 
              />
              <Area 
                type="monotone" 
                dataKey="Modern" 
                stackId="1"
                stroke="#46BDC6" 
                strokeWidth={2}
                fillOpacity={1} 
                fill="url(#colorModern)" 
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </motion.div>

      {/* Grid Layout for Errors & Breakdown */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="glass-inner rounded-2xl border border-border-subtle p-6 xl:col-span-1 flex flex-col"
        >
          <div className="flex items-center justify-between mb-8">
            <div>
              <h3 className="text-lg font-bold text-fg flex items-center gap-2">
                <AlertTriangle className={cn("w-5 h-5", totalErrors > 0 ? "text-semantic-warning" : "text-semantic-success")} />
                Error Analytics
              </h3>
              {selectedEndpoint !== 'all' && (
                <p className="text-xs text-fg-muted mt-1 uppercase tracking-widest font-mono font-medium">{selectedEndpoint.split(' ')[1]}</p>
              )}
            </div>
            {selectedEndpoint !== 'all' && (
              <button 
                onClick={() => setSelectedEndpoint('all')}
                className="text-xs font-bold text-fg-muted hover:text-fg transition-colors bg-glass px-2 py-1 rounded border border-border-subtle hover:border-border"
              >
                Clear
              </button>
            )}
          </div>
          
          <div className="h-[300px] w-full relative flex-1">
            <AnimatePresence mode="wait">
              {totalErrors === 0 ? (
                <motion.div 
                  key="zero-state"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="absolute inset-0 flex flex-col items-center justify-center text-center"
                >
                  <div className="w-16 h-16 bg-semantic-success/10 rounded-full flex items-center justify-center mb-4 border border-semantic-success/20">
                    <CheckCircle2 className="w-8 h-8 text-semantic-success" />
                  </div>
                  <h4 className="text-fg font-bold mb-1">100% Error-Free</h4>
                  <p className="text-fg-muted text-xs max-w-[200px]">No failures detected {selectedEndpoint === 'all' ? 'across all routes' : 'for this route'} in the selected timeframe.</p>
                </motion.div>
              ) : selectedEndpoint === 'all' ? (
                <motion.div key="global-bar" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={errorChartData} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                      <XAxis 
                        dataKey="endpoint" 
                        stroke="rgba(255,255,255,0.2)" 
                        tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 9, fontWeight: 600 }}
                        tickMargin={12}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(val) => val.split(' ')[1]?.split('/').pop() || val}
                      />
                      <YAxis 
                        stroke="rgba(255,255,255,0.2)" 
                        tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: 600 }}
                        axisLine={false}
                        tickLine={false}
                        tickMargin={12}
                      />
                      <Tooltip 
                        cursor={{ fill: 'rgba(255,255,255,0.02)' }}
                        contentStyle={{ backgroundColor: '#14131E', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '12px' }}
                        itemStyle={{ fontWeight: 'bold' }}
                        labelStyle={{ color: 'rgba(255,255,255,0.4)', fontSize: '10px', textTransform: 'uppercase', marginBottom: '8px' }}
                      />
                      <Legend wrapperStyle={{ paddingTop: '20px', fontSize: '12px', fontWeight: 600 }} />
                      <Bar dataKey="4xx" name="4xx Client" stackId="a" fill="#FFB020" radius={[0, 0, 4, 4]} style={{ cursor: 'pointer' }} onClick={(data: unknown) => { const d = data as { payload?: { endpoint?: string }; endpoint?: string } | undefined; setSelectedEndpoint(d?.payload?.endpoint || d?.endpoint || 'all'); }} />
                      <Bar dataKey="5xx" name="5xx Server" stackId="a" fill="#F04438" radius={[4, 4, 0, 0]} style={{ cursor: 'pointer' }} onClick={(data: unknown) => { const d = data as { payload?: { endpoint?: string }; endpoint?: string } | undefined; setSelectedEndpoint(d?.payload?.endpoint || d?.endpoint || 'all'); }} />
                    </BarChart>
                  </ResponsiveContainer>
                </motion.div>
              ) : (
                <motion.div key="endpoint-area" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={errorChartData} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="color4xx" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#FFB020" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#FFB020" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="color5xx" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#F04438" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#F04438" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                      <XAxis 
                        dataKey="date" 
                        stroke="rgba(255,255,255,0.2)" 
                        tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 9, fontWeight: 600 }}
                        tickMargin={12}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis 
                        stroke="rgba(255,255,255,0.2)" 
                        tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: 600 }}
                        axisLine={false}
                        tickLine={false}
                        tickMargin={12}
                      />
                      <Tooltip 
                        cursor={{ stroke: 'rgba(255,255,255,0.1)', strokeWidth: 1, strokeDasharray: '3 3' }}
                        contentStyle={{ backgroundColor: '#14131E', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '12px' }}
                        itemStyle={{ fontWeight: 'bold' }}
                        labelStyle={{ color: 'rgba(255,255,255,0.4)', fontSize: '10px', textTransform: 'uppercase', marginBottom: '8px' }}
                      />
                      <Legend wrapperStyle={{ paddingTop: '20px', fontSize: '12px', fontWeight: 600 }} />
                      <Area type="monotone" dataKey="5xx" name="5xx Server" stroke="#F04438" strokeWidth={2} fillOpacity={1} fill="url(#color5xx)" stackId="1" />
                      <Area type="monotone" dataKey="4xx" name="4xx Client" stroke="#FFB020" strokeWidth={2} fillOpacity={1} fill="url(#color4xx)" stackId="1" />
                    </AreaChart>
                  </ResponsiveContainer>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          
          {/* Error Taxonomy & Next-Level Actions */}
          <AnimatePresence>
            {selectedEndpoint !== 'all' && totalErrors > 0 && errorTaxonomy.length > 0 && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-6 pt-4 border-t border-border-subtle space-y-4"
              >
                <div className="flex items-center justify-between">
                  <h4 className="text-[10px] font-bold uppercase tracking-widest text-fg-muted">Live Log Taxonomy</h4>
                  <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-fg-muted">
                    <Network className="w-3.5 h-3.5 text-indigo-400" />
                    Blast Radius: <span className="text-fg">{blastRadius} IPs Affected</span>
                  </div>
                </div>
                
                <div className="flex flex-wrap gap-2">
                  {errorTaxonomy.map(tax => (
                    <Link href={`/console/logs?endpoint=${encodeURIComponent(selectedEndpoint)}&status=${String(tax.status).charAt(0)}`} key={tax.status}>
                      <div className="bg-[#14131E] border border-border-subtle hover:border-indigo-500/30 hover:bg-indigo-500/10 rounded-lg px-3 py-1.5 flex items-center gap-2 cursor-pointer transition-colors group">
                        <div className={cn("w-2 h-2 rounded-full", tax.status >= 500 ? "bg-semantic-error" : "bg-semantic-warning")} />
                        <span className="font-mono text-xs font-bold text-fg group-hover:text-indigo-400 transition-colors">{tax.status}</span>
                        <span className="text-fg-muted text-xs">|</span>
                        <span className="text-xs text-fg-muted">{tax.count} occurrences</span>
                      </div>
                    </Link>
                  ))}
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <button 
                    onClick={handleGenerateRca}
                    disabled={isRcaScanning}
                    className="flex-1 py-2 bg-gradient-to-r from-[#5D5FEF] to-[#7B7EF0] hover:from-[#4b4dc4] hover:to-[#6a6cd6] text-fg text-xs font-bold rounded-lg transition-all shadow-[0_0_15px_rgba(93,95,239,0.3)] flex items-center justify-center gap-2"
                  >
                    {isRcaScanning ? (
                      <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }}>
                        <RefreshCw className="w-3.5 h-3.5" />
                      </motion.div>
                    ) : (
                      <Sparkles className="w-3.5 h-3.5" />
                    )}
                    {isRcaScanning ? 'Analyzing Failure Patterns...' : 'AI Root Cause Analysis'}
                  </button>
                  <button 
                    onClick={() => setIsAlertDrawerOpen(true)}
                    className="flex items-center gap-2 px-3 py-2 bg-glass hover:bg-glass-2 border border-border rounded-lg text-xs font-bold text-fg transition-colors"
                  >
                    <BellPlus className="w-3.5 h-3.5" />
                    Alert
                  </button>
                </div>
                
                <AnimatePresence>
                  {rcaResult && (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="bg-indigo-500/10 border border-indigo-500/20 rounded-lg p-3 text-sm text-indigo-100/90 leading-relaxed font-medium mt-2 shadow-inner"
                    >
                      {rcaResult}
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>

      {/* Live Traffic Firehose */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.7 }}
        className="mt-8"
      >
        <LiveFirehose />
      </motion.div>

      <StatusPageModal isOpen={isStatusModalOpen} onClose={() => setIsStatusModalOpen(false)} />
      <AlertConfigDrawer isOpen={isAlertDrawerOpen} onClose={() => setIsAlertDrawerOpen(false)} />
    </div>
  );
}
