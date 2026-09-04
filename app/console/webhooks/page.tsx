'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useStore, type WebhookEndpoint, type WebhookLog } from '@/lib/store';
import { motion, AnimatePresence } from 'framer-motion';
import { Webhook, Plus, CheckCircle2, XCircle, Clock, RefreshCw, Loader2, Play, Trash2, Check, ChevronDown, ChevronRight, Timer, Search, Download, GitBranch, Link, ShieldAlert, FastForward } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CodeBlock } from '@/components/CodeBlock';
import RoleGuard from '@/components/RoleGuard';
import { track } from '@/lib/telemetry';
import { Activity, ShieldCheck, Eye, EyeOff, Copy, Filter, Code2, GitCompare, Zap, PauseCircle } from 'lucide-react';

const INTEGRATIONS = [
  { id: 'custom', name: 'Custom URL', icon: <Webhook className="w-4 h-4"/>, placeholder: 'https://api.yourdomain.com/webhooks' },
  { id: 'slack', name: 'Slack', icon: <Activity className="w-4 h-4"/>, placeholder: 'https://hooks.slack.com/services/...' },
  { id: 'discord', name: 'Discord', icon: <Zap className="w-4 h-4"/>, placeholder: 'https://discord.com/api/webhooks/...' },
];

const AVAILABLE_EVENTS = [
  { id: 'identity.completed', label: 'Identity Verification Completed', desc: 'Fired when a person search finishes.' },
  { id: 'risk_signal.generated', label: 'Risk Signal Generated', desc: 'Fired when a high-risk factor is detected.' },
  { id: 'company.enriched', label: 'Company Enriched', desc: 'Fired when domain-to-CIN mapping succeeds.' },
  { id: 'payment.failed', label: 'Payment Failed', desc: 'Fired when a billing attempt fails.' }
];

