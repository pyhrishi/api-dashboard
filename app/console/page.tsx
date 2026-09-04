'use client';

import { useState } from 'react';
import { HealthCard } from '@/components/HealthCard';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { FirstCallWizard } from '@/src/components/FirstCallWizard';
import { OnboardingChecklist } from '@/components/OnboardingChecklist';
import { OmnibarTrigger } from '@/components/Omnibar';
import { QuickActions } from '@/components/QuickActions';
import { EndpointFilter } from '@/components/EndpointFilter';
import { TelemetryGauges } from '@/components/TelemetryGauges';
import { useStore } from '@/lib/store';
import { RefreshCw } from 'lucide-react';
import { ENDPOINTS } from '@/lib/constants';



const mockChartData = Array.from({ length: 30 }).map((_, i) => {
  const findPhone = Math.floor(Math.random() * 15000) + 30000;
  const peopleSearch = Math.floor(Math.random() * 10000) + 25000;
  const companyData = Math.floor(Math.random() * 4000) + 10000;
  const companyEmployees = Math.floor(Math.random() * 1000) + 5000;

  return {
    date: `Aug ${i + 1}`,
    '/v1/people/phone': findPhone,
    '/v1/people': peopleSearch,
    '/v1/companies': companyData,
    '/v1/companies/employees': companyEmployees,
    calls: findPhone + peopleSearch + companyData + companyEmployees,
    latency: Math.floor(Math.random() * 30) + 90,
  };
});

