'use client';

import { Activity, ShieldAlert, ArrowRight, Zap, Check, CreditCard, Download, FileText, BellRing, Trash2, Plus, Bell, Settings, TrendingUp, Calendar, AlertTriangle, Key, Loader2 } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, AreaChart, Area, Tooltip } from 'recharts';
import { useStore } from '@/lib/store';
import { motion, AnimatePresence } from 'framer-motion';
import { useState, useMemo } from 'react';
import { useToast } from '@/components/Toast';
import { track } from '@/lib/telemetry';
import Link from 'next/link';
import { cn } from '@/lib/utils';

const pricingTiers = [
  { name: "Starter", limit: "10,000", price: "$99", current: false },
  { name: "Growth", limit: "100,000", price: "$499", current: false },
  { name: "Enterprise", limit: "5,000,000", price: "$2,999", current: true },
];

export default function BillingPage() {
  const { environment, creditBalance, usageAlerts, addUsageAlert, toggleUsageAlert, deleteUsageAlert, invoices, activeKeys, dailyMetrics, currentQuota, apiQuota, simulateTrafficSpike, user, dismissTriggeredAlert, billingDetails, updateBillingDetails } = useStore();
  const toast = useToast();
  const [upgradingTier, setUpgradingTier] = useState<string | null>(null);

  const handleUpgrade = (tierName: string) => {
    if (billingDetails.tier === tierName || upgradingTier) return;
    setUpgradingTier(tierName);
    // Believable multi-step upgrade: brief provisioning, then the plan goes live.
    setTimeout(() => {
      updateBillingDetails({
        tier: tierName as 'Starter' | 'Growth' | 'Enterprise',
        plan: tierName as 'Starter' | 'Growth' | 'Enterprise',
      });
      setUpgradingTier(null);
      track('plan_upgraded', { from: billingDetails.tier, to: tierName });
      toast.success(`You're now on ${tierName}`, 'Your plan has been upgraded — new rate limits and quota are active immediately.');
    }, 1400);
  };
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [isAlertFormOpen, setIsAlertFormOpen] = useState(false);
  const [newAlertPercent, setNewAlertPercent] = useState('80');
  const [newAlertChannels, setNewAlertChannels] = useState<('email' | 'webhook' | 'toast')[]>(['email']);
  const [newAlertType, setNewAlertType] = useState<'absolute' | 'velocity'>('absolute');
  const [newAlertScope, setNewAlertScope] = useState<'global' | 'key'>('global');
  const [newAlertScopeTargetId, setNewAlertScopeTargetId] = useState<string>('');
  const [newAlertAction, setNewAlertAction] = useState<'notify' | 'auto_recharge'>('notify');

  const handleDownload = async (id: string) => {
    setDownloadingId(id);
    await new Promise(r => setTimeout(r, 800)); // Simulate PDF generation
    setDownloadingId(null);
    
    // Simulate PDF download
    const mockPdfContent = `Invoice ${id}\nAmount: $99.00\nStatus: Paid`;
    const blob = new Blob([mockPdfContent], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `zinbit-${id.toLowerCase()}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast.success('Invoice Downloaded', `${id} has been downloaded to your device.`);
  };
  
  // Predictive Forecasting Logic
  const { exhaustionDate, forecastData } = useMemo(() => {
    const recentMetrics = dailyMetrics.slice(0, 7);
    let totalRecentVolume = 0;
    
    // Reverse metrics to be chronological for the chart
    const chronologicalMetrics = [...recentMetrics].reverse();
    const chartData = chronologicalMetrics.map(m => {
      let vol = 0;
      Object.values(m.endpoints).forEach((em) => vol += em.volume);
      return { date: m.date.slice(5), volume: vol };
    });

    recentMetrics.forEach(m => {
      Object.values(m.endpoints).forEach((em) => totalRecentVolume += em.volume);
    });
    
    const rate = totalRecentVolume / Math.max(1, recentMetrics.length);
    const remainingQuota = Math.max(0, apiQuota - currentQuota);
    const daysUntilExhaustion = rate > 0 ? Math.floor(remainingQuota / rate) : 999;
    
    const d = new Date();
    d.setDate(d.getDate() + daysUntilExhaustion);
    
    // Add forecast projections to chartData
    for (let i = 1; i <= 3; i++) {
      const fd = new Date();
      fd.setDate(fd.getDate() + i);
      chartData.push({ date: fd.toISOString().slice(5, 10), volume: rate }); // Simple flat projection
    }

    return { 
      dailyBurnRate: rate, 
      exhaustionDate: d,
      forecastData: chartData
    };
  }, [dailyMetrics, currentQuota, apiQuota]);
  
  // Rate Limit Data for Gauge Chart
  const rateLimit = 1000;
  const rlRemaining = 825;
  const rlConsumed = rateLimit - rlRemaining;
  
  const rlGaugeData = [
    { name: 'Consumed', value: rlConsumed },
    { name: 'Remaining', value: rlRemaining },
  ];
  
  // Quota Headroom Data for Gauge Chart
  const totalQuota = apiQuota;
  const quotaPercentage = (currentQuota / apiQuota) * 100;
  const isCriticalQuota = quotaPercentage >= 90;
  
  const quotaConsumed = currentQuota;
  const quotaRemaining = Math.max(0, apiQuota - currentQuota);
  const isOverageSoft = quotaPercentage > 100 && billingDetails.overageMode === 'soft';
  
  const quotaGaugeData = [
    { name: 'Consumed', value: quotaConsumed },
    { name: 'Remaining', value: quotaRemaining },
  ];
  
  const COLORS = ['#14b8a6', '#27272a'];
  const WARNING_COLORS = ['#ef4444', '#27272a']; // Red when critical
  const OVERAGE_COLORS = ['#F5A623', '#27272a']; // Amber when soft overage
  const COLORS_RL = ['#FFB020', '#1A1924']; // Yellow for rate limit consumed

  if (environment === 'sandbox') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4 animate-in fade-in duration-500">
        <div className="w-20 h-20 bg-teal/10 rounded-full flex items-center justify-center mb-6">
          <CreditCard className="w-10 h-10 text-teal" />
        </div>
        <h2 className="text-2xl font-bold text-fg mb-2">Billing not required</h2>
        <p className="text-fg-muted max-w-md">
          Billing, invoices, and quotas are not applicable in the Sandbox environment. Switch to Live mode to manage your production billing settings.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-12 pb-12 font-sans text-fg">
      
      {/* Header */}
      <div>
        <h1 className="text-3xl font-extrabold text-fg mb-2 tracking-tight font-display">Billing & Quotas</h1>
        <p className="text-fg-muted font-medium text-sm">Manage your credit consumption, rate limits, and subscription tiers.</p>
      </div>

      {/* Pricing Tiers Section */}
      <section>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-teal" />
            Transparent Pricing Tiers
          </h2>
          <span className="text-xs font-bold text-teal bg-teal/10 px-3 py-1 rounded-full uppercase tracking-wider border border-teal/20">
            No Hidden Fees
          </span>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {pricingTiers.map((tier, i) => {
            const isCurrent = billingDetails.tier === tier.name;
            const isUpgrading = upgradingTier === tier.name;
            return (
            <motion.div
              key={tier.name}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className={`glass-inner rounded-3xl p-8 flex flex-col items-center text-center transition-all ${
                isCurrent
                  ? 'border-teal shadow-[0_0_30px_-5px_rgba(70,189,198,0.3)] bg-surface/5'
                  : 'border-border hover:border-border-strong'
              }`}
            >
              {isCurrent && (
                <div className="bg-teal text-ink text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full mb-4">
                  Current Plan
                </div>
              )}
              <h3 className="text-xl font-bold text-fg mb-2">{tier.name}</h3>
              <div className="text-sm font-semibold text-teal bg-teal/10 px-3 py-1 rounded-full mb-6">
                {tier.limit} Credits
              </div>
              <div className="text-4xl font-black text-fg mb-8">{tier.price}<span className="text-lg text-fg-muted font-medium">/mo</span></div>

              <button
                onClick={() => handleUpgrade(tier.name)}
                disabled={isCurrent || isUpgrading}
                className={`w-full py-3 rounded-full font-bold transition-colors flex items-center justify-center gap-2 ${
                isCurrent
                  ? 'bg-surface/10 text-fg-muted cursor-default'
                  : 'border border-border-strong text-fg hover:bg-surface hover:text-fg disabled:opacity-60'
              }`}>
                {isCurrent ? 'Active' : isUpgrading ? <><Loader2 className="w-4 h-4 animate-spin" /> Processing…</> : 'Upgrade'}
              </button>
            </motion.div>
            );
          })}
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* RATE LIMITS SECTION */}
        <div className="lg:col-span-1 space-y-6">
          <div className="glass-inner rounded-2xl border border-border shadow-xl p-8 relative overflow-hidden group h-full flex flex-col">
            <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity pointer-events-none">
              <Zap className="w-48 h-48 text-teal transform rotate-12" />
            </div>
            
            <h2 className="text-lg font-bold text-fg mb-2 flex items-center gap-3 relative z-10">
              <div className="w-8 h-8 rounded-lg bg-teal/10 flex items-center justify-center">
                <ShieldAlert className="w-5 h-5 text-teal" />
              </div>
              Limits & Quotas
            </h2>
            <p className="text-fg-muted text-xs mb-6 relative z-10">Monitor your real-time API threshold utilization.</p>

            <div className="flex flex-col gap-8 flex-1 relative z-10">
              {/* Rate Limit Gauge */}
              <div className="bg-surface border border-border-subtle rounded-xl p-4 shadow-inner">
                <h3 className="text-[10px] font-black text-fg-muted uppercase tracking-widest text-center mb-[-20px]">Per-Minute Rate Limit</h3>
                <div className="relative h-32 flex items-center justify-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={rlGaugeData}
                        cx="50%"
                        cy="100%"
                        startAngle={180}
                        endAngle={0}
                        innerRadius={50}
                        outerRadius={70}
                        paddingAngle={2}
                        dataKey="value"
                        stroke="none"
                        cornerRadius={4}
                      >
                        {rlGaugeData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS_RL[index % COLORS_RL.length]} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute bottom-1 text-center w-full">
                    <div className="text-2xl font-extrabold text-fg tracking-tighter">{Math.round((rlConsumed/rateLimit)*100)}%</div>
                  </div>
                </div>
                <div className="flex justify-between items-center text-xs font-mono mt-2">
                  <span className="text-fg-muted font-bold">X-RateLimit-Remaining</span>
                  <span className="text-semantic-warning font-bold bg-semantic-warning/10 px-2 py-1 rounded border border-semantic-warning/20">{rlRemaining.toLocaleString()} / {rateLimit.toLocaleString()}</span>
                </div>
              </div>

              {/* Quota Gauge */}
              <div className="bg-surface border border-border-subtle rounded-xl p-4 shadow-inner">
                <h3 className="text-[10px] font-black text-fg-muted uppercase tracking-widest text-center mb-[-20px]">Monthly Quota Headroom</h3>
                <div className={cn("relative w-48 h-48", (isCriticalQuota && !isOverageSoft) && "animate-pulse")}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={quotaGaugeData}
                        cx="50%" cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        startAngle={180} endAngle={0}
                        dataKey="value"
                        stroke="none"
                      >
                        {quotaGaugeData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={isOverageSoft ? OVERAGE_COLORS[index % 2] : (isCriticalQuota ? WARNING_COLORS : COLORS)[index % 2]} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pt-8">
                    <span className={cn("text-3xl font-black", isOverageSoft ? "text-[#F5A623]" : isCriticalQuota ? "text-semantic-error" : "text-fg")}>
                      {quotaPercentage.toFixed(1)}%
                    </span>
                    <span className="text-[10px] uppercase font-bold text-fg-muted tracking-wider">Used</span>
                  </div>
                </div>
                <div className="flex justify-between items-center text-xs font-mono mt-2">
                  <span className="text-fg-muted font-bold">Available Credits</span>
                  <span className="text-teal font-bold bg-teal/10 px-2 py-1 rounded border border-teal/20">{quotaRemaining.toLocaleString()} / {totalQuota.toLocaleString()}</span>
                </div>
              </div>
            </div>

            <button
              onClick={() => toast.success('Limit increase requested', 'Our enterprise team will reach out within 1 business day to raise your rate limits.')}
              className="mt-8 w-full bg-surface text-fg font-bold text-sm px-4 py-4 rounded-xl shadow-[0_0_15px_rgba(255,255,255,0.1)] hover:shadow-[0_0_20px_rgba(255,255,255,0.2)] hover:bg-neutral-200 transition-all flex items-center justify-center gap-2 relative z-10"
            >
              Request Limit Increase
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          {/* AI FORECAST MODULE */}
          <div className="glass-inner rounded-2xl border border-border shadow-[0_0_15px_rgba(255,255,255,0.02)] p-6 relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/10 blur-3xl -z-10 rounded-full group-hover:bg-purple-500/20 transition-colors" />
            
            <h2 className="text-sm font-bold text-fg mb-1 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-purple-400" />
              AI Quota Forecast
            </h2>
            <p className="text-[10px] text-fg-muted mb-4 uppercase tracking-widest font-black">Predictive Burn Rate</p>

            <div className="flex items-center gap-3 mb-6 bg-overlay p-3 rounded-xl border border-border-subtle">
              <div className="w-10 h-10 rounded-full bg-purple-500/10 flex items-center justify-center border border-purple-500/20 shrink-0">
                <Calendar className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <p className="text-xs text-fg-muted font-medium">Estimated Exhaustion</p>
                <p className="text-sm font-black text-fg">
                  {exhaustionDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </p>
              </div>
            </div>

            <div className="h-28 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={forecastData}>
                  <defs>
                    <linearGradient id="colorVol" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#A855F7" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#A855F7" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#000', borderColor: '#333', borderRadius: '8px' }}
                    itemStyle={{ color: '#fff' }}
                  />
                  <Area type="monotone" dataKey="volume" stroke="#A855F7" strokeWidth={2} fillOpacity={1} fill="url(#colorVol)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* LEDGER SECTION */}
        <div className="lg:col-span-2 space-y-6">
          <div className="glass-inner rounded-2xl border border-border shadow-[0_0_15px_rgba(255,255,255,0.02)] p-8 h-full flex flex-col">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
              <h2 className="text-lg font-bold text-fg flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-teal/10 flex items-center justify-center">
                  <Activity className="w-5 h-5 text-teal" />
                </div>
                Credit Deduction Ledger
              </h2>
              <div className="text-left sm:text-right">
                <p className="text-[10px] font-black text-fg-muted uppercase tracking-widest mb-1">Available Balance</p>
                <div className="text-2xl font-extrabold text-fg tracking-tight">{creditBalance.toLocaleString()} <span className="text-xs text-teal font-bold ml-1 uppercase">Credits</span></div>
              </div>
            </div>
            
            <div className="overflow-x-auto flex-1">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-surface/80 border-b border-border text-fg-muted font-bold uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="px-4 py-4 rounded-tl-lg">Date</th>
                    <th className="px-4 py-4">zinbit API Source</th>
                    <th className="px-4 py-4 text-right">Successful Hits</th>
                    <th className="px-4 py-4 text-right rounded-tr-lg">Total Deductions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-fg">
                  {activeKeys.map((key) => (
                    <tr key={key.id} className="hover:bg-surface/5 transition-colors">
                      <td className="px-4 py-5 font-mono text-xs text-fg-muted">{new Date().toISOString().split('T')[0]}</td>
                      <td className="px-4 py-5 font-semibold text-fg">
                        {key.name}
                        <span className="block text-[10px] text-fg-muted font-mono mt-0.5">{key.key.length > 14 ? `${key.key.slice(0, key.key.lastIndexOf('_') + 1)}••••${key.key.slice(-4)}` : key.key}</span>
                      </td>
                      <td className="px-4 py-5 font-mono text-right font-medium text-fg-muted">{(key.creditsUsed || 0).toLocaleString()}</td>
                      <td className="px-4 py-5 font-mono text-right text-semantic-error">-{(key.creditsUsed || 0).toLocaleString()}</td>
                    </tr>
                  ))}
                  {activeKeys.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-fg-muted text-sm">No API keys found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            
            <div className="mt-6 pt-6 border-t border-border flex justify-between items-center">
              <p className="text-xs text-fg-muted">Only successful API responses deduct credits.</p>
              <Link href="/console/logs" className="text-sm font-bold text-teal hover:text-teal-ice flex items-center gap-1 transition-colors">
                View Full History <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* INVOICES SECTION */}
      <section className="glass-inner rounded-2xl border border-border shadow-[0_0_15px_rgba(255,255,255,0.02)] p-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none">
          <FileText className="w-48 h-48 text-fg transform -rotate-12" />
        </div>
        
        <div className="mt-16 mb-8 relative z-10">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
            <h2 className="text-lg font-bold text-fg flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-teal/10 flex items-center justify-center">
                <BellRing className="w-5 h-5 text-teal" />
              </div>
              Automated Usage Alerts
            </h2>
            <div className="flex items-center gap-3 w-full sm:w-auto">
              {user?.role === 'admin' && (
                <button 
                  onClick={simulateTrafficSpike}
                  className="flex items-center gap-2 bg-semantic-error/10 hover:bg-semantic-error/20 text-semantic-error px-4 py-2 rounded-xl text-sm font-bold border border-semantic-error/20 transition-all justify-center shadow-sm group"
                >
                  <Zap className="w-4 h-4 group-hover:scale-110 transition-transform" />
                  Simulate Spike
                </button>
              )}
              <button 
                onClick={() => setIsAlertFormOpen(true)}
                className="flex items-center gap-2 bg-surface/5 hover:bg-surface/10 text-fg px-4 py-2 rounded-xl text-sm font-bold border border-border transition-all justify-center"
              >
                <Plus className="w-4 h-4" />
                New Alert
              </button>
            </div>
          </div>

          <div className="glass-inner rounded-2xl border border-border overflow-hidden mb-6">
            <div className="p-4 border-b border-border bg-glass flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <h3 className="text-sm font-bold text-fg flex items-center gap-2">
                  Overage Mode (Soft Caps)
                  {billingDetails.overageMode === 'soft' && <span className="bg-[#F5A623]/20 text-[#F5A623] text-[10px] uppercase font-black px-2 py-0.5 rounded border border-[#F5A623]/30">Active</span>}
                </h3>
                <p className="text-xs text-fg-muted mt-1 max-w-lg">If enabled, reaching 100% quota will NOT block requests (429). Instead, requests continue up to 120% by draining your credit balance ($0.001/req).</p>
              </div>
              <button 
                onClick={() => updateBillingDetails({ overageMode: billingDetails.overageMode === 'hard' ? 'soft' : 'hard' })}
                className={`w-12 h-6 rounded-full p-1 transition-colors shrink-0 ${billingDetails.overageMode === 'soft' ? 'bg-teal' : 'bg-surface/20 border border-border'}`}
              >
                <div className={`w-4 h-4 bg-white rounded-full shadow-md transform transition-transform ${billingDetails.overageMode === 'soft' ? 'translate-x-6' : 'translate-x-0'}`} />
              </button>
            </div>
          </div>

          <div className="glass-inner rounded-2xl border border-border overflow-hidden">
            <div className="p-6">
              <p className="text-sm text-fg-muted mb-6">Receive automated notifications or execute auto-scaling when usage reaches specific thresholds.</p>
              
              <div className="space-y-3">
                {usageAlerts.length === 0 ? (
                  <div className="text-center py-6 text-fg-muted text-sm">No usage alerts configured.</div>
                ) : usageAlerts.map(alert => (
                  <div key={alert.id} className={cn("flex flex-col gap-4 bg-surface/5 border rounded-xl p-4 transition-all", alert.hasTriggered ? "border-semantic-warning/50 bg-semantic-warning/10" : "border-border")}>
                    <div className="flex items-center justify-between group">
                      <div className="flex items-center gap-4">
                        <div className={cn("w-10 h-10 rounded-full flex items-center justify-center border", alert.isActive ? (alert.hasTriggered ? 'bg-semantic-warning/20 border-semantic-warning/40 text-semantic-warning' : 'bg-teal/10 border-teal/20 text-teal') : 'bg-surface/5 border-border text-fg-subtle')}>
                          {alert.hasTriggered ? <AlertTriangle className="w-4 h-4 animate-pulse" /> : 
                           alert.type === 'velocity' ? <Zap className="w-4 h-4" /> :
                           alert.scope === 'key' ? <Key className="w-4 h-4" /> :
                           <Bell className="w-4 h-4" />}
                        </div>
                        <div>
                          <div className="text-sm font-bold text-fg flex items-center gap-2">
                            {alert.type === 'velocity' ? `Velocity Spike at ${alert.thresholdPercentage}%` : `Alert at ${alert.thresholdPercentage}% Quota`}
                            {alert.scope === 'key' && <span className="bg-white/10 text-fg-muted text-[10px] px-1.5 py-0.5 rounded font-medium">Key Scoped</span>}
                            {alert.resolutionAction === 'auto_recharge' && <span className="bg-teal/20 text-teal text-[10px] px-1.5 py-0.5 rounded font-medium">Auto-Scales</span>}
                          </div>
                          <div className="text-xs text-fg-muted flex items-center gap-2 mt-1">
                            Via: {alert.channels.map(c => c.charAt(0).toUpperCase() + c.slice(1)).join(', ')}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <button 
                          onClick={() => toggleUsageAlert(alert.id)}
                          className={`w-10 h-5 rounded-full p-0.5 transition-colors ${alert.isActive ? 'bg-teal' : 'bg-surface/20'}`}
                        >
                          <div className={`w-4 h-4 bg-surface rounded-full shadow-md transform transition-transform ${alert.isActive ? 'translate-x-5' : 'translate-x-0'}`} />
                        </button>
                        <button 
                          onClick={() => deleteUsageAlert(alert.id)}
                          className="p-2 text-semantic-error/60 hover:text-semantic-error hover:bg-semantic-error/10 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    {alert.hasTriggered && (
                      <div className="flex items-center justify-between border-t border-semantic-warning/20 pt-3">
                        <span className="text-xs font-bold text-semantic-warning flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> Threshold Triggered</span>
                        <button 
                          onClick={() => dismissTriggeredAlert(alert.id)}
                          className="text-xs font-bold text-fg-muted hover:text-fg px-3 py-1.5 rounded-lg hover:bg-glass transition-colors"
                        >
                          Dismiss
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 mt-16 relative z-10 gap-4">
          <h2 className="text-lg font-bold text-fg flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-surface/10 flex items-center justify-center">
              <FileText className="w-5 h-5 text-fg" />
            </div>
            Invoices & Statements
          </h2>
          <Link 
            href="/console/billing/settings" 
            className="px-4 py-2 bg-glass hover:bg-glass-2 border border-border rounded-lg text-sm font-bold text-fg transition-colors flex items-center gap-2 shadow-sm"
          >
            <Settings className="w-4 h-4" />
            Manage POCs & Info
          </Link>
        </div>
        
        <div className="overflow-x-auto relative z-10">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-surface/80 border-b border-border text-fg-muted font-bold uppercase tracking-wider text-[10px]">
              <tr>
                <th className="px-4 py-4 rounded-tl-lg">Invoice Date</th>
                <th className="px-4 py-4">Invoice Number</th>
                <th className="px-4 py-4">Plan Details</th>
                <th className="px-4 py-4 text-right">Amount</th>
                <th className="px-4 py-4 text-center">Status</th>
                <th className="px-4 py-4 text-right rounded-tr-lg">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-fg">
              {invoices.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-fg-muted text-sm">No invoices available.</td>
                </tr>
              ) : invoices.map((inv) => (
                <tr key={inv.id} className="hover:bg-surface/5 transition-colors">
                  <td className="px-4 py-5 font-mono text-xs text-fg-muted">{inv.date}</td>
                  <td className="px-4 py-5 font-mono text-xs font-bold text-fg">{inv.id}</td>
                  <td className="px-4 py-5 font-medium text-fg-muted">{inv.plan}</td>
                  <td className="px-4 py-5 font-mono text-right font-black text-fg">{inv.amount}</td>
                  <td className="px-4 py-5 text-center">
                    <span className="bg-semantic-success/10 text-semantic-success border border-semantic-success/20 px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-widest inline-flex items-center gap-1">
                      <Check className="w-3 h-3" /> {inv.status}
                    </span>
                  </td>
                  <td className="px-4 py-5 text-right">
                    <button 
                      onClick={() => handleDownload(inv.id)}
                      disabled={downloadingId === inv.id}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface/5 hover:bg-surface/10 border border-border transition-colors text-xs font-bold text-fg disabled:opacity-50"
                    >
                      {downloadingId === inv.id ? (
                        <div className="w-4 h-4 rounded-full border-2 border-border-strong border-t-white animate-spin" />
                      ) : (
                        <Download className="w-4 h-4" />
                      )}
                      {downloadingId === inv.id ? 'Generating PDF...' : 'Download PDF'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* New Alert Modal */}
      <AnimatePresence>
        {isAlertFormOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-overlay backdrop-blur-sm"
              onClick={() => setIsAlertFormOpen(false)}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-surface border border-border rounded-3xl shadow-2xl overflow-hidden z-10"
            >
              <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-surface/5">
                <h3 className="font-bold text-fg">Create Usage Alert</h3>
              </div>
              <div className="p-6 space-y-6">
                <div>
                  <label className="block text-[10px] font-black text-fg-muted uppercase tracking-widest mb-2">Threshold Percentage</label>
                  <div className="flex items-center gap-4">
                    <input 
                      type="range" min="50" max="100" step="5"
                      value={newAlertPercent}
                      onChange={(e) => setNewAlertPercent(e.target.value)}
                      className="w-full accent-teal"
                    />
                    <span className="text-xl font-black text-fg w-12 text-right">{newAlertPercent}%</span>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-black text-fg-muted uppercase tracking-widest mb-2">Alert Type</label>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => setNewAlertType('absolute')}
                        className={cn("flex-1 py-2 text-xs font-bold rounded-lg border transition-colors", newAlertType === 'absolute' ? "bg-teal/10 text-teal border-teal/20" : "bg-glass text-fg-muted border-border hover:bg-glass-2")}
                      >Absolute %</button>
                      <button 
                        onClick={() => setNewAlertType('velocity')}
                        className={cn("flex-1 py-2 text-xs font-bold rounded-lg border transition-colors", newAlertType === 'velocity' ? "bg-teal/10 text-teal border-teal/20" : "bg-glass text-fg-muted border-border hover:bg-glass-2")}
                      >Velocity Spike</button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-black text-fg-muted uppercase tracking-widest mb-2">Scope</label>
                    <div className="flex gap-2 mb-2">
                      <button 
                        onClick={() => setNewAlertScope('global')}
                        className={cn("flex-1 py-2 text-xs font-bold rounded-lg border transition-colors", newAlertScope === 'global' ? "bg-teal/10 text-teal border-teal/20" : "bg-glass text-fg-muted border-border hover:bg-glass-2")}
                      >Global</button>
                      <button 
                        onClick={() => setNewAlertScope('key')}
                        className={cn("flex-1 py-2 text-xs font-bold rounded-lg border transition-colors", newAlertScope === 'key' ? "bg-teal/10 text-teal border-teal/20" : "bg-glass text-fg-muted border-border hover:bg-glass-2")}
                      >Specific Key</button>
                    </div>
                    <AnimatePresence>
                      {newAlertScope === 'key' && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
                          <select 
                            value={newAlertScopeTargetId}
                            onChange={(e) => setNewAlertScopeTargetId(e.target.value)}
                            className="w-full bg-[#121212] border border-border rounded-lg p-2 text-sm text-fg focus:border-teal outline-none"
                          >
                            <option value="">Select an API Key...</option>
                            {activeKeys.map(k => (
                              <option key={k.id} value={k.id}>{k.name} ({k.prefix}...)</option>
                            ))}
                          </select>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  <div>
                    <label className="block text-[10px] font-black text-fg-muted uppercase tracking-widest mb-2">Resolution Action</label>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => setNewAlertAction('notify')}
                        className={cn("flex-1 py-2 text-xs font-bold rounded-lg border transition-colors", newAlertAction === 'notify' ? "bg-teal/10 text-teal border-teal/20" : "bg-glass text-fg-muted border-border hover:bg-glass-2")}
                      >Notify Only</button>
                      <button 
                        onClick={() => setNewAlertAction('auto_recharge')}
                        className={cn("flex-1 py-2 text-xs font-bold rounded-lg border transition-colors", newAlertAction === 'auto_recharge' ? "bg-teal/10 text-teal border-teal/20" : "bg-glass text-fg-muted border-border hover:bg-glass-2")}
                      >Auto-Purchase Block</button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-black text-fg-muted uppercase tracking-widest mb-2">Notification Channels</label>
                    <div className="grid grid-cols-2 gap-2">
                    <label className="flex items-center gap-3 p-3 rounded-xl border border-border hover:bg-surface/5 cursor-pointer">
                      <input 
                        type="checkbox"
                        checked={newAlertChannels.includes('email')}
                        onChange={(e) => {
                          if (e.target.checked) setNewAlertChannels([...newAlertChannels, 'email']);
                          else setNewAlertChannels(newAlertChannels.filter(c => c !== 'email'));
                        }}
                        className="accent-teal w-4 h-4"
                      />
                      <span className="text-sm font-bold text-fg">Email</span>
                    </label>
                    <label className="flex items-center gap-3 p-3 rounded-xl border border-border hover:bg-surface/5 cursor-pointer">
                      <input 
                        type="checkbox"
                        checked={newAlertChannels.includes('webhook')}
                        onChange={(e) => {
                          if (e.target.checked) setNewAlertChannels([...newAlertChannels, 'webhook']);
                          else setNewAlertChannels(newAlertChannels.filter(c => c !== 'webhook'));
                        }}
                        className="accent-teal w-4 h-4"
                      />
                      <span className="text-sm font-bold text-fg">Webhook</span>
                    </label>
                  </div>
                </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button 
                    onClick={() => setIsAlertFormOpen(false)}
                    className="flex-1 py-3 px-4 rounded-xl font-bold bg-surface/5 text-fg hover:bg-surface/10 transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    disabled={newAlertChannels.length === 0}
                    onClick={() => {
                      track('alert_rule_created', { kind: 'usage', type: newAlertType, scope: newAlertScope, threshold: parseInt(newAlertPercent) });
                      addUsageAlert({
                        thresholdPercentage: parseInt(newAlertPercent), 
                        channels: newAlertChannels,
                        type: newAlertType,
                        scope: newAlertScope,
                        scopeTargetId: newAlertScope === 'key' ? newAlertScopeTargetId : undefined,
                        resolutionAction: newAlertAction,
                        isActive: true
                      });
                      setIsAlertFormOpen(false);
                      setNewAlertPercent('80');
                      setNewAlertChannels(['email']);
                      setNewAlertType('absolute');
                      setNewAlertScope('global');
                      setNewAlertAction('notify');
                    }}
                    className="flex-1 py-3 px-4 rounded-xl font-bold bg-teal text-[#09090b] hover:bg-teal/90 transition-colors disabled:opacity-50"
                  >
                    Save Alert
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
