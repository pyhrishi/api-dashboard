'use client';

import { HealthCard } from '@/components/HealthCard';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { FirstCallWizard } from '@/src/components/FirstCallWizard';

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

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-12">
      <div>
        <h1 className="text-3xl font-display font-extrabold text-white mb-2 tracking-tight">Overview Dashboard</h1>
        <p className="text-white/60 font-medium">Monitor your API performance and consumption metrics in real-time.</p>
      </div>

      <FirstCallWizard />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <HealthCard title="Total Calls" value="2.8M" delta={12} />
        <HealthCard title="Success Rates" value="98.4%" delta={2} />
        {/* CRITICAL HARD CONSTRAINT: upward latency is bad -> error */}
        <HealthCard title="Avg. Response Time" value="112ms" delta={18} invertDeltaColor={true} />
      </div>

      {/* Dual-axis Recharts Area Chart */}
      <div className="glass-inner p-8 rounded-2xl hover:border-white/20 transition-all hover:shadow-2xl">
        <h3 className="text-lg font-bold text-white mb-8">Traffic & Latency (30 Days)</h3>
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
                dy={15} 
              />
              
              {/* Left Y-Axis for Calls */}
              <YAxis 
                yAxisId="left" 
                orientation="left" 
                axisLine={false} 
                tickLine={false} 
                tick={{ fontSize: 12, fill: 'rgba(255,255,255,0.4)', fontWeight: 500 }} 
                tickFormatter={(val) => `${val / 1000}k`} 
                dx={-10}
              />
              
              {/* Right Y-Axis for Latency */}
              <YAxis 
                yAxisId="right" 
                orientation="right" 
                axisLine={false} 
                tickLine={false} 
                tick={{ fontSize: 12, fill: 'rgba(255,255,255,0.4)', fontWeight: 500 }} 
                tickFormatter={(val) => `${val}ms`} 
                dx={10}
              />
              
              <Tooltip 
                contentStyle={{ borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(9,9,11,0.9)', backdropFilter: 'blur(10px)', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.5)' }}
                labelStyle={{ fontWeight: 'bold', color: 'rgba(255,255,255,0.8)', marginBottom: '8px' }}
                itemStyle={{ fontWeight: 'bold', fontSize: '13px' }}
              />
              <Legend verticalAlign="top" height={40} iconType="circle" wrapperStyle={{ fontSize: '13px', fontWeight: 600, color: 'rgba(255,255,255,0.6)' }} />
              
              <Area yAxisId="left" type="monotone" dataKey="calls" name="API Calls" stroke="#46BDC6" strokeWidth={3} fillOpacity={1} fill="url(#colorCalls)" activeDot={{ r: 6, strokeWidth: 0, fill: '#46BDC6', style: { filter: 'drop-shadow(0 0 8px rgba(70,189,198,0.8))' } }} />
              <Area yAxisId="right" type="monotone" dataKey="latency" name="Latency (ms)" stroke="#C47B0A" strokeWidth={3} fillOpacity={1} fill="url(#colorLatency)" activeDot={{ r: 6, strokeWidth: 0, fill: '#C47B0A', style: { filter: 'drop-shadow(0 0 8px rgba(196,123,10,0.8))' } }} />
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
        
        <div className="flex h-8 rounded-xl overflow-hidden bg-white/5 shadow-inner mb-6">
          <div style={{ width: `${phonePercent}%` }} className="bg-teal transition-all duration-1000 ease-out flex items-center justify-center shadow-[0_0_15px_rgba(70,189,198,0.5)] z-10 relative">
            {phonePercent > 10 && <span className="text-ink text-xs font-bold">{phonePercent}%</span>}
          </div>
          <div style={{ width: `${emailPercent}%` }} className="bg-teal-deep transition-all duration-1000 ease-out flex items-center justify-center shadow-[0_0_15px_rgba(32,124,130,0.5)]">
            {emailPercent > 10 && <span className="text-white text-xs font-bold">{emailPercent}%</span>}
          </div>
        </div>
        
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-10">
          <div className="flex items-center gap-3">
            <div className="w-4 h-4 rounded-full bg-teal shadow-sm shadow-teal/50" />
            <span className="text-sm font-bold text-white">Phone Intel <span className="text-white/50 ml-1 font-medium bg-white/5 px-2 py-0.5 rounded-md text-xs border border-white/5">{creditBurnPhone.toLocaleString()} credits</span></span>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-4 h-4 rounded-full bg-teal-deep shadow-sm shadow-teal-deep/50" />
            <span className="text-sm font-bold text-white">Email Intel <span className="text-white/50 ml-1 font-medium bg-white/5 px-2 py-0.5 rounded-md text-xs border border-white/5">{creditBurnEmail.toLocaleString()} credits</span></span>
          </div>
        </div>
      </div>
    </div>
  );
}