export default function OverviewDashboard() {
  const { user, isFirstCallMade, resetPrototypeState } = useStore();
  const [selectedEndpoint, setSelectedEndpoint] = useState('all');

  const filteredChartData = mockChartData.map(d => {
    if (selectedEndpoint === 'all') return d;
    return {
      date: d.date,
      [selectedEndpoint]: d[selectedEndpoint as keyof typeof d],
      calls: d[selectedEndpoint as keyof typeof d],
      latency: d.latency + (Math.random() * 10 - 5), // Slight variation for specific endpoints
    };
  });

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-12 pt-4 relative">
      
      {!isFirstCallMade ? (
        /* ==============================================================
           FTUE: FIRST-TIME USER DASHBOARD 
           Highly focused on getting the user to 'Hello World'
           ============================================================== */
        <div className="space-y-8 animate-in fade-in zoom-in duration-500">
          <div className="text-center mb-12">
            <h1 className="text-4xl md:text-5xl font-display font-black text-fg mb-4 tracking-tight">
              Welcome to zinbit, {user?.email.split('@')[0] || 'Developer'}! 👋
            </h1>
            <p className="text-fg-muted font-medium text-lg max-w-2xl mx-auto">
              You&apos;re 2 minutes away from making your first API call. Follow the checklist below to get your sandbox keys and start building.
            </p>
          </div>

          <OnboardingChecklist />
          <FirstCallWizard />
        </div>
      ) : (
        /* ==============================================================
           VETERAN: COMMAND CENTER DASHBOARD 
           Unlocks after the first API call is made
           ============================================================== */
        <div className="space-y-8 animate-in fade-in duration-700">
          {/* 1. Global Command Center (Omnibar) */}
          <div className="text-center mb-8">
            <h1 className="text-3xl font-display font-extrabold text-fg mb-6 tracking-tight">
              Welcome back, {user?.email.split('@')[0] || 'Developer'}
            </h1>
            <OmnibarTrigger />
          </div>

          {/* 2. Quick Actions Grid */}
          <QuickActions />

          {/* 3. Analytics Overview */}
          <div className="pt-8 border-t border-border-subtle">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-xl font-bold text-fg flex items-center gap-2">
                Analytics Overview
                <span className="px-2 py-0.5 rounded-full bg-teal/10 text-teal text-[10px] font-bold uppercase tracking-wider">Live</span>
              </h2>
              <span className="text-sm text-fg-muted font-medium">Last 30 Days</span>
            </div>
            
            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <HealthCard title="Total Calls" value="2.8M" delta={12} />
              <HealthCard title="Success Rates" value="98.4%" delta={2} />
              <HealthCard title="Avg. Response Time" value="112ms" delta={18} invertDeltaColor={true} />
            </div>

            {/* Dual-axis Recharts Area Chart */}
            <div className="glass-inner p-8 rounded-2xl hover:border-border-strong transition-all hover:shadow-2xl mb-8">
              <div className="flex items-center justify-between mb-8 z-20 relative">
                <h3 className="text-lg font-bold text-fg">Traffic & Latency</h3>
                <EndpointFilter 
                  selected={selectedEndpoint} 
                  onChange={(id) => setSelectedEndpoint(id)} 
                />
              </div>
              <div className="h-[350px] w-full z-10 relative">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={filteredChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      {ENDPOINTS.slice(1).map(ep => (
                        <linearGradient key={ep.id} id={`color_${ep.id}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={ep.color} stopOpacity={0.4}/>
                          <stop offset="95%" stopColor={ep.color} stopOpacity={0}/>
                        </linearGradient>
                      ))}
                      <linearGradient id="colorCalls" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#46BDC6" stopOpacity={0.4}/>
                        <stop offset="95%" stopColor="#46BDC6" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorLatency" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#C47B0A" stopOpacity={0.4}/>
                        <stop offset="95%" stopColor="#C47B0A" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                    <XAxis 
                      dataKey="date" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fontSize: 12, fill: 'rgba(255,255,255,0.4)', fontWeight: 500 }} 
                      dy={10}
                    />
                    <YAxis 
                      yAxisId="left"
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fontSize: 12, fill: 'rgba(255,255,255,0.4)', fontWeight: 500 }}
                      tickFormatter={(val) => `${(val / 1000).toFixed(0)}k`}
                    />
                    <YAxis 
                      yAxisId="right" 
                      orientation="right" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fontSize: 12, fill: 'rgba(255,255,255,0.4)', fontWeight: 500 }}
                      tickFormatter={(val) => `${val}ms`}
                    />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#111115', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '12px', boxShadow: '0 10px 30px -10px rgba(0,0,0,0.5)' }}
                      itemStyle={{ color: '#fff', fontWeight: 600 }}
                    />
                    <Legend wrapperStyle={{ paddingTop: '20px' }} />
                    {selectedEndpoint === 'all' ? (
                      ENDPOINTS.slice(1).map(ep => (
                        <Area key={ep.id} stackId="1" yAxisId="left" type="monotone" dataKey={ep.id} name={ep.label} stroke={ep.color} strokeWidth={2} fill={`url(#color_${ep.id})`} />
                      ))
                    ) : (
                      <Area yAxisId="left" type="monotone" dataKey={selectedEndpoint} name={ENDPOINTS.find(e => e.id === selectedEndpoint)?.label} stroke="#46BDC6" strokeWidth={3} fill="url(#colorCalls)" />
                    )}
                    <Area yAxisId="right" type="monotone" dataKey="latency" name="Latency (ms)" stroke="#C47B0A" strokeWidth={3} fill="url(#colorLatency)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Live System Telemetry & Quotas */}
            <TelemetryGauges />
          </div>
        </div>
      )}

      {/* DEV TOOLS: Reset Prototype State Button */}
      <div className="fixed bottom-4 right-4 z-50">
        <button 
          onClick={resetPrototypeState}
          className="flex items-center gap-2 px-3 py-2 bg-semantic-error/10 text-semantic-error hover:bg-semantic-error hover:text-fg border border-semantic-error/30 rounded-xl text-xs font-bold transition-all shadow-lg group backdrop-blur-md"
          title="Reset Prototype to First-Time User State"
        >
          <RefreshCw className="w-4 h-4 group-hover:rotate-180 transition-transform duration-500" />
          <span>Reset FTUE State</span>
        </button>
      </div>

    </div>
  );
}
