'use client';

import React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ShieldCheck, CheckCircle2, AlertCircle, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

// Helper to generate a 60-day history array
const generateUptimeHistory = (outageIndex?: number) => {
  return Array.from({ length: 60 }).map((_, i) => {
    if (i === outageIndex) {
      return { status: 'partial_outage', tooltip: 'Partial Outage - Resolved in 45m' };
    }
    return { status: 'operational', tooltip: 'No downtime recorded' };
  });
};

const SYSTEMS = [
  { name: 'API Gateway', uptime: '100.00%', history: generateUptimeHistory() },
  { name: 'Identity Engine', uptime: '99.98%', history: generateUptimeHistory(45) },
  { name: 'Partner Console', uptime: '100.00%', history: generateUptimeHistory() },
  { name: 'Webhook Dispatcher', uptime: '99.99%', history: generateUptimeHistory(12) },
];

const INCIDENTS = [
  {
    id: 'inc-1',
    date: 'August 12, 2026',
    status: 'Resolved',
    title: 'Elevated latency on Identity Engine',
    description: 'We experienced elevated latency resolving identities due to a surge in traffic from a downstream registry. Additional read replicas were provisioned and latency has returned to normal bounds (<120ms).',
    updates: [
      { time: '14:45 UTC', text: 'This incident has been resolved and all systems are 100% operational.' },
      { time: '14:15 UTC', text: 'We have identified the root cause and are deploying a fix.' },
      { time: '14:00 UTC', text: 'We are investigating reports of elevated latency on the /v1/people-search endpoints.' },
    ]
  },
  {
    id: 'inc-2',
    date: 'July 28, 2026',
    status: 'Resolved',
    title: 'Delayed Webhook Deliveries',
    description: 'A subset of webhooks experienced delivery delays up to 5 minutes. No payloads were dropped, and the backlog has been fully processed.',
    updates: [
      { time: '09:30 UTC', text: 'All delayed webhooks have been successfully processed.' },
      { time: '09:10 UTC', text: 'We are currently investigating a delay in webhook dispatching.' },
    ]
  }
];

