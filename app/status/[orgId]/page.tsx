'use client';

import { useStore } from '@/lib/store';
import { notFound } from 'next/navigation';
import { useMemo, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, AlertTriangle, Activity, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ResponsiveContainer, AreaChart, Area, XAxis, Tooltip } from 'recharts';

export default function StatusPage({ params }: { params: { orgId: string } }) {
  const { statusPageConfig, dailyMetrics } = useStore();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Aggregate global status
  const today = new Date().toISOString().split('T')[0];
  const liveMetrics = dailyMetrics.filter(m => m.environment === 'live');
  const todayMetrics = liveMetrics.find(m => m.date === today);

  let systemStatus: 'operational' | 'degraded' | 'down' = 'operational';
  let totalUptime = 99.99;

  if (todayMetrics) {
    let totalVol = 0, err5xx = 0;
    Object.values(todayMetrics.endpoints).forEach(m => {
      totalVol += m.volume;
      err5xx += m.errors5xx; // only counting server errors for uptime
    });
    
    if (totalVol > 0) {
      const errorRate = err5xx / totalVol;
      totalUptime = Number(((1 - errorRate) * 100).toFixed(2));
      if (errorRate > 0.05) systemStatus = 'down';
      else if (errorRate > 0.01) systemStatus = 'degraded';
    }
  }

  // Generate 30 day uptime array
  const last30Days = useMemo(() => {
    const arr = [];
    const now = new Date();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      
      const dayData = liveMetrics.find(m => m.date === dateStr);
      let uptime = 100;
      let status: 'up' | 'degraded' | 'down' = 'up';
      
      if (dayData) {
        let v = 0, e = 0;
        Object.values(dayData.endpoints).forEach(m => { v += m.volume; e += m.errors5xx; });
        if (v > 0) {
          uptime = 100 - ((e / v) * 100);
          if (uptime < 95) status = 'down';
          else if (uptime < 99) status = 'degraded';
        }
      }
      arr.push({ date: dateStr, uptime, status });
    }
    return arr;
  }, [liveMetrics]);

  // Chart data for latency
  const chartData = useMemo(() => {
    return liveMetrics.slice(-14).map(d => {
      let totalVol = 0;
      let totalLat = 0;
      Object.values(d.endpoints).forEach(m => {
        totalVol += m.volume;
        totalLat += m.totalLatency;
      });
      return {
        date: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        latency: totalVol > 0 ? Math.floor(totalLat / totalVol) : 0
      };
    });
  }, [liveMetrics]);

  if (!mounted) return null;

  // Validate the page is published and orgId matches (after all hooks so hook order stays stable)
  if (!statusPageConfig.isPublished || statusPageConfig.orgId !== params.orgId) {
    return notFound();
  }

  const isLight = statusPageConfig.theme === 'light';

  return (
    <div className={cn("min-h-screen font-sans", isLight ? "bg-slate-50 text-slate-900" : "bg-[#09090b] text-white")}>
      <div className="max-w-4xl mx-auto px-6 py-16 space-y-12">
        
        {/* Header */}
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center font-bold text-lg", isLight ? "bg-indigo-600 text-white" : "bg-white text-black")}>
              Z
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight">Zinbit API Status</h1>
          </div>
          <button className={cn("px-4 py-2 text-sm font-bold rounded-lg border transition-colors", isLight ? "border-slate-300 hover:bg-slate-100" : "border-white/10 hover:bg-white/5")}>
            Subscribe to Updates
          </button>
        </header>

        {/* Global Status Banner */}
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn(
            "p-6 rounded-2xl flex items-center justify-between border shadow-lg",
            systemStatus === 'operational' ? (isLight ? "bg-emerald-500 text-white border-emerald-600" : "bg-semantic-success/10 border-semantic-success/20 text-semantic-success") :
            systemStatus === 'degraded' ? "bg-amber-500 text-white border-amber-600" :
            "bg-red-500 text-white border-red-600"
          )}
        >
          <div className="flex items-center gap-4">
            {systemStatus === 'operational' ? <CheckCircle2 className="w-8 h-8" /> : <AlertTriangle className="w-8 h-8" />}
            <div>
              <h2 className="text-xl font-bold">
                {systemStatus === 'operational' ? 'All Systems Operational' :
                 systemStatus === 'degraded' ? 'Degraded API Performance' :
                 'Major System Outage'}
              </h2>
              <p className="opacity-80 text-sm mt-1">Refreshed 1 minute ago</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-3xl font-extrabold">{totalUptime}%</p>
            <p className="opacity-80 text-xs font-bold uppercase tracking-widest mt-1">Global Uptime</p>
          </div>
        </motion.div>

        {/* 30-Day History */}
        <div className={cn("p-8 rounded-3xl border", isLight ? "bg-white border-slate-200 shadow-sm" : "bg-[#121212] border-white/5")}>
          <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
            <Activity className="w-5 h-5 text-indigo-500" /> API Uptime (Last 30 Days)
          </h3>
          <div className="flex items-end gap-1 h-12 mb-2">
            {last30Days.map((day, idx) => (
              <div
                key={idx}
                className={cn(
                  "flex-1 rounded-sm transition-all hover:opacity-80",
                  day.status === 'up' ? "bg-emerald-500 h-full" :
                  day.status === 'degraded' ? "bg-amber-500 h-4/5" :
                  "bg-red-500 h-1/2"
                )}
                title={`${day.date}: ${day.uptime.toFixed(2)}%`}
              />
            ))}
          </div>
          <div className={cn("flex justify-between text-xs font-medium uppercase tracking-widest", isLight ? "text-slate-500" : "text-white/40")}>
            <span>30 days ago</span>
            <span>100% Uptime</span>
            <span>Today</span>
          </div>
        </div>

        {/* System Metrics */}
        <div className={cn("p-8 rounded-3xl border", isLight ? "bg-white border-slate-200 shadow-sm" : "bg-[#121212] border-white/5")}>
          <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
            <Clock className="w-5 h-5 text-indigo-500" /> Global Latency (14 Days)
          </h3>
          <div className="h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorLat" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis 
                  dataKey="date" 
                  stroke={isLight ? "#cbd5e1" : "rgba(255,255,255,0.2)"} 
                  tick={{ fill: isLight ? '#64748b' : 'rgba(255,255,255,0.4)', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  minTickGap={20}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: isLight ? '#ffffff' : '#14131E', 
                    borderColor: isLight ? '#e2e8f0' : 'rgba(255,255,255,0.1)', 
                    borderRadius: '8px',
                    color: isLight ? '#0f172a' : '#ffffff'
                  }} 
                />
                <Area 
                  type="monotone" 
                  dataKey="latency" 
                  stroke="#6366f1" 
                  strokeWidth={2}
                  fillOpacity={1} 
                  fill="url(#colorLat)" 
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>
    </div>
  );
}