export default function WebhooksPage() {
  const { environment, webhooks, webhookLogs, webhookRetryQueue, addWebhook, deleteWebhook, logWebhookEvent, removeWebhookRetry } = useStore();
  const filteredWebhooks = webhooks.filter(w => w.environment === environment);
  const activeWebhookIds = new Set(filteredWebhooks.map(w => w.id));
  
  const filteredLogs = webhookLogs.filter(log => activeWebhookIds.has(log.endpointId));
  const filteredQueue = webhookRetryQueue.filter(item => activeWebhookIds.has(item.endpointId));
  const dlqLogs = filteredLogs.filter(l => l.isDlq);
  
  // Delivery Health Metrics
  const totalDeliveries = filteredLogs.length;
  const successfulDeliveries = filteredLogs.filter(l => l.status === 200).length;
  const successRate = totalDeliveries > 0 ? (successfulDeliveries / totalDeliveries) * 100 : 100;
  const isHealthy = successRate >= 99;
  
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [endpointUrl, setEndpointUrl] = useState('');
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);
  const toggleEvent = (id: string) => {
    setSelectedEvents(prev => prev.includes(id) ? prev.filter(e => e !== id) : [...prev, id]);
  };
  const [filterCondition, setFilterCondition] = useState('');
  
  // Security States
  const [revealedSecrets, setRevealedSecrets] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isSnippetModalOpen, setIsSnippetModalOpen] = useState(false);
  const [snippetEndpoint, setSnippetEndpoint] = useState<WebhookEndpoint | null>(null);
  
  const [isAdding, setIsAdding] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  
  // App Integrations & Live Ping
  const [integration, setIntegration] = useState('custom');
  const [isPinging, setIsPinging] = useState(false);
  const [pingStatus, setPingStatus] = useState<'idle' | 'success' | 'error'>('idle');

  // View payload state
  const [expandedLog, setExpandedLog] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [isBulkReplaying, setIsBulkReplaying] = useState(false);

  // Auto-expand deep-linked log
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const logId = params.get('logId');
    if (logId) {
      setExpandedLog(logId);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);
  
  // Log Explorer Search & Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'success' | 'error'>('all');

  const displayLogs = filteredLogs.filter(log => {
    const matchesSearch = searchQuery === '' || 
      log.event.toLowerCase().includes(searchQuery.toLowerCase()) || 
      log.payload.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || 
      (statusFilter === 'success' && log.status < 400) || 
      (statusFilter === 'error' && log.status >= 400);

    return matchesSearch && matchesStatus;
  });

  const handleExportLogs = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(displayLogs, null, 2));
    const node = document.createElement('a');
    node.setAttribute("href", dataStr);
    node.setAttribute("download", `webhook_logs_${environment}_${Date.now()}.json`);
    document.body.appendChild(node);
    node.click();
    node.remove();
  };

  // Timer to update 'now' for countdowns
  useEffect(() => {
    const int = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(int);
  }, []);

  const handleQueueRetry = useCallback(async (item: (typeof filteredQueue)[number]) => {
    setRetryingId(item.id);
    await new Promise(r => setTimeout(r, 1000));
    const isSuccess = Math.random() > 0.3; // Better chance on retry
    const status = isSuccess ? 200 : 500;

    if (isSuccess) {
       removeWebhookRetry(item.id);
    }

    logWebhookEvent(
      item.endpointId,
      item.event,
      status,
      item.payload,
      item.attempt + 1
    );

    setRetryingId(null);
  }, [removeWebhookRetry, logWebhookEvent]);

  // Automated Queue Processing
  useEffect(() => {
    const processQueue = async () => {
      for (const item of filteredQueue) {
        if (Date.now() >= item.nextRetryAt && retryingId !== item.id) {
           await handleQueueRetry(item);
        }
      }
    };

    const queueInterval = setInterval(processQueue, 1000);
    return () => clearInterval(queueInterval);
  }, [filteredQueue, retryingId, handleQueueRetry]);

  const handleRetryEvent = async (log: WebhookLog) => {
    setRetryingId(log.id);
    await new Promise(r => setTimeout(r, 1000));
    const isSuccess = Math.random() > 0.3; // Better chance on retry
    const status = isSuccess ? 200 : 500;
    
    logWebhookEvent(
      log.endpointId,
      log.event,
      status,
      log.payload,
      (log.attempt || 1) + 1
    );
    
    setRetryingId(null);
  };

  const handleBulkReplay = async () => {
    setIsBulkReplaying(true);
    const failedLogs = displayLogs.filter(l => l.status >= 400 && !l.isDlq);
    for (const log of failedLogs) {
      const isSuccess = Math.random() > 0.3;
      logWebhookEvent(log.endpointId, log.event, isSuccess ? 200 : 500, log.payload, (log.attempt || 1) + 1);
      await new Promise(r => setTimeout(r, 300));
    }
    setIsBulkReplaying(false);
  };

  const handleAddEndpoint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!endpointUrl) return;

    setIsAdding(true);
    await new Promise(r => setTimeout(r, 800));
    
    addWebhook(endpointUrl, selectedEvents.length > 0 ? selectedEvents : ['identity.completed'], filterCondition.trim() || undefined);
    track('webhook_created', { environment, events: selectedEvents.length || 1, hasFilter: Boolean(filterCondition.trim()) });
    
    setIsAdding(false);
    setIsAddModalOpen(false);
    setEndpointUrl('');
    setSelectedEvents([]);
    setFilterCondition('');
  };

  const handleTriggerTest = async (endpointId: string) => {
    setTestingId(endpointId);
    
    await new Promise(r => setTimeout(r, 1200));
    
    const isSuccess = Math.random() > 0.1;
    const status = isSuccess ? 200 : 500;
    const eventName = Math.random() > 0.5 ? 'identity.completed' : 'risk_signal.generated';
    
    logWebhookEvent(
      endpointId, 
      eventName, 
      status, 
      JSON.stringify({ id: `evt_${Date.now()}`, type: eventName, data: { status: "test_trigger" } })
    );
    
    setTestingId(null);
  };

  const toggleSecret = (id: string) => {
    setRevealedSecrets(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCopySecret = (id: string, secret: string) => {
    navigator.clipboard.writeText(secret);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handlePing = async () => {
    setIsPinging(true);
    setPingStatus('idle');
    await new Promise(r => setTimeout(r, 1000));
    setPingStatus(endpointUrl.length > 10 ? 'success' : 'error');
    setIsPinging(false);
  };

  const pausedWebhooks = filteredWebhooks.filter(w => w.status === 'paused');

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in duration-500">
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
      >
        <div>
          <h1 className="text-2xl font-display font-bold text-fg">Webhooks</h1>
          <p className="text-fg-muted mt-1">Configure {environment === 'sandbox' ? 'test' : 'production'} endpoints to receive real-time data events.</p>
        </div>
        <RoleGuard allowedRoles={['admin', 'developer']}>
          <button 
            onClick={() => setIsAddModalOpen(true)}
            className={cn(
              "flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold transition-all shadow-lg",
              environment === 'sandbox' ? "bg-orange-500/10 border border-orange-500/20 text-orange-500 hover:bg-orange-500/20 hover:border-orange-500/30 shadow-orange-500/5" : "bg-teal/10 border border-teal/20 text-teal hover:bg-teal/20 hover:border-teal/30 shadow-teal/5"
            )}
          >
            <Plus className="w-4 h-4" />
            Add Endpoint
          </button>
        </RoleGuard>
      </motion.div>

      {/* Circuit Breaker Banner */}
      <AnimatePresence>
        {pausedWebhooks.length > 0 && (
          <motion.div 
            initial={{ opacity: 0, y: -10, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: -10, height: 0 }}
            className="bg-semantic-error/10 border border-semantic-error/20 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-[0_0_30px_rgba(221,27,36,0.15)] overflow-hidden"
          >
            <div className="flex items-start sm:items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-semantic-error/20 flex items-center justify-center shrink-0">
                <PauseCircle className="w-5 h-5 text-semantic-error" />
              </div>
              <div>
                <h3 className="font-bold text-fg text-sm">Circuit Breaker Tripped</h3>
                <p className="text-fg-muted text-xs mt-0.5">
                  {pausedWebhooks.length} endpoint(s) failed consecutively 5 times and were automatically paused to prevent server exhaustion.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => pausedWebhooks.forEach(w => useStore.getState().resumeWebhook(w.id))} className="px-4 py-2 bg-semantic-error hover:bg-red-600 text-fg font-bold rounded-lg text-xs transition-colors">
                Resume All
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Dead-Letter Queue (DLQ) Banner */}
      <AnimatePresence>
        {dlqLogs.length > 0 && (
          <motion.div 
            initial={{ opacity: 0, y: -10, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: -10, height: 0 }}
            className="bg-surface border border-semantic-error/40 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-[0_0_40px_rgba(221,27,36,0.1)] overflow-hidden relative"
          >
            <div className="absolute top-0 left-0 w-1 h-full bg-semantic-error" />
            <div className="flex items-start sm:items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-semantic-error/10 flex items-center justify-center shrink-0 border border-semantic-error/20">
                <ShieldAlert className="w-5 h-5 text-semantic-error" />
              </div>
              <div>
                <h3 className="font-bold text-fg text-sm">Dead-Letter Queue (DLQ) Warning</h3>
                <p className="text-fg-muted text-xs mt-0.5">
                  {dlqLogs.length} event(s) have failed repeatedly and exhausted all retries. They are permanently marked as undelivered.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setStatusFilter('error')} className="px-4 py-2 bg-semantic-error/10 hover:bg-semantic-error/20 border border-semantic-error/30 text-semantic-error font-bold rounded-lg text-xs transition-colors">
                View DLQ Logs
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delivery Health Analytics */}
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="grid grid-cols-1 md:grid-cols-3 gap-4"
      >
        <div className="glass-panel p-5 rounded-2xl border border-border flex flex-col justify-between relative overflow-hidden group">
          <div className="absolute -right-6 -top-6 w-24 h-24 bg-teal/5 rounded-full blur-2xl group-hover:bg-teal/10 transition-colors" />
          <div className="flex items-center justify-between mb-4 relative z-10">
            <span className="text-xs font-bold text-fg-muted uppercase tracking-widest flex items-center gap-2">
              <Activity className="w-4 h-4 text-teal" />
              Delivery Health
            </span>
            <div className={cn("px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest", isHealthy ? "bg-semantic-success/10 text-semantic-success" : "bg-semantic-warning/10 text-semantic-warning")}>
              {isHealthy ? 'Healthy' : 'Degraded'}
            </div>
          </div>
          <div className="flex items-end gap-3 relative z-10">
            <span className="text-3xl font-display font-bold text-fg">{successRate.toFixed(1)}%</span>
            <span className="text-sm font-medium text-fg-muted mb-1">Success Rate (24h)</span>
          </div>
        </div>

        <div className="glass-panel p-5 rounded-2xl border border-border flex flex-col justify-between relative overflow-hidden group">
          <div className="absolute -right-6 -top-6 w-24 h-24 bg-indigo-500/5 rounded-full blur-2xl group-hover:bg-indigo-500/10 transition-colors" />
          <div className="flex items-center justify-between mb-4 relative z-10">
            <span className="text-xs font-bold text-fg-muted uppercase tracking-widest flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-indigo-400" />
              Total Deliveries
            </span>
          </div>
          <div className="flex items-end gap-3 relative z-10">
            <span className="text-3xl font-display font-bold text-fg">{totalDeliveries}</span>
            <span className="text-sm font-medium text-fg-muted mb-1">Events Pushed</span>
          </div>
        </div>

        <div className="glass-panel p-5 rounded-2xl border border-border flex flex-col justify-between relative overflow-hidden group">
          <div className={cn("absolute -right-6 -top-6 w-24 h-24 rounded-full blur-2xl transition-colors", filteredQueue.length > 0 ? "bg-semantic-warning/10 group-hover:bg-semantic-warning/20" : "bg-glass group-hover:bg-glass-2")} />
          <div className="flex items-center justify-between mb-4 relative z-10">
            <span className="text-xs font-bold text-fg-muted uppercase tracking-widest flex items-center gap-2">
              <RefreshCw className={cn("w-4 h-4", filteredQueue.length > 0 ? "text-semantic-warning" : "text-fg-muted")} />
              Pending Retries
            </span>
          </div>
          <div className="flex items-end gap-3 relative z-10">
            <span className={cn("text-3xl font-display font-bold", filteredQueue.length > 0 ? "text-semantic-warning" : "text-fg")}>{filteredQueue.length}</span>
            <span className="text-sm font-medium text-fg-muted mb-1">In Queue</span>
          </div>
        </div>
      </motion.div>

      {/* Endpoints Table */}
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="glass-panel rounded-2xl border border-border shadow-xl overflow-hidden"
      >
        <div className="px-6 py-4 border-b border-border bg-surface/5 flex items-center gap-2">
          <Webhook className="w-5 h-5 text-fg-muted" />
          <h3 className="font-bold text-fg">Configured Endpoints</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-fg-muted font-mono text-[10px] uppercase tracking-widest bg-surface/[0.02]">
                <th className="px-6 py-4 font-black">URL & Filtering</th>
                <th className="px-6 py-4 font-black">Subscribed Events</th>
                <th className="px-6 py-4 font-black">Status</th>
                <th className="px-6 py-4 font-black">Signing Secret</th>
                <th className="px-6 py-4 font-black text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              <AnimatePresence>
                {filteredWebhooks.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-6 py-16 text-center text-fg-muted">
                      <div className="flex flex-col items-center justify-center space-y-4">
                        <div className="w-16 h-16 rounded-full bg-glass flex items-center justify-center border border-border">
                          <Webhook className="w-8 h-8 text-fg-subtle" />
                        </div>
                        <div>
                          <h4 className="text-fg font-bold text-lg">No Webhooks Configured</h4>
                          <p className="text-fg-muted text-sm mt-1 max-w-sm mx-auto">Set up endpoints for the {environment} environment to receive real-time HTTP push notifications.</p>
                        </div>
                        <button 
                          onClick={() => setIsAddModalOpen(true)}
                          className="mt-2 bg-glass hover:bg-glass-2 text-fg font-bold px-6 py-2.5 rounded-full text-sm border border-border transition-colors shadow-sm"
                        >
                          Configure Endpoint
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredWebhooks.map((endpoint, idx) => (
                    <motion.tr 
                      key={endpoint.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -10 }}
                      transition={{ delay: idx * 0.05 }}
                      className="hover:bg-surface/[0.02] transition-colors group"
                    >
                      <td className="px-6 py-4">
                        <div className="font-medium text-fg font-mono text-xs max-w-[200px] truncate">{endpoint.url}</div>
                        {endpoint.filter && (
                          <div className="mt-1 flex items-center gap-1.5 text-[10px] font-mono text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-1.5 py-0.5 rounded w-fit">
                            <Filter className="w-3 h-3" />
                            {endpoint.filter}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex gap-2 flex-wrap">
                          {endpoint.events.map(ev => (
                            <span key={ev} className={cn("px-2 py-1 border rounded-md text-[10px] font-mono uppercase tracking-widest font-black", environment === 'sandbox' ? "bg-orange-500/10 border-orange-500/20 text-orange-500" : "bg-teal/10 border-teal/20 text-teal")}>
                              {ev}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div className={cn("px-2 py-1 border rounded text-[10px] font-black uppercase tracking-widest", endpoint.status === 'paused' ? 'bg-semantic-error/10 border-semantic-error/20 text-semantic-error' : 'bg-semantic-success/10 border-semantic-success/20 text-semantic-success')}>
                            {endpoint.status}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div className="font-mono text-xs bg-surface/40 border border-border px-2 py-1 rounded w-36 truncate text-fg">
                            {revealedSecrets.has(endpoint.id) ? endpoint.secret : '••••••••••••••••••••••••'}
                          </div>
                          <button onClick={() => toggleSecret(endpoint.id)} className="text-fg-muted hover:text-fg transition-colors">
                            {revealedSecrets.has(endpoint.id) ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                          <button onClick={() => handleCopySecret(endpoint.id, endpoint.secret)} className="text-fg-muted hover:text-fg transition-colors">
                            {copiedId === endpoint.id ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                          </button>
                          <button 
                            onClick={() => { setSnippetEndpoint(endpoint); setIsSnippetModalOpen(true); }}
                            className="text-indigo-400 hover:text-indigo-300 transition-colors bg-indigo-500/10 p-1 rounded hover:bg-indigo-500/20"
                            title="View Verification Code"
                          >
                            <Code2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <RoleGuard allowedRoles={['admin', 'developer']}>
                          <div className="flex items-center justify-end gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button 
                              onClick={() => handleTriggerTest(endpoint.id)}
                              disabled={testingId === endpoint.id}
                              className="flex items-center gap-1.5 text-xs font-bold text-fg hover:text-fg transition-colors bg-surface/5 hover:bg-surface/10 px-3 py-1.5 rounded-lg border border-border disabled:opacity-50"
                            >
                              {testingId === endpoint.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" fill="currentColor" />}
                              Test
                            </button>
                            <button
                              onClick={() => deleteWebhook(endpoint.id)}
                              className="text-semantic-error/60 hover:text-semantic-error p-2 hover:bg-semantic-error/10 rounded-lg transition-all"
                              title="Delete Webhook"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </RoleGuard>
                      </td>
                    </motion.tr>
                  ))
                )}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      </motion.div>

      {/* Retry Queue */}
      {filteredQueue.length > 0 && (
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-panel rounded-2xl border border-semantic-warning/20 shadow-[0_0_20px_rgba(245,166,35,0.05)] overflow-hidden"
        >
          <div className="px-6 py-4 border-b border-border bg-surface/5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Timer className="w-5 h-5 text-semantic-warning animate-pulse" />
              <h3 className="font-bold text-fg">Retry Queue</h3>
              <span className="ml-2 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest bg-semantic-warning/10 text-semantic-warning">
                {filteredQueue.length} Pending
              </span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead>
                <tr className="border-b border-border text-fg-muted font-mono text-[10px] uppercase tracking-widest bg-surface/[0.02]">
                  <th className="px-6 py-4 font-black">Event Type</th>
                  <th className="px-6 py-4 font-black">Attempt</th>
                  <th className="px-6 py-4 font-black">Next Retry</th>
                  <th className="px-6 py-4 font-black text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                <AnimatePresence>
                  {filteredQueue.map((item) => {
                    const timeRemaining = Math.max(0, Math.ceil((item.nextRetryAt - now) / 1000));
                    return (
                      <motion.tr 
                        key={item.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="bg-surface/20"
                      >
                        <td className="px-6 py-4 font-medium text-fg text-xs">{item.event}</td>
                        <td className="px-6 py-4">
                          <span className="text-[11px] font-bold text-fg-muted">
                            #{item.attempt}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            {timeRemaining > 0 ? (
                              <span className="text-xs font-mono text-semantic-warning">In {timeRemaining}s</span>
                            ) : (
                              <span className="text-xs font-mono text-teal flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" /> Retrying...</span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button 
                            onClick={() => handleQueueRetry(item)}
                            disabled={retryingId === item.id}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-glass hover:bg-glass-2 border border-border rounded-lg text-[11px] font-bold text-fg transition-colors disabled:opacity-50"
                          >
                            {retryingId === item.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                            Force Retry
                          </button>
                        </td>
                      </motion.tr>
                    );
                  })}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        </motion.div>
      )}

      {/* Webhook Logs */}
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="glass-panel rounded-2xl border border-border shadow-xl overflow-hidden"
      >
        <div className="px-6 py-4 border-b border-border bg-surface/5 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-fg-muted" />
            <h3 className="font-bold text-fg">Webhook Trace Explorer</h3>
            <span className="ml-2 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest bg-white/10 text-fg-muted">
              {displayLogs.length} Events
            </span>
          </div>
          
          <div className="flex items-center gap-3 w-full md:w-auto">
            <div className="relative flex-1 md:w-64">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-fg-muted" />
              <input 
                type="text"
                placeholder="Search payloads or events..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-1.5 bg-surface/40 border border-border rounded-lg text-sm text-fg focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all placeholder:text-fg-subtle"
              />
            </div>
            <div className="flex bg-surface/40 border border-border rounded-lg p-0.5">
              <button 
                onClick={() => setStatusFilter('all')}
                className={cn("px-3 py-1 text-xs font-bold rounded-md transition-colors", statusFilter === 'all' ? "bg-white/10 text-fg" : "text-fg-muted hover:text-fg")}
              >
                All
              </button>
              <button 
                onClick={() => setStatusFilter('success')}
                className={cn("px-3 py-1 text-xs font-bold rounded-md transition-colors", statusFilter === 'success' ? "bg-semantic-success/20 text-semantic-success" : "text-fg-muted hover:text-fg")}
              >
                2xx
              </button>
              <button 
                onClick={() => setStatusFilter('error')}
                className={cn("px-3 py-1 text-xs font-bold rounded-md transition-colors", statusFilter === 'error' ? "bg-semantic-error/20 text-semantic-error" : "text-fg-muted hover:text-fg")}
              >
                4xx/5xx
              </button>
            </div>
            <button 
              onClick={handleBulkReplay} 
              disabled={isBulkReplaying || displayLogs.filter(l => l.status >= 400 && !l.isDlq).length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 rounded-lg text-xs font-bold text-indigo-400 transition-colors disabled:opacity-50"
            >
              {isBulkReplaying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FastForward className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">Replay Failed</span>
            </button>
            <button onClick={handleExportLogs} className="flex items-center gap-1.5 px-3 py-1.5 bg-glass hover:bg-glass-2 border border-border rounded-lg text-xs font-bold text-fg transition-colors" title="Export JSON">
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Export</span>
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead>
              <tr className="border-b border-border text-fg-muted font-mono text-[10px] uppercase tracking-widest bg-surface/[0.02]">
                <th className="px-6 py-4 font-black w-10"></th>
                <th className="px-6 py-4 font-black">Status</th>
                <th className="px-6 py-4 font-black">Event Type</th>
                <th className="px-6 py-4 font-black">Performance</th>
                <th className="px-6 py-4 font-black">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              <AnimatePresence>
                {displayLogs.length === 0 ? (
                  <motion.tr initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <td colSpan={4} className="px-6 py-12 text-center text-fg-muted">
                      <Search className="w-8 h-8 mx-auto mb-3 opacity-20" />
                      No logs match your search criteria.
                    </td>
                  </motion.tr>
                ) : (
                  displayLogs.map((log, idx) => {
                    const isExpanded = expandedLog === log.id;
                    return (
                      <React.Fragment key={log.id}>
                        <motion.tr 
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: idx * 0.05 }}
                          className={cn("group cursor-pointer transition-colors", isExpanded ? "bg-surface/5" : "hover:bg-surface/[0.02]")}
                          onClick={() => setExpandedLog(isExpanded ? null : log.id)}
                        >
                          <td className="px-6 py-4 text-fg-muted group-hover:text-fg transition-colors">
                            {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          </td>
                          <td className="px-6 py-4">
                            {log.status === 200 ? (
                              <span className="flex items-center w-fit gap-1.5 text-semantic-success font-bold text-[11px] font-mono px-2.5 py-1 bg-semantic-success/10 border border-semantic-success/20 rounded-md">
                                <CheckCircle2 className="w-3.5 h-3.5" /> 200 OK
                              </span>
                            ) : (
                              <span className="flex items-center w-fit gap-1.5 text-semantic-error font-bold text-[11px] font-mono px-2.5 py-1 bg-semantic-error/10 border border-semantic-error/20 rounded-md">
                                <XCircle className="w-3.5 h-3.5" /> {log.status} ERR
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              {log.event}
                              {log.attempt && log.attempt > 1 && (
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-widest bg-semantic-warning/10 text-semantic-warning border border-semantic-warning/20">
                                  Retry #{log.attempt}
                                </span>
                              )}
                              {log.isDlq && (
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-widest bg-semantic-error/10 text-semantic-error border border-semantic-error/20 flex items-center gap-1">
                                  <ShieldAlert className="w-3 h-3" /> DLQ
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3 font-mono text-xs">
                              <span className={cn("px-1.5 py-0.5 rounded", log.latencyMs && log.latencyMs > 1000 ? "bg-semantic-warning/10 text-semantic-warning font-bold border border-semantic-warning/20" : "text-fg-muted")}>
                                {log.latencyMs ? `${log.latencyMs}ms` : '-'}
                              </span>
                              <span className="text-fg-muted">•</span>
                              <span className="text-fg-muted">{log.payloadSize ? `${(log.payloadSize / 1024).toFixed(2)} KB` : '-'}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-fg-muted text-xs font-mono">{log.time}</td>
                        </motion.tr>
                        
                        {isExpanded && (
                          <tr className="bg-surface/50 shadow-inner">
                            <td colSpan={4} className="p-0 border-t border-border-subtle">
                              <motion.div 
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.2 }}
                                className="overflow-hidden p-6"
                              >
                                <div className="flex items-center justify-between mb-4">
                                  <h4 className="text-xs font-bold text-fg flex items-center gap-2">
                                    <Webhook className="w-4 h-4 text-fg-muted" /> Webhook Debugger
                                    <span className="font-mono text-fg-subtle ml-2 font-normal">ID: {log.id}</span>
                                  </h4>
                                  <div className="flex gap-2">
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const url = new URL(window.location.href);
                                        url.searchParams.set('logId', log.id);
                                        navigator.clipboard.writeText(url.toString());
                                        const btn = e.currentTarget;
                                        const icon = btn.querySelector('.lucide-link');
                                        if (icon) {
                                          icon.classList.remove('lucide-link');
                                          icon.classList.add('lucide-check');
                                          icon.classList.add('text-emerald-500');
                                          setTimeout(() => {
                                            icon.classList.add('lucide-link');
                                            icon.classList.remove('lucide-check');
                                            icon.classList.remove('text-emerald-500');
                                          }, 2000);
                                        }
                                      }}
                                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold text-fg-muted hover:text-fg transition-colors bg-glass hover:bg-glass-2"
                                      title="Copy Deep Link to Trace"
                                    >
                                      <Link className="w-3.5 h-3.5 lucide-link" />
                                      <span className="hidden sm:inline">Copy Link</span>
                                    </button>
                                    <button 
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleRetryEvent(log);
                                      }}
                                      disabled={retryingId === log.id || log.isDlq}
                                      className={cn(
                                        "flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold text-ink transition-all shadow-lg disabled:opacity-50",
                                        environment === 'sandbox' ? "bg-orange-500 hover:bg-orange-600 shadow-orange-500/20" : "bg-teal hover:bg-teal-ice shadow-teal/20"
                                      )}
                                    >
                                      {retryingId === log.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                                      Replay Webhook
                                    </button>
                                  </div>
                                </div>
                                
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  {/* Left Pane: Request */}
                                  <div className="bg-surface rounded-xl border border-border overflow-hidden flex flex-col">
                                    <div className="px-4 py-2 border-b border-border bg-glass flex items-center justify-between">
                                      <span className="text-[10px] font-black text-fg-muted uppercase tracking-widest">Request payload</span>
                                      <span className="text-[10px] font-mono text-fg-muted">POST /webhook</span>
                                    </div>
                                    <div className="p-4 flex-1 overflow-auto">
                                      <CodeBlock 
                                        code={log.payload} 
                                        className="bg-transparent !p-0"
                                      />
                                    </div>
                                  </div>

                                  {/* Right Pane: Response */}
                                  <div className="bg-surface rounded-xl border border-border overflow-hidden flex flex-col">
                                    <div className="px-4 py-2 border-b border-border bg-glass flex items-center justify-between">
                                      <span className="text-[10px] font-black text-fg-muted uppercase tracking-widest">Receiver Response</span>
                                      {log.status === 200 ? (
                                        <span className="text-[10px] font-bold text-semantic-success flex items-center gap-1"><CheckCircle2 className="w-3 h-3"/> 200 OK</span>
                                      ) : (
                                        <span className="text-[10px] font-bold text-semantic-error flex items-center gap-1"><XCircle className="w-3 h-3"/> {log.status} Error</span>
                                      )}
                                    </div>
                                    <div className="p-4 flex-1 overflow-auto">
                                      {log.status === 200 ? (
                                        <div className="text-xs font-mono text-fg-muted">
                                          HTTP/1.1 200 OK<br/>
                                          Content-Type: application/json<br/>
                                          <br/>
                                          &#123;<br/>
                                          &nbsp;&nbsp;&quot;success&quot;: true,<br/>
                                          &nbsp;&nbsp;&quot;message&quot;: &quot;Event received&quot;<br/>
                                          &#125;
                                        </div>
                                      ) : (
                                        <div className="text-xs font-mono text-fg-muted">
                                          HTTP/1.1 {log.status} Internal Server Error<br/>
                                          Content-Type: text/html<br/>
                                          <br/>
                                          &lt;html&gt;<br/>
                                          &nbsp;&nbsp;&lt;body&gt;500 Server Error: Endpoint unreachable&lt;/body&gt;<br/>
                                          &lt;/html&gt;
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                  {/* Visual Diffing Pane */}
                                  {log.attempt && log.attempt > 1 && (
                                    <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                                      {/* Trace Timeline */}
                                      <div className="bg-surface rounded-xl border border-border flex flex-col p-5">
                                        <h4 className="text-[10px] font-black text-fg-muted uppercase tracking-widest flex items-center gap-2 mb-4">
                                          <GitBranch className="w-3.5 h-3.5" /> Event Lifecycle Trace
                                        </h4>
                                        <div className="flex flex-col gap-4 relative">
                                          <div className="absolute left-3.5 top-2 bottom-2 w-0.5 bg-glass z-0" />
                                          {Array.from({length: log.attempt}).map((_, i) => (
                                            <div key={i} className="flex gap-4 relative z-10">
                                              <div className={cn("w-7 h-7 rounded-full flex items-center justify-center border shrink-0 bg-surface", i === log.attempt! - 1 ? (log.status === 200 ? "border-semantic-success text-semantic-success bg-semantic-success/10" : "border-semantic-error text-semantic-error bg-semantic-error/10") : "border-semantic-error/50 text-semantic-error/50 bg-surface")}>
                                                {i === log.attempt! - 1 && log.status === 200 ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                                              </div>
                                              <div>
                                                <div className="text-xs font-bold text-fg">Attempt #{i + 1}</div>
                                                <div className="text-[10px] text-fg-muted font-mono">
                                                  {i === log.attempt! - 1 ? "Latest dispatch" : `Failed with 500 ERR`}
                                                </div>
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      </div>

                                      {/* Mutation Diff */}
                                      <div className="bg-surface rounded-xl border border-border overflow-hidden flex flex-col">
                                        <div className="px-4 py-2 border-b border-border bg-glass flex items-center justify-between">
                                          <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest flex items-center gap-2"><GitCompare className="w-3.5 h-3.5"/> Payload Mutation Diff</span>
                                          <span className="text-[10px] font-mono text-fg-muted">Retry vs Original</span>
                                        </div>
                                        <div className="p-4 overflow-auto bg-[#1e1e1e] text-xs font-mono leading-loose flex-1">
                                          <div className="text-fg-muted mb-2">{`// Mutated payload fields prior to dispatching attempt #${log.attempt}`}</div>
                                          <div className="text-semantic-error/80 bg-semantic-error/10 px-2 rounded w-fit">-   &quot;_retry_attempt&quot;: {log.attempt - 1},</div>
                                          <div className="text-semantic-success bg-semantic-success/10 px-2 rounded w-fit">+   &quot;_retry_attempt&quot;: {log.attempt},</div>
                                          <div className="text-semantic-error/80 bg-semantic-error/10 px-2 rounded w-fit">-   &quot;timestamp&quot;: &quot;{new Date(Date.now() - 60000).toISOString()}&quot;,</div>
                                          <div className="text-semantic-success bg-semantic-success/10 px-2 rounded w-fit">+   &quot;timestamp&quot;: &quot;{new Date().toISOString()}&quot;,</div>
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </motion.div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      </motion.div>

      {/* Add Endpoint Modal */}
      <AnimatePresence>
        {isAddModalOpen && (
          <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-surface/80 backdrop-blur-sm"
              onClick={() => !isAdding && setIsAddModalOpen(false)}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg glass bg-surface border border-border rounded-2xl shadow-2xl overflow-hidden"
            >
              <div className="px-6 py-5 border-b border-border flex items-center justify-between bg-surface/5">
                <h3 className="font-bold text-fg text-lg">Add Webhook Endpoint</h3>
              </div>
              <form onSubmit={handleAddEndpoint} className="p-6">
                
                {/* Integrations Grid */}
                <div className="mb-6">
                  <label className="block text-[10px] font-black text-fg-muted uppercase tracking-widest mb-3">1-Click Integration</label>
                  <div className="grid grid-cols-3 gap-2">
                    {INTEGRATIONS.map(int => (
                      <button
                        key={int.id}
                        type="button"
                        onClick={() => {
                          setIntegration(int.id);
                          setEndpointUrl('');
                          setPingStatus('idle');
                        }}
                        className={cn(
                          "flex flex-col items-center gap-2 p-3 rounded-xl border transition-all",
                          integration === int.id ? "bg-indigo-500/10 border-indigo-500/30 text-indigo-400" : "bg-surface/5 border-border-subtle hover:border-border hover:bg-glass text-fg-muted"
                        )}
                      >
                        {int.icon}
                        <span className="text-xs font-bold">{int.name}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mb-6">
                  <label className="block text-[10px] font-black text-fg-muted uppercase tracking-widest mb-2">Endpoint URL</label>
                  <div className="flex gap-2">
                    <input 
                      type="url"
                      required
                      autoFocus
                      disabled={isAdding}
                      placeholder={INTEGRATIONS.find(i => i.id === integration)?.placeholder || "https://api.yourdomain.com/webhooks"}
                      className="w-full px-4 py-3 rounded-xl border border-border focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all text-sm text-fg bg-surface/5 placeholder:text-fg-subtle disabled:opacity-50 shadow-inner"
                      value={endpointUrl}
                      onChange={(e) => {
                        setEndpointUrl(e.target.value);
                        setPingStatus('idle');
                      }}
                    />
                    <button
                      type="button"
                      onClick={handlePing}
                      disabled={!endpointUrl || isPinging || isAdding}
                      className="shrink-0 px-4 py-3 bg-glass hover:bg-glass-2 border border-border rounded-xl text-sm font-bold text-fg transition-colors flex items-center justify-center gap-2 disabled:opacity-50 min-w-[120px]"
                    >
                      {isPinging ? <Activity className="w-4 h-4 animate-pulse" /> : 
                       pingStatus === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> :
                       pingStatus === 'error' ? <XCircle className="w-4 h-4 text-semantic-error" /> :
                       <Activity className="w-4 h-4" />}
                      Ping
                    </button>
                  </div>
                  {pingStatus === 'success' && <p className="mt-2 text-[11px] text-emerald-500 font-medium">✓ Connection successful</p>}
                  {pingStatus === 'error' && <p className="mt-2 text-[11px] text-semantic-error font-medium">✗ Failed to reach endpoint</p>}
                  {pingStatus === 'idle' && <p className="mt-2 text-[11px] text-fg-muted">Events will be sent to this URL via HTTP POST.</p>}
                </div>
                
                <div className="mb-6">
                  <label className="block text-[10px] font-black text-fg-muted uppercase tracking-widest mb-2 flex items-center gap-1.5">
                    <Filter className="w-3.5 h-3.5" />
                    Advanced Payload Filtering <span className="text-fg-subtle font-normal">(Optional)</span>
                  </label>
                  <input 
                    type="text"
                    disabled={isAdding}
                    placeholder="e.g. $.data.risk_score > 90"
                    className="w-full px-4 py-3 rounded-xl border border-border focus:outline-none focus:border-teal/50 focus:ring-1 focus:ring-teal/50 transition-all text-sm text-fg bg-surface/5 placeholder:text-fg-subtle font-mono shadow-inner disabled:opacity-50"
                    value={filterCondition}
                    onChange={(e) => setFilterCondition(e.target.value)}
                  />
                  <p className="mt-2 text-[11px] text-fg-muted">Only route events that match this JSON Path condition.</p>
                </div>

                <div className="mb-8">
                  <label className="block text-[10px] font-black text-fg-muted uppercase tracking-widest mb-3">Events to send</label>
                  <div className="space-y-2">
                    {AVAILABLE_EVENTS.map(event => (
                      <div 
                        key={event.id}
                        onClick={() => toggleEvent(event.id)}
                        className={cn(
                          "flex items-start gap-3 p-3 rounded-xl border transition-all cursor-pointer group",
                          selectedEvents.includes(event.id) ? (environment === 'sandbox' ? "bg-orange-500/10 border-orange-500/20" : "bg-teal/10 border-teal/20") : "bg-surface/5 border-border-subtle hover:bg-surface/10 hover:border-border"
                        )}
                      >
                        <div className={cn(
                          "w-5 h-5 rounded flex items-center justify-center shrink-0 mt-0.5 border transition-colors",
                          selectedEvents.includes(event.id) ? (environment === 'sandbox' ? "bg-orange-500 border-orange-500 text-fg" : "bg-teal border-teal text-fg") : "bg-surface/10 border-border-strong text-transparent group-hover:border-white/40"
                        )}>
                          <Check className="w-3.5 h-3.5 opacity-100" />
                        </div>
                        <div>
                          <div className={cn("text-sm font-bold", selectedEvents.includes(event.id) ? (environment === 'sandbox' ? "text-orange-500" : "text-teal") : "text-fg")}>
                            {event.label}
                          </div>
                          <div className="text-[11px] text-fg-muted mt-0.5">{event.desc}</div>
                          <div className="text-[10px] font-mono text-fg-subtle mt-1">{event.id}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
                  <button 
                    type="button"
                    onClick={() => setIsAddModalOpen(false)}
                    disabled={isAdding}
                    className="px-5 py-2.5 rounded-xl text-sm font-bold text-fg-muted hover:text-fg hover:bg-surface/5 transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    disabled={isAdding}
                    className={cn(
                      "flex items-center gap-2 px-5 py-2.5 rounded-xl text-ink text-sm font-bold transition-colors shadow-lg disabled:opacity-70 disabled:cursor-wait",
                      environment === 'sandbox' ? "bg-orange-500 hover:bg-orange-600 shadow-orange-500/20" : "bg-teal hover:bg-teal-ice shadow-teal/20"
                    )}
                  >
                    {isAdding ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" /> Saving...
                      </>
                    ) : (
                      'Add Endpoint'
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Signature Verification Code Snippet Modal */}
      <AnimatePresence>
        {isSnippetModalOpen && snippetEndpoint && (
          <div className="fixed inset-0 flex items-center justify-center z-[60] p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-surface/80 backdrop-blur-sm"
              onClick={() => setIsSnippetModalOpen(false)}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-2xl glass bg-surface border border-indigo-500/20 rounded-2xl shadow-[0_0_50px_rgba(99,102,241,0.1)] overflow-hidden"
            >
              <div className="px-6 py-5 border-b border-border flex items-center justify-between bg-surface/40">
                <h3 className="font-bold text-fg flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-indigo-400" />
                  Verify Webhook Signatures
                </h3>
                <button onClick={() => setIsSnippetModalOpen(false)} className="text-fg-muted hover:text-fg">
                  <XCircle className="w-5 h-5" />
                </button>
              </div>
              <div className="p-6">
                <p className="text-sm text-fg-muted mb-4 leading-relaxed">
                  Zinbit signs every webhook payload using HMAC SHA-256 so you can verify it came from us. 
                  Compute the hash of the raw request body using your signing secret, and compare it to the <code className="text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded text-xs">x-zinbit-signature</code> header.
                </p>
                <div className="bg-surface rounded-xl border border-border overflow-hidden">
                  <div className="px-4 py-2 border-b border-border bg-glass flex items-center gap-4">
                    <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Node.js / Express</span>
                  </div>
                  <CodeBlock 
                    code={`const crypto = require('crypto');
const express = require('express');
const app = express();

const SIGNING_SECRET = '${snippetEndpoint.secret}';

app.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  const signature = req.headers['x-zinbit-signature'];
  const expectedSignature = crypto
    .createHmac('sha256', SIGNING_SECRET)
    .update(req.body)
    .digest('hex');

  if (signature !== expectedSignature) {
    return res.status(401).send('Invalid signature');
  }

  const payload = JSON.parse(req.body);
  console.log('Verified Webhook:', payload);
  res.status(200).send('OK');
});`}
                  />
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
