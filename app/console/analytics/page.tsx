'use client';

import { useMemo, useState, useEffect } from 'react';
import { useStore } from '@/lib/store';
import { motion } from 'framer-motion';
import { Activity, Clock, AlertTriangle, CheckCircle2, TrendingUp, TrendingDown, ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ComposedChart, Bar, Line, BarChart, Legend, LineChart } from 'recharts';
import { ENDPOINTS } from '@/lib/constants';
import { EndpointFilter } from '@/components/EndpointFilter';

export default function AnalyticsPage() {
  const { environment } = useStore();
  const [mounted, setMounted] = useState(false);
  const [selectedEndpoint, setSelectedEndpoint] = useState('all');
  
  useEffect(() => {
    setMounted(true);
  }, []);

  const mockData = useMemo(() => {
    const data = [];
    const now = new Date();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      
      const isWeekend = d.getDay() === 0 || d.getDay() === 6;
      
      let baseVolume = environment === 'live' ? 250000 : 1200;
      if (isWeekend && environment === 'live') baseVolume *= 0.6; // Weekend dip
      
      const volVariance = environment === 'live' ? 30000 : 800;
      const baseLatency = environment === 'live' ? 42 : 180;
      const latVariance = environment === 'live' ? 12 : 150;

      const vPeople = Math.max(0, Math.floor((baseVolume * 0.4) + (Math.random() - 0.5) * (volVariance * 0.4)));
      const vCompany = Math.max(0, Math.floor((baseVolume * 0.35) + (Math.random() - 0.5) * (volVariance * 0.35)));
      const vWebhooks = Math.max(0, Math.floor((baseVolume * 0.2) + (Math.random() - 0.5) * (volVariance * 0.2)));
      const vBilling = Math.max(0, Math.floor((baseVolume * 0.05) + (Math.random() - 0.5) * (volVariance * 0.05)));

      data.push({
        date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        '/v1/people/search': vPeople,
        '/v1/company/enrich': vCompany,
        '/v1/webhooks': vWebhooks,
        '/v1/billing/usage': vBilling,
        volume: vPeople + vCompany + vWebhooks + vBilling,
        latency: Math.max(15, Math.floor(baseLatency + (Math.random() - 0.5) * latVariance)),
      });
    }
    return data;
  }, [environment]);

  const filteredData = useMemo(() => {
    return mockData.map(d => {
      if (selectedEndpoint === 'all') return d;
      return {
        date: d.date,
        [selectedEndpoint]: d[selectedEndpoint as keyof typeof d],
        volume: d[selectedEndpoint as keyof typeof d],
        latency: d.latency + (Math.random() * 10 - 5),
      };
    });
  }, [mockData, selectedEndpoint]);

  const kpis = useMemo(() => {
    const totalVolume = filteredData.reduce((acc, curr) => acc + (curr.volume as number), 0);
    const avgLatency = Math.floor(filteredData.reduce((acc, curr) => acc + curr.latency, 0) / filteredData.length);
    
    return {
      volume: totalVolume,
      successRate: environment === 'live' ? 99.99 : 92.45,
      latency: avgLatency,
      errorRate: environment === 'live' ? 0.01 : 7.55
    };
  }, [mockData, environment]);

  const endpointData = useMemo(() => {
    const base = environment === 'live' ? 10000 : 100;
    return [
      { 
        path: 'POST /v1/people/search', 
        volume: Math.floor(base * 4.2), 
        latency: environment === 'live' ? 45 : 120, 
        success: environment === 'live' ? 99.9 : 91.2,
        trend: mockData.map(d => ({ val: d['/v1/people/search'] }))
      },
      { 
        path: 'GET /v1/company/enrich', 
        volume: Math.floor(base * 3.8), 
        latency: environment === 'live' ? 32 : 95, 
        success: environment === 'live' ? 99.99 : 94.5,
        trend: mockData.map(d => ({ val: d['/v1/company/enrich'] }))
      },
      { 
        path: 'POST /v1/webhooks', 
        volume: Math.floor(base * 1.5), 
        latency: environment === 'live' ? 12 : 40, 
        success: environment === 'live' ? 99.99 : 98.1,
        trend: mockData.map(d => ({ val: d['/v1/webhooks'] }))
      },
      { 
        path: 'GET /v1/billing/usage', 
        volume: Math.floor(base * 0.2), 
        latency: environment === 'live' ? 85 : 210, 
        success: environment === 'live' ? 100 : 99.0,
        trend: mockData.map(d => ({ val: d['/v1/billing/usage'] }))
      },
    ];
  }, [environment, mockData]);

  const errorData = useMemo(() => {
    const base = environment === 'live' ? 10 : 50;
    return [
      { endpoint: '/v1/people/search', '4xx': Math.floor(base * 2.1), '5xx': Math.floor(base * 0.1) },
      { endpoint: '/v1/company/enrich', '4xx': Math.floor(base * 1.5), '5xx': Math.floor(base * 0.05) },
      { endpoint: '/v1/webhooks', '4xx': Math.floor(base * 3.2), '5xx': Math.floor(base * 0.8) },
      { endpoint: '/v1/billing/usage', '4xx': Math.floor(base * 0.2), '5xx': 0 },
    ];
  }, [environment]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-[#14131E] border border-white/10 p-4 rounded-xl shadow-2xl">
          <p className="text-white/60 text-xs font-bold uppercase tracking-widest mb-3">{label}</p>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-6">
              <span className="text-teal font-medium flex items-center gap-1.5"><Activity className="w-3.5 h-3.5" /> Volume</span>
              <span className="text-white font-bold">{payload[0].value.toLocaleString()} reqs</span>
            </div>
            <div className="flex items-center justify-between gap-6">
              <span className="text-semantic-warning font-medium flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> Latency</span>
              <span className="text-white font-bold">{payload[1].value} ms</span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  if (!mounted) {
    return <div className="max-w-[1200px] mx-auto p-8 animate-pulse bg-[#09090b]/5 rounded-2xl h-[500px]" />;
  }

  return (
    <div className="max-w-[1200px] mx-auto space-y-8 pb-12">
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-start justify-between"
      >
        <div>
          <h1 className="text-2xl font-display font-bold text-white flex items-center gap-3">
            Usage & Analytics
            <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-widest border", environment === 'live' ? "bg-semantic-success/10 text-semantic-success border-semantic-success/20" : "bg-semantic-warning/10 text-semantic-warning border-semantic-warning/20")}>
              {environment} Data
            </span>
          </h1>
          <p className="text-white/60 mt-1">Global health metrics, traffic volume, and endpoint performance over the last 30 days.</p>
        </div>
        
        <div className="z-50 relative">
          <EndpointFilter 
            selected={selectedEndpoint} 
            onChange={(id) => setSelectedEndpoint(id)} 
          />
        </div>
      </motion.div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total API Calls', value: kpis.volume.toLocaleString(), icon: Activity, color: 'text-teal', trend: '+12.5%', trendUp: true },
          { label: 'Global Success Rate', value: `${kpis.successRate}%`, icon: CheckCircle2, color: 'text-semantic-success', trend: environment === 'live' ? '+0.01%' : '-2.4%', trendUp: environment === 'live' },
          { label: 'Average Latency', value: `${kpis.latency}ms`, icon: Clock, color: 'text-semantic-warning', trend: environment === 'live' ? '-12ms' : '+45ms', trendUp: environment === 'live' },
          { label: 'Active Error Rate', value: `${kpis.errorRate}%`, icon: AlertTriangle, color: 'text-semantic-error', trend: environment === 'live' ? '-0.01%' : '+2.4%', trendUp: environment === 'live' },
        ].map((kpi, idx) => (
          <motion.div 
            key={kpi.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.1 }}
            className="glass-inner rounded-2xl p-6 border border-white/5 hover:border-white/10 transition-colors group relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
              <kpi.icon className={cn("w-16 h-16", kpi.color)} />
            </div>
            <div className="relative z-10">
              <div className="flex items-center gap-2 text-white/40 mb-3">
                <kpi.icon className="w-4 h-4" />
                <span className="text-xs font-bold uppercase tracking-widest">{kpi.label}</span>
              </div>
              <div className="flex items-end justify-between">
                <div className="text-3xl font-display font-bold text-white">{kpi.value}</div>
                <div className={cn("flex items-center gap-1 text-xs font-bold px-2 py-1 rounded", kpi.trendUp ? "bg-semantic-success/10 text-semantic-success" : "bg-semantic-error/10 text-semantic-error")}>
                  {kpi.trendUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                  {kpi.trend}
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Main Chart */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="glass-inner rounded-2xl border border-white/5 p-6"
      >
        <div className="flex items-center justify-between mb-8">
          <div>
            <h3 className="text-lg font-bold text-white">Traffic Volume vs. Latency</h3>
            <p className="text-sm text-white/40 mt-1">Comparing total requests to P95 response times</p>
          </div>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-teal shadow-[0_0_10px_rgba(70,189,198,0.5)]" />
              <span className="text-xs font-bold text-white/60 uppercase tracking-widest">Volume</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-semantic-warning shadow-[0_0_10px_rgba(255,176,32,0.5)]" />
              <span className="text-xs font-bold text-white/60 uppercase tracking-widest">Latency</span>
            </div>
          </div>
        </div>
        
        <div className="h-[400px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={filteredData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                {ENDPOINTS.slice(1).map(ep => (
                  <linearGradient key={ep.id} id={`color_${ep.id}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={ep.color} stopOpacity={0.3}/>
                    <stop offset="95%" stopColor={ep.color} stopOpacity={0}/>
                  </linearGradient>
                ))}
                <linearGradient id="colorVolume" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#46BDC6" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#46BDC6" stopOpacity={0}/>
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
                  stroke="#46BDC6" 
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
                stroke="#FFB020" 
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: "#FFB020", stroke: "#14131E", strokeWidth: 2 }}
                animationDuration={1500}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </motion.div>

      {/* Endpoint Table */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="glass-inner rounded-2xl border border-white/5 overflow-hidden"
      >
        <div className="p-6 border-b border-white/5 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-white">Endpoint Health</h3>
            <p className="text-sm text-white/40 mt-1">Performance breakdown by specific API routes</p>
          </div>
          <button className="flex items-center gap-2 text-xs font-bold text-teal hover:text-teal-ice transition-colors">
            View API Reference <ArrowUpRight className="w-4 h-4" />
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/5 bg-[#09090b]/5 text-white/40 font-mono text-xs uppercase tracking-widest">
                <th className="px-6 py-4 font-semibold">Endpoint</th>
                <th className="px-6 py-4 font-semibold text-right">Volume</th>
                <th className="px-6 py-4 font-semibold w-32">Trend (30d)</th>
                <th className="px-6 py-4 font-semibold text-right">Avg Latency</th>
                <th className="px-6 py-4 font-semibold text-right">Success Rate</th>
                <th className="px-6 py-4 font-semibold">Health</th>
              </tr>
            </thead>
            <tbody>
              {endpointData.map((ep, idx) => {
                const epColor = ep.path.startsWith('GET') ? '#46BDC6' : '#5865F2';
                return (
                  <tr key={ep.path} className="border-b border-white/5 last:border-0 hover:bg-[#09090b]/5 transition-colors">
                    <td className="px-6 py-4 font-mono font-medium text-white flex items-center gap-3">
                      <span className={cn("px-2 py-1 rounded text-[10px] font-bold border", ep.path.startsWith('GET') ? 'bg-teal/10 text-teal border-teal/20' : 'bg-[#5865F2]/10 text-[#5865F2] border-[#5865F2]/20')}>
                        {ep.path.split(' ')[0]}
                      </span>
                      {ep.path.split(' ')[1]}
                    </td>
                    <td className="px-6 py-4 text-right font-mono text-white/70">
                      {ep.volume.toLocaleString()}
                    </td>
                    <td className="px-6 py-2 w-32">
                      <div className="h-8 w-full opacity-70">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={ep.trend}>
                            <Line type="monotone" dataKey="val" stroke={epColor} strokeWidth={2} dot={false} isAnimationActive={false} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right font-mono text-white/70">
                      {ep.latency}ms
                    </td>
                  <td className="px-6 py-4 text-right">
                    <span className={cn("font-mono", ep.success >= 99 ? 'text-semantic-success' : 'text-semantic-warning')}>
                      {ep.success}%
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="w-full max-w-[150px] h-2 bg-[#09090b]/10 rounded-full overflow-hidden flex ml-auto">
                      <div className="h-full bg-semantic-success" style={{ width: `${ep.success}%` }} />
                      <div className="h-full bg-semantic-error" style={{ width: `${100 - ep.success}%` }} />
                    </div>
                  </td>
                </tr>
              )})}
            </tbody>
          </table>
        </div>
      </motion.div>

      {/* Error Analytics */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        className="glass-inner rounded-2xl border border-white/5 p-6"
      >
        <div className="flex items-center justify-between mb-8">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-semantic-warning" />
              Error Analytics by Endpoint
            </h3>
            <p className="text-sm text-white/40 mt-1">Breakdown of 4xx (Client) and 5xx (Server) errors</p>
          </div>
        </div>
        
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={errorData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis 
                dataKey="endpoint" 
                stroke="rgba(255,255,255,0.2)" 
                tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10, fontWeight: 600 }}
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
                cursor={{ fill: 'rgba(255,255,255,0.02)' }}
                contentStyle={{ backgroundColor: '#14131E', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '12px' }}
                itemStyle={{ fontWeight: 'bold' }}
                labelStyle={{ color: 'rgba(255,255,255,0.4)', fontSize: '10px', textTransform: 'uppercase', marginBottom: '8px' }}
              />
              <Legend wrapperStyle={{ paddingTop: '20px', fontSize: '12px', fontWeight: 600 }} />
              <Bar dataKey="4xx" name="4xx Client Errors" stackId="a" fill="#FFB020" radius={[0, 0, 4, 4]} />
              <Bar dataKey="5xx" name="5xx Server Errors" stackId="a" fill="#F04438" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </motion.div>
    </div>
  );
}
