'use client';

import React, { useState, useEffect } from 'react';
import { useStore } from '@/lib/store';
import { motion, AnimatePresence } from 'framer-motion';
import { Webhook, Plus, CheckCircle2, XCircle, Clock, RefreshCw, Loader2, Play, Trash2, Check, AlertCircle, ChevronDown, ChevronRight, Timer } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CodeBlock } from '@/components/CodeBlock';
import RoleGuard from '@/components/RoleGuard';

const AVAILABLE_EVENTS = [
  { id: 'identity.completed', label: 'Identity Verification Completed', desc: 'Fired when a person search finishes.' },
  { id: 'risk_signal.generated', label: 'Risk Signal Generated', desc: 'Fired when a high-risk factor is detected.' },
  { id: 'company.enriched', label: 'Company Enriched', desc: 'Fired when domain-to-CIN mapping succeeds.' },
  { id: 'payment.failed', label: 'Payment Failed', desc: 'Fired when a billing attempt fails.' }
];

export default function WebhooksPage() {
  const { webhooks, webhookLogs, webhookRetryQueue, addWebhook, deleteWebhook, logWebhookEvent, removeWebhookRetry, updateWebhookRetry } = useStore();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [endpointUrl, setEndpointUrl] = useState('');
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);
  
  // Loading states
  const [isAdding, setIsAdding] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);

  // View payload state
  const [expandedLog, setExpandedLog] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  // Timer to update 'now' for countdowns
  useEffect(() => {
    const int = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(int);
  }, []);

  // Automated Queue Processing
  useEffect(() => {
    const processQueue = async () => {
      for (const item of webhookRetryQueue) {
        if (Date.now() >= item.nextRetryAt && retryingId !== item.id) {
           await handleQueueRetry(item);
        }
      }
    };
    
    const queueInterval = setInterval(processQueue, 1000);
    return () => clearInterval(queueInterval);
  }, [webhookRetryQueue, retryingId]);

  const handleQueueRetry = async (item: any) => {
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
  };

  const handleRetryEvent = async (log: any) => {
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

  const handleAddEndpoint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!endpointUrl) return;

    setIsAdding(true);
    await new Promise(r => setTimeout(r, 800));
    
    addWebhook(endpointUrl, selectedEvents.length > 0 ? selectedEvents : ['identity.completed']);
    
    setIsAdding(false);
    setIsAddModalOpen(false);
    setEndpointUrl('');
    setSelectedEvents([]);
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

  const toggleEvent = (eventId: string) => {
    setSelectedEvents(prev => 
      prev.includes(eventId) ? prev.filter(id => id !== eventId) : [...prev, eventId]
    );
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in duration-500">
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
      >
        <div>
          <h1 className="text-2xl font-display font-bold text-white">Webhooks</h1>
          <p className="text-white/60 mt-1">Receive real-time HTTPS pushes for background events.</p>
        </div>
        <RoleGuard allowedRoles={['admin', 'developer']}>
          <button 
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center gap-2 bg-teal/10 border border-teal/20 text-teal px-5 py-2.5 rounded-xl font-bold hover:bg-teal/20 hover:border-teal/30 transition-all shadow-lg shadow-teal/5"
          >
            <Plus className="w-4 h-4" />
            Add Endpoint
          </button>
        </RoleGuard>
      </motion.div>

      {/* Endpoints Table */}
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="glass-panel rounded-2xl border border-white/10 shadow-xl overflow-hidden"
      >
        <div className="px-6 py-4 border-b border-white/10 bg-[#09090b]/5 flex items-center gap-2">
          <Webhook className="w-5 h-5 text-white/40" />
          <h3 className="font-bold text-white">Configured Endpoints</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-white/40 font-mono text-[10px] uppercase tracking-widest bg-[#09090b]/[0.02]">
                <th className="px-6 py-4 font-black">URL</th>
                <th className="px-6 py-4 font-black">Subscribed Events</th>
                <th className="px-6 py-4 font-black text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              <AnimatePresence>
                {webhooks.length === 0 ? (
                  <motion.tr initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <td colSpan={3} className="px-6 py-16 text-center text-white/40">
                      <div className="flex flex-col items-center justify-center space-y-4">
                        <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center border border-white/10">
                          <Webhook className="w-8 h-8 text-white/20" />
                        </div>
                        <div>
                          <h4 className="text-white font-bold text-lg">No Webhooks Configured</h4>
                          <p className="text-white/40 text-sm mt-1 max-w-sm mx-auto">Set up endpoints to receive real-time HTTP push notifications for background events.</p>
                        </div>
                        <button 
                          onClick={() => setIsAddModalOpen(true)}
                          className="mt-2 bg-white/5 hover:bg-white/10 text-white font-bold px-6 py-2.5 rounded-full text-sm border border-white/10 transition-colors shadow-sm"
                        >
                          Configure Endpoint
                        </button>
                      </div>
                    </td>
                  </motion.tr>
                ) : (
                  webhooks.map((endpoint, idx) => (
                    <motion.tr 
                      key={endpoint.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -10 }}
                      transition={{ delay: idx * 0.05 }}
                      className="hover:bg-[#09090b]/[0.02] transition-colors group"
                    >
                      <td className="px-6 py-4 font-medium text-white font-mono text-xs max-w-[200px] truncate">{endpoint.url}</td>
                      <td className="px-6 py-4">
                        <div className="flex gap-2 flex-wrap">
                          {endpoint.events.map(ev => (
                            <span key={ev} className="px-2 py-1 bg-teal/10 border border-teal/20 rounded-md text-[10px] font-mono text-teal uppercase tracking-widest font-black">
                              {ev}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <RoleGuard allowedRoles={['admin', 'developer']}>
                          <div className="flex items-center justify-end gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button 
                              onClick={() => handleTriggerTest(endpoint.id)}
                              disabled={testingId === endpoint.id}
                              className="flex items-center gap-1.5 text-xs font-bold text-white/80 hover:text-white transition-colors bg-[#09090b]/5 hover:bg-[#09090b]/10 px-3 py-1.5 rounded-lg border border-white/10 disabled:opacity-50"
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
      {webhookRetryQueue.length > 0 && (
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-panel rounded-2xl border border-semantic-warning/20 shadow-[0_0_20px_rgba(245,166,35,0.05)] overflow-hidden"
        >
          <div className="px-6 py-4 border-b border-white/10 bg-[#09090b]/5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Timer className="w-5 h-5 text-semantic-warning animate-pulse" />
              <h3 className="font-bold text-white">Retry Queue</h3>
              <span className="ml-2 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest bg-semantic-warning/10 text-semantic-warning">
                {webhookRetryQueue.length} Pending
              </span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead>
                <tr className="border-b border-white/10 text-white/40 font-mono text-[10px] uppercase tracking-widest bg-[#09090b]/[0.02]">
                  <th className="px-6 py-4 font-black">Event Type</th>
                  <th className="px-6 py-4 font-black">Attempt</th>
                  <th className="px-6 py-4 font-black">Next Retry</th>
                  <th className="px-6 py-4 font-black text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                <AnimatePresence>
                  {webhookRetryQueue.map((item) => {
                    const timeRemaining = Math.max(0, Math.ceil((item.nextRetryAt - now) / 1000));
                    return (
                      <motion.tr 
                        key={item.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="bg-[#09090b]/20"
                      >
                        <td className="px-6 py-4 font-medium text-white text-xs">{item.event}</td>
                        <td className="px-6 py-4">
                          <span className="text-[11px] font-bold text-white/60">
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
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-[11px] font-bold text-white transition-colors disabled:opacity-50"
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
        className="glass-panel rounded-2xl border border-white/10 shadow-xl overflow-hidden"
      >
        <div className="px-6 py-4 border-b border-white/10 bg-[#09090b]/5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-white/40" />
            <h3 className="font-bold text-white">Recent Deliveries</h3>
          </div>
          <button className="flex items-center gap-2 text-xs font-bold text-white/50 hover:text-white transition-colors">
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead>
              <tr className="border-b border-white/10 text-white/40 font-mono text-[10px] uppercase tracking-widest bg-[#09090b]/[0.02]">
                <th className="px-6 py-4 font-black w-10"></th>
                <th className="px-6 py-4 font-black">Status</th>
                <th className="px-6 py-4 font-black">Event Type</th>
                <th className="px-6 py-4 font-black">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              <AnimatePresence>
                {webhookLogs.length === 0 ? (
                  <motion.tr initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <td colSpan={4} className="px-6 py-12 text-center text-white/40">
                      <Clock className="w-8 h-8 mx-auto mb-3 opacity-20" />
                      No delivery logs found. Send a test event to see logs here.
                    </td>
                  </motion.tr>
                ) : (
                  webhookLogs.map((log, idx) => {
                    const isExpanded = expandedLog === log.id;
                    return (
                      <React.Fragment key={log.id}>
                        <motion.tr 
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: idx * 0.05 }}
                          className={cn("group cursor-pointer transition-colors", isExpanded ? "bg-[#09090b]/5" : "hover:bg-[#09090b]/[0.02]")}
                          onClick={() => setExpandedLog(isExpanded ? null : log.id)}
                        >
                          <td className="px-6 py-4 text-white/40 group-hover:text-white transition-colors">
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
                            </div>
                          </td>
                          <td className="px-6 py-4 text-white/50 text-xs font-mono">{log.time}</td>
                        </motion.tr>
                        
                        {isExpanded && (
                          <tr className="bg-ink/50 shadow-inner">
                            <td colSpan={4} className="p-0 border-t border-white/5">
                              <motion.div 
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.2 }}
                                className="overflow-hidden p-6"
                              >
                                <div className="flex items-center justify-between mb-3">
                                  <h4 className="text-[10px] font-black text-white/40 uppercase tracking-widest">Payload</h4>
                                  {log.status >= 400 && (
                                    <button 
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleRetryEvent(log);
                                      }}
                                      disabled={retryingId === log.id}
                                      className="flex items-center gap-1.5 px-3 py-1.5 bg-[#09090b]/5 hover:bg-[#09090b]/10 border border-white/10 rounded-lg text-[11px] font-bold text-white transition-colors disabled:opacity-50"
                                    >
                                      {retryingId === log.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                                      Retry Delivery
                                    </button>
                                  )}
                                </div>
                                <CodeBlock 
                                  code={log.payload} 
                                  className="bg-[#0f111a]"
                                />
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
              className="absolute inset-0 bg-ink/80 backdrop-blur-sm"
              onClick={() => !isAdding && setIsAddModalOpen(false)}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg glass bg-ink border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
            >
              <div className="px-6 py-5 border-b border-white/10 flex items-center justify-between bg-[#09090b]/5">
                <h3 className="font-bold text-white text-lg">Add Webhook Endpoint</h3>
              </div>
              <form onSubmit={handleAddEndpoint} className="p-6">
                <div className="mb-6">
                  <label className="block text-[10px] font-black text-white/40 uppercase tracking-widest mb-2">Endpoint URL</label>
                  <input 
                    type="url"
                    required
                    autoFocus
                    disabled={isAdding}
                    placeholder="https://api.yourdomain.com/webhooks"
                    className="w-full px-4 py-3 rounded-xl border border-white/10 focus:outline-none focus:border-teal/50 focus:ring-1 focus:ring-teal/50 transition-all text-sm text-white bg-[#09090b]/5 placeholder:text-white/30 disabled:opacity-50 shadow-inner"
                    value={endpointUrl}
                    onChange={(e) => setEndpointUrl(e.target.value)}
                  />
                  <p className="mt-2 text-[11px] text-white/40">Events will be sent to this URL via HTTP POST.</p>
                </div>
                <div className="mb-8">
                  <label className="block text-[10px] font-black text-white/40 uppercase tracking-widest mb-3">Events to send</label>
                  <div className="space-y-2">
                    {AVAILABLE_EVENTS.map(event => (
                      <div 
                        key={event.id}
                        onClick={() => toggleEvent(event.id)}
                        className={cn(
                          "flex items-start gap-3 p-3 rounded-xl border transition-all cursor-pointer group",
                          selectedEvents.includes(event.id) ? "bg-teal/10 border-teal/20" : "bg-[#09090b]/5 border-white/5 hover:bg-[#09090b]/10 hover:border-white/10"
                        )}
                      >
                        <div className={cn(
                          "w-5 h-5 rounded flex items-center justify-center shrink-0 mt-0.5 border transition-colors",
                          selectedEvents.includes(event.id) ? "bg-teal border-teal text-white" : "bg-[#09090b]/10 border-white/20 text-transparent group-hover:border-white/40"
                        )}>
                          <Check className="w-3.5 h-3.5 opacity-100" />
                        </div>
                        <div>
                          <div className={cn("text-sm font-bold", selectedEvents.includes(event.id) ? "text-teal" : "text-white/80")}>
                            {event.label}
                          </div>
                          <div className="text-[11px] text-white/50 mt-0.5">{event.desc}</div>
                          <div className="text-[10px] font-mono text-white/30 mt-1">{event.id}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10">
                  <button 
                    type="button"
                    onClick={() => setIsAddModalOpen(false)}
                    disabled={isAdding}
                    className="px-5 py-2.5 rounded-xl text-sm font-bold text-white/60 hover:text-white hover:bg-[#09090b]/5 transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    disabled={isAdding}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-teal text-ink text-sm font-bold hover:bg-teal-ice transition-colors shadow-lg shadow-teal/20 disabled:opacity-70 disabled:cursor-wait"
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
    </div>
  );
}
