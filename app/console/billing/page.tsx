'use client';

import { Activity, ShieldAlert, ArrowRight, Zap, Check, CreditCard, Download, FileText, BellRing, Trash2, Plus, Bell, Settings } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { useStore } from '@/lib/store';
import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';
import { useToast } from '@/components/Toast';
import Link from 'next/link';

const mockLedger = [
  { date: '2026-08-24', source: 'Find Phone by Email', hits: 1450, totalCredits: 1450 },
  { date: '2026-08-24', source: 'Retrieve from LinkedIn', hits: 320, totalCredits: 1600 },
  { date: '2026-08-23', source: 'Director Phone by DIN', hits: 85, totalCredits: 425 },
  { date: '2026-08-23', source: 'Personality Intel', hits: 110, totalCredits: 550 },
  { date: '2026-08-22', source: 'Enrich by Phone', hits: 2300, totalCredits: 2300 },
];

const pricingTiers = [
  { name: "Starter", limit: "10,000", price: "$99", current: true },
  { name: "Growth", limit: "100,000", price: "$499", current: false },
  { name: "Scale", limit: "1,000,000", price: "$2,999", current: false },
];

const mockInvoices = [
  { id: 'INV-2026-08', date: 'Aug 01, 2026', amount: '$99.00', status: 'Paid', plan: 'Starter Plan' },
  { id: 'INV-2026-07', date: 'Jul 01, 2026', amount: '$99.00', status: 'Paid', plan: 'Starter Plan' },
  { id: 'INV-2026-06', date: 'Jun 01, 2026', amount: '$99.00', status: 'Paid', plan: 'Starter Plan' },
];

