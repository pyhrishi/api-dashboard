'use client';

import { HealthCard } from '@/components/HealthCard';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { FirstCallWizard } from '@/src/components/FirstCallWizard';
import { OnboardingChecklist } from '@/components/OnboardingChecklist';
import { Omnibar } from '@/components/Omnibar';
import { QuickActions } from '@/components/QuickActions';
import { useStore } from '@/lib/store';
import { RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

const mockChartData = Array.from({ length: 30 }).map((_, i) => ({
  date: `Aug ${i + 1}`,
  calls: Math.floor(Math.random() * 30000) + 70000, 
  latency: Math.floor(Math.random() * 30) + 90,
}));

export default function OverviewDashboard() {
  const creditBurnPhone = 1250;
  const creditBurnEmail = 2300;
  const totalBurn = creditBurnPhone + creditBurnEmail;
  const phonePercent = Math.round((creditBurnPhone / totalBurn) * 100) || 0;
  const emailPercent = Math.round((creditBurnEmail / totalBurn) * 100) || 0;
  const { user, isFirstCallMade, resetPrototypeState } = useStore();

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-12 pt-4 relative">
      
      {!isFirstCallMade ? (
        /* ==============================================================
           FTUE: FIRST-TIME USER DASHBOARD 
           Highly focused on getting the user to 'Hello World'
           ============================================================== */
        <div className="space-y-8 animate-in fade-in zoom-in duration-500">
          <div className="text-center mb-12">
            <h1 className="text-4xl md:text-5xl font-display font-black text-white mb-4 tracking-tight">
              Welcome to zinbit, {user?.email.split('@')[0] || 'Developer'}! 👋
            </h1>
            <p className="text-white/60 font-medium text-lg max-w-2xl mx-auto">
              You're 2 minutes away from making your first API call. Follow the checklist below to get your sandbox keys and start building.
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
            <h1 className="text-3xl font-display font-extrabold text-white mb-6 tracking-tight">
              Welcome back, {user?.email.split('@')[0] || 'Developer'}
            </h1>
            <Omnibar />
          </div>

          {/* 2. Quick Actions Grid */}
          <QuickActions />

          {/* 3. Analytics Overview */}
          <div className="pt-8 border-t border-white/5">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                Analytics Overview
                <span className="px-2 py-0.5 rounded-full bg-teal/10 text-teal text-[10px] font-bold uppercase tracking-wider">Live</span>
              </h2>
              <span className="text-sm text-white/40 font-medium">Last 30 Days</span>
            </div>
            
            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <HealthCard title="Total Calls" value="2.8M" delta={12} />
              <HealthCard title="Success Rates" value="98.4%" delta={2} />
              <HealthCard title="Avg. Response Time" value="112ms" delta={18} invertDeltaColor={true} />
            </div>

            {/* Dual-axis Recharts Area Chart */}
            <div className="glass-inner p-8 rounded-2xl hover:border-white/20 transition-all hover:shadow-2xl mb-8">
              <h3 className="text-lg font-bold text-white mb-8">Traffic & Latency</h3>
              <div className="h-[350px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={mockChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
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
                    <Area yAxisId="left" type="monotone" dataKey="calls" name="Total Calls" stroke="#46BDC6" strokeWidth={3} fill="url(#colorCalls)" />
                    <Area yAxisId="right" type="monotone" dataKey="latency" name="Latency (ms)" stroke="#C47B0A" strokeWidth={3} fill="url(#colorLatency)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Credit Burn by Type Progress Bar */}
            <div className="glass-inner p-8 rounded-2xl hover:border-white/20 transition-all hover:shadow-2xl">
              <h3 className="text-lg font-bold text-white mb-6">Credit Burn by Type</h3>
              
              <div className="mb-3 flex justify-between text-sm font-medium">
                <span className="text-white/50 font-bold uppercase tracking-wider text-xs">Consumption Ratio</span>
                <span className="text-white/70">Total Consumed: <span className="font-extrabold text-white ml-1">{totalBurn.toLocaleString()}</span></span>
              </div>
              
              <div className="flex h-8 rounded-xl overflow-hidden bg-[#09090b]/5 shadow-inner mb-6">
                <div style={{ width: `${phonePercent}%` }} className="bg-teal transition-all duration-1000 ease-out flex items-center justify-center shadow-[0_0_15px_rgba(70,189,198,0.5)] z-10 relative">
                  {phonePercent > 10 && <span className="text-white text-xs font-bold">{phonePercent}%</span>}
                </div>
                <div style={{ width: `${emailPercent}%` }} className="bg-teal-deep transition-all duration-1000 ease-out flex items-center justify-center shadow-[0_0_15px_rgba(32,124,130,0.5)]">
                  {emailPercent > 10 && <span className="text-white text-xs font-bold">{emailPercent}%</span>}
                </div>
              </div>
              
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-10">
                <div className="flex items-center gap-3">
                  <div className="w-4 h-4 rounded-full bg-teal shadow-[0_0_15px_rgba(255,255,255,0.02)] shadow-teal/50" />
                  <span className="text-sm font-bold text-white">Phone Intel <span className="text-white/50 ml-1 font-medium bg-[#09090b]/5 px-2 py-0.5 rounded-md text-xs border border-white/5">{creditBurnPhone.toLocaleString()} credits</span></span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-4 h-4 rounded-full bg-teal-deep shadow-[0_0_15px_rgba(255,255,255,0.02)] shadow-teal-deep/50" />
                  <span className="text-sm font-bold text-white">Email Intel <span className="text-white/50 ml-1 font-medium bg-[#09090b]/5 px-2 py-0.5 rounded-md text-xs border border-white/5">{creditBurnEmail.toLocaleString()} credits</span></span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DEV TOOLS: Reset Prototype State Button */}
      <div className="fixed bottom-4 right-4 z-50">
        <button 
          onClick={resetPrototypeState}
          className="flex items-center gap-2 px-3 py-2 bg-semantic-error/10 text-semantic-error hover:bg-semantic-error hover:text-white border border-semantic-error/30 rounded-xl text-xs font-bold transition-all shadow-lg group backdrop-blur-md"
          title="Reset Prototype to First-Time User State"
        >
          <RefreshCw className="w-4 h-4 group-hover:rotate-180 transition-transform duration-500" />
          <span>Reset FTUE State</span>
        </button>
      </div>

    </div>
  );
}