export default function StatusPage() {
  return (
    <div className="bg-ink min-h-screen text-white font-sans selection:bg-teal selection:text-ink">
      {/* Background Grids */}
      <div className="grid-dark absolute inset-0 opacity-30 pointer-events-none" />
      <div className="absolute top-0 right-0 w-[600px] h-[400px] bg-semantic-success/10 blur-[120px] rounded-full -z-10 pointer-events-none translate-x-1/4 -translate-y-1/4" />
      
      {/* Navbar Minimal */}
      <nav className="sticky top-0 z-50 border-b border-white/10 bg-ink/70 backdrop-blur-xl">
        <div className="max-w-5xl mx-auto px-6 h-[76px] flex items-center justify-between">
          <Link href="/api" className="flex items-center gap-2">
            <img src="/logo.png" alt="Zintlr" className="h-8 w-auto" />
            <span className="font-bold text-white/50 border-l border-white/20 pl-2 ml-2">Status</span>
          </Link>
          <div className="flex items-center gap-6">
            <Link href="/docs" className="text-sm font-medium text-white/70 hover:text-white transition-colors">API Docs</Link>
            <Link href="/console" className="text-sm font-medium text-white/70 hover:text-white transition-colors">Console</Link>
          </div>
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-6 py-16 space-y-16 relative z-10">
        
        {/* Header / Global Status */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-inner rounded-3xl p-8 md:p-12 border-semantic-success/20 bg-semantic-success/5 flex flex-col md:flex-row items-center gap-6 shadow-[0_0_40px_-10px_rgba(40,167,69,0.15)]"
        >
          <div className="w-20 h-20 rounded-full bg-semantic-success/20 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-10 h-10 text-semantic-success" />
          </div>
          <div className="text-center md:text-left">
            <h1 className="text-3xl md:text-4xl font-extrabold text-white mb-2">All Systems Operational</h1>
            <p className="text-white/60 font-medium text-lg">Zintlr API and Identity services are running smoothly.</p>
          </div>
        </motion.div>

        {/* Core Systems */}
        <motion.section 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="space-y-6"
        >
          <div className="flex items-end justify-between border-b border-white/10 pb-4">
            <h2 className="text-2xl font-bold text-white tracking-tight">System Status</h2>
            <span className="text-xs font-bold text-white/40 uppercase tracking-widest">Uptime over past 60 days</span>
          </div>

          <div className="glass-inner rounded-2xl border border-white/10 divide-y divide-white/5 overflow-hidden">
            {SYSTEMS.map((system) => (
              <div key={system.name} className="p-6 hover:bg-white/5 transition-colors">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-bold text-white">{system.name}</h3>
                  <span className="text-sm font-bold text-semantic-success bg-semantic-success/10 px-2 py-0.5 rounded text-right">{system.uptime}</span>
                </div>
                
                {/* 60 Day Bar Graph */}
                <div className="flex items-center gap-1 h-8 w-full group relative">
                  {system.history.map((day, i) => (
                    <div 
                      key={i}
                      className={cn(
                        "flex-1 rounded-sm h-full transition-opacity hover:opacity-80",
                        day.status === 'operational' ? "bg-semantic-success/80" : "bg-semantic-warning"
                      )}
                      title={day.tooltip}
                    />
                  ))}
                  
                  {/* Tooltip hint on hover over graph container */}
                  <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-[#1A1924] border border-white/10 text-xs text-white px-3 py-1.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                    Hover over bars for daily status
                  </div>
                </div>
                
                <div className="flex justify-between mt-2 text-[10px] font-bold text-white/30 uppercase tracking-widest">
                  <span>60 days ago</span>
                  <span>Today</span>
                </div>
              </div>
            ))}
          </div>
        </motion.section>

        {/* Incident History */}
        <motion.section 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="space-y-8"
        >
          <div className="border-b border-white/10 pb-4">
            <h2 className="text-2xl font-bold text-white tracking-tight">Past Incidents</h2>
          </div>

          <div className="space-y-12">
            {INCIDENTS.map((incident) => (
              <div key={incident.id} className="relative">
                <div className="text-lg font-bold text-white mb-4 border-l-2 border-white/20 pl-4">
                  {incident.date}
                </div>
                
                <div className="glass-inner rounded-2xl border border-white/10 p-6 sm:p-8 ml-0 sm:ml-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                    <h3 className="text-xl font-bold text-white">{incident.title}</h3>
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-white bg-white/10 px-3 py-1 rounded-full border border-white/10 w-fit">
                      <Clock className="w-3 h-3" />
                      {incident.status}
                    </span>
                  </div>
                  
                  <p className="text-white/70 font-medium leading-relaxed mb-8">
                    {incident.description}
                  </p>

                  <div className="space-y-6">
                    {incident.updates.map((update, idx) => (
                      <div key={idx} className="flex gap-4 items-start">
                        <div className="text-xs font-bold text-white/40 mt-1 min-w-[70px]">
                          {update.time}
                        </div>
                        <div className="text-sm text-white/80 leading-relaxed bg-[#09090b] rounded-lg p-3 border border-white/5 w-full">
                          {update.text}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
          
          <div className="pt-8 text-center text-sm font-medium text-white/40">
            No other incidents in the past 90 days.
          </div>
        </motion.section>

      </main>

      <footer className="bg-ink border-t border-white/10 py-12 text-center mt-12">
        <div className="max-w-5xl mx-auto px-6 flex flex-col items-center">
          <ShieldCheck className="w-8 h-8 text-white/20 mb-4" />
          <div className="text-sm font-semibold text-white/30">
            © {new Date().getFullYear()} Zintlr B2B2B. All systems operational.
          </div>
        </div>
      </footer>
    </div>
  );
}