export default function BillingPage() {
  const { creditBalance, usageAlerts, addUsageAlert, toggleUsageAlert, deleteUsageAlert } = useStore();
  const toast = useToast();
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [isAlertFormOpen, setIsAlertFormOpen] = useState(false);
  const [newAlertPercent, setNewAlertPercent] = useState('80');
  const [newAlertChannels, setNewAlertChannels] = useState<('email' | 'webhook')[]>(['email']);

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
  
  // Rate Limit Data for Gauge Chart
  const rateLimit = 1000;
  const rlRemaining = 825;
  const rlConsumed = rateLimit - rlRemaining;
  
  const rlGaugeData = [
    { name: 'Consumed', value: rlConsumed },
    { name: 'Remaining', value: rlRemaining },
  ];
  
  // Quota Headroom Data for Gauge Chart
  const totalQuota = 10000;
  const quotaRemaining = creditBalance;
  const quotaConsumed = Math.max(0, totalQuota - quotaRemaining);
  
  const quotaGaugeData = [
    { name: 'Consumed', value: quotaConsumed },
    { name: 'Remaining', value: quotaRemaining },
  ];
  
  const COLORS_RL = ['#FFB020', '#1A1924']; // Yellow for rate limit consumed
  const COLORS_QUOTA = ['#46BDC6', '#1A1924']; // Teal for quota consumed

  return (
    <div className="max-w-6xl mx-auto space-y-12 pb-12 font-sans text-white">
      
      {/* Header */}
      <div>
        <h1 className="text-3xl font-extrabold text-white mb-2 tracking-tight font-display">Billing & Quotas</h1>
        <p className="text-white/60 font-medium text-sm">Manage your credit consumption, rate limits, and subscription tiers.</p>
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
          {pricingTiers.map((tier, i) => (
            <motion.div 
              key={tier.name}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className={`glass-inner rounded-3xl p-8 flex flex-col items-center text-center transition-all ${
                tier.current 
                  ? 'border-teal shadow-[0_0_30px_-5px_rgba(70,189,198,0.3)] bg-[#09090b]/5' 
                  : 'border-white/10 hover:border-white/20'
              }`}
            >
              {tier.current && (
                <div className="bg-teal text-ink text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full mb-4">
                  Current Plan
                </div>
              )}
              <h3 className="text-xl font-bold text-white mb-2">{tier.name}</h3>
              <div className="text-sm font-semibold text-teal bg-teal/10 px-3 py-1 rounded-full mb-6">
                {tier.limit} Credits
              </div>
              <div className="text-4xl font-black text-white mb-8">{tier.price}<span className="text-lg text-white/40 font-medium">/mo</span></div>
              
              <button 
                onClick={() => {
                  if (!tier.current) {
                    toast.info('Redirecting to Checkout', 'A real app would open a Stripe checkout session here.');
                  }
                }}
                className={`w-full py-3 rounded-full font-bold transition-colors ${
                tier.current 
                  ? 'bg-[#09090b]/10 text-white/50 cursor-default' 
                  : 'border border-white/20 text-white hover:bg-[#09090b] hover:text-white'
              }`}>
                {tier.current ? 'Active' : 'Upgrade'}
              </button>
            </motion.div>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* RATE LIMITS SECTION */}
        <div className="lg:col-span-1 space-y-6">
          <div className="glass-inner rounded-2xl border border-white/10 shadow-xl p-8 relative overflow-hidden group h-full flex flex-col">
            <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity pointer-events-none">
              <Zap className="w-48 h-48 text-teal transform rotate-12" />
            </div>
            
            <h2 className="text-lg font-bold text-white mb-2 flex items-center gap-3 relative z-10">
              <div className="w-8 h-8 rounded-lg bg-teal/10 flex items-center justify-center">
                <ShieldAlert className="w-5 h-5 text-teal" />
              </div>
              Limits & Quotas
            </h2>
            <p className="text-white/40 text-xs mb-6 relative z-10">Monitor your real-time API threshold utilization.</p>

            <div className="flex flex-col gap-8 flex-1 relative z-10">
              {/* Rate Limit Gauge */}
              <div className="bg-[#09090b] border border-white/5 rounded-xl p-4 shadow-inner">
                <h3 className="text-[10px] font-black text-white/40 uppercase tracking-widest text-center mb-[-20px]">Per-Minute Rate Limit</h3>
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
                    <div className="text-2xl font-extrabold text-white tracking-tighter">{Math.round((rlConsumed/rateLimit)*100)}%</div>
                  </div>
                </div>
                <div className="flex justify-between items-center text-xs font-mono mt-2">
                  <span className="text-white/50 font-bold">X-RateLimit-Remaining</span>
                  <span className="text-semantic-warning font-bold bg-semantic-warning/10 px-2 py-1 rounded border border-semantic-warning/20">{rlRemaining.toLocaleString()} / {rateLimit.toLocaleString()}</span>
                </div>
              </div>

              {/* Quota Gauge */}
              <div className="bg-[#09090b] border border-white/5 rounded-xl p-4 shadow-inner">
                <h3 className="text-[10px] font-black text-white/40 uppercase tracking-widest text-center mb-[-20px]">Monthly Quota Headroom</h3>
                <div className="relative h-32 flex items-center justify-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={quotaGaugeData}
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
                        {quotaGaugeData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS_QUOTA[index % COLORS_QUOTA.length]} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute bottom-1 text-center w-full">
                    <div className="text-2xl font-extrabold text-white tracking-tighter">{Math.round((quotaConsumed/totalQuota)*100)}%</div>
                  </div>
                </div>
                <div className="flex justify-between items-center text-xs font-mono mt-2">
                  <span className="text-white/50 font-bold">Available Credits</span>
                  <span className="text-teal font-bold bg-teal/10 px-2 py-1 rounded border border-teal/20">{quotaRemaining.toLocaleString()} / {totalQuota.toLocaleString()}</span>
                </div>
              </div>
            </div>

            <button className="mt-8 w-full bg-[#09090b] text-white font-bold text-sm px-4 py-4 rounded-xl shadow-[0_0_15px_rgba(255,255,255,0.1)] hover:shadow-[0_0_20px_rgba(255,255,255,0.2)] hover:bg-neutral-200 transition-all flex items-center justify-center gap-2 relative z-10">
              Request Limit Increase
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* LEDGER SECTION */}
        <div className="lg:col-span-2 space-y-6">
          <div className="glass-inner rounded-2xl border border-white/10 shadow-[0_0_15px_rgba(255,255,255,0.02)] p-8 h-full flex flex-col">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
              <h2 className="text-lg font-bold text-white flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-teal/10 flex items-center justify-center">
                  <Activity className="w-5 h-5 text-teal" />
                </div>
                Credit Deduction Ledger
              </h2>
              <div className="text-left sm:text-right">
                <p className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-1">Available Balance</p>
                <div className="text-2xl font-extrabold text-white tracking-tight">{creditBalance.toLocaleString()} <span className="text-xs text-teal font-bold ml-1 uppercase">Credits</span></div>
              </div>
            </div>
            
            <div className="overflow-x-auto flex-1">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-[#09090b]/80 border-b border-white/10 text-white/50 font-bold uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="px-4 py-4 rounded-tl-lg">Date</th>
                    <th className="px-4 py-4">zinbit API Source</th>
                    <th className="px-4 py-4 text-right">Successful Hits</th>
                    <th className="px-4 py-4 text-right rounded-tr-lg">Total Deductions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-white/80">
                  {mockLedger.map((entry, idx) => (
                    <tr key={idx} className="hover:bg-[#09090b]/5 transition-colors">
                      <td className="px-4 py-5 font-mono text-xs text-white/40">{entry.date}</td>
                      <td className="px-4 py-5 font-semibold text-white/90">{entry.source}</td>
                      <td className="px-4 py-5 font-mono text-right font-medium text-white/60">{entry.hits.toLocaleString()}</td>
                      <td className="px-4 py-5 font-mono text-right text-semantic-error">-{entry.totalCredits.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            <div className="mt-6 pt-6 border-t border-white/10 flex justify-between items-center">
              <p className="text-xs text-white/40">Only successful API responses deduct credits.</p>
              <button className="text-sm font-bold text-teal hover:text-teal-ice flex items-center gap-1 transition-colors">
                View Full History <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* INVOICES SECTION */}
      <section className="glass-inner rounded-2xl border border-white/10 shadow-[0_0_15px_rgba(255,255,255,0.02)] p-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none">
          <FileText className="w-48 h-48 text-white transform -rotate-12" />
        </div>
        
        <div className="mt-16 mb-8 relative z-10">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
            <h2 className="text-lg font-bold text-white flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-teal/10 flex items-center justify-center">
                <BellRing className="w-5 h-5 text-teal" />
              </div>
              Automated Usage Alerts
            </h2>
            <button 
              onClick={() => setIsAlertFormOpen(true)}
              className="flex items-center gap-2 bg-[#09090b]/5 hover:bg-[#09090b]/10 text-white px-4 py-2 rounded-xl text-sm font-bold border border-white/10 transition-all w-full sm:w-auto justify-center"
            >
              <Plus className="w-4 h-4" />
              New Alert
            </button>
          </div>

          <div className="glass-inner rounded-2xl border border-white/10 overflow-hidden">
            <div className="p-6">
              <p className="text-sm text-white/60 mb-6">Receive automated notifications when your quota usage reaches specific thresholds to prevent unexpected exhaustion.</p>
              
              <div className="space-y-3">
                {usageAlerts.length === 0 ? (
                  <div className="text-center py-6 text-white/40 text-sm">No usage alerts configured.</div>
                ) : usageAlerts.map(alert => (
                  <div key={alert.id} className="flex items-center justify-between bg-[#09090b]/5 border border-white/10 rounded-xl p-4 group">
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center border ${alert.isActive ? 'bg-teal/10 border-teal/20 text-teal' : 'bg-[#09090b]/5 border-white/10 text-white/30'}`}>
                        <Bell className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-sm font-bold text-white">Alert at {alert.thresholdPercentage}% Quota Usage</div>
                        <div className="text-xs text-white/50 flex items-center gap-2 mt-1">
                          Via: {alert.channels.map(c => c === 'email' ? 'Email' : 'Webhook').join(', ')}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <button 
                        onClick={() => toggleUsageAlert(alert.id)}
                        className={`w-10 h-5 rounded-full p-0.5 transition-colors ${alert.isActive ? 'bg-teal' : 'bg-[#09090b]/20'}`}
                      >
                        <div className={`w-4 h-4 bg-[#09090b] rounded-full shadow-md transform transition-transform ${alert.isActive ? 'translate-x-5' : 'translate-x-0'}`} />
                      </button>
                      <button 
                        onClick={() => deleteUsageAlert(alert.id)}
                        className="p-2 text-semantic-error/60 hover:text-semantic-error hover:bg-semantic-error/10 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 mt-16 relative z-10 gap-4">
          <h2 className="text-lg font-bold text-white flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#09090b]/10 flex items-center justify-center">
              <FileText className="w-5 h-5 text-white" />
            </div>
            Invoices & Statements
          </h2>
          <Link 
            href="/console/billing/settings" 
            className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-sm font-bold text-white transition-colors flex items-center gap-2 shadow-sm"
          >
            <Settings className="w-4 h-4" />
            Manage POCs & Info
          </Link>
        </div>
        
        <div className="overflow-x-auto relative z-10">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-[#09090b]/80 border-b border-white/10 text-white/50 font-bold uppercase tracking-wider text-[10px]">
              <tr>
                <th className="px-4 py-4 rounded-tl-lg">Invoice Date</th>
                <th className="px-4 py-4">Invoice Number</th>
                <th className="px-4 py-4">Plan Details</th>
                <th className="px-4 py-4 text-right">Amount</th>
                <th className="px-4 py-4 text-center">Status</th>
                <th className="px-4 py-4 text-right rounded-tr-lg">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-white/80">
              {mockInvoices.map((inv) => (
                <tr key={inv.id} className="hover:bg-[#09090b]/5 transition-colors">
                  <td className="px-4 py-5 font-mono text-xs text-white/40">{inv.date}</td>
                  <td className="px-4 py-5 font-mono text-xs font-bold text-white/90">{inv.id}</td>
                  <td className="px-4 py-5 font-medium text-white/60">{inv.plan}</td>
                  <td className="px-4 py-5 font-mono text-right font-black text-white">{inv.amount}</td>
                  <td className="px-4 py-5 text-center">
                    <span className="bg-semantic-success/10 text-semantic-success border border-semantic-success/20 px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-widest inline-flex items-center gap-1">
                      <Check className="w-3 h-3" /> {inv.status}
                    </span>
                  </td>
                  <td className="px-4 py-5 text-right">
                    <button 
                      onClick={() => handleDownload(inv.id)}
                      disabled={downloadingId === inv.id}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#09090b]/5 hover:bg-[#09090b]/10 border border-white/10 transition-colors text-xs font-bold text-white disabled:opacity-50"
                    >
                      {downloadingId === inv.id ? (
                        <div className="w-4 h-4 rounded-full border-2 border-white/20 border-t-white animate-spin" />
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
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setIsAlertFormOpen(false)}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-[#09090b] border border-white/10 rounded-3xl shadow-2xl overflow-hidden z-10"
            >
              <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between bg-[#09090b]/5">
                <h3 className="font-bold text-white">Create Usage Alert</h3>
              </div>
              <div className="p-6 space-y-6">
                <div>
                  <label className="block text-[10px] font-black text-white/40 uppercase tracking-widest mb-2">Threshold Percentage</label>
                  <div className="flex items-center gap-4">
                    <input 
                      type="range" min="50" max="100" step="5"
                      value={newAlertPercent}
                      onChange={(e) => setNewAlertPercent(e.target.value)}
                      className="w-full accent-teal"
                    />
                    <span className="text-xl font-black text-white w-12 text-right">{newAlertPercent}%</span>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-white/40 uppercase tracking-widest mb-2">Notification Channels</label>
                  <div className="space-y-2">
                    <label className="flex items-center gap-3 p-3 rounded-xl border border-white/10 hover:bg-[#09090b]/5 cursor-pointer">
                      <input 
                        type="checkbox"
                        checked={newAlertChannels.includes('email')}
                        onChange={(e) => {
                          if (e.target.checked) setNewAlertChannels([...newAlertChannels, 'email']);
                          else setNewAlertChannels(newAlertChannels.filter(c => c !== 'email'));
                        }}
                        className="accent-teal w-4 h-4"
                      />
                      <span className="text-sm font-bold text-white">Email</span>
                    </label>
                    <label className="flex items-center gap-3 p-3 rounded-xl border border-white/10 hover:bg-[#09090b]/5 cursor-pointer">
                      <input 
                        type="checkbox"
                        checked={newAlertChannels.includes('webhook')}
                        onChange={(e) => {
                          if (e.target.checked) setNewAlertChannels([...newAlertChannels, 'webhook']);
                          else setNewAlertChannels(newAlertChannels.filter(c => c !== 'webhook'));
                        }}
                        className="accent-teal w-4 h-4"
                      />
                      <span className="text-sm font-bold text-white">Webhook</span>
                    </label>
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button 
                    onClick={() => setIsAlertFormOpen(false)}
                    className="flex-1 py-3 px-4 rounded-xl font-bold bg-[#09090b]/5 text-white hover:bg-[#09090b]/10 transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    disabled={newAlertChannels.length === 0}
                    onClick={() => {
                      addUsageAlert(parseInt(newAlertPercent), newAlertChannels);
                      setIsAlertFormOpen(false);
                      setNewAlertPercent('80');
                      setNewAlertChannels(['email']);
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
