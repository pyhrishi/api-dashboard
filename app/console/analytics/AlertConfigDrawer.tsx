'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, BellRing, Save, Trash2 } from 'lucide-react';
import { useStore, AnomalyAlert } from '@/lib/store';
import { ENDPOINTS } from '@/lib/constants';
import { useState } from 'react';
import { track } from '@/lib/telemetry';
import { cn } from '@/lib/utils';

export function AlertConfigDrawer({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { anomalyAlerts, addAnomalyAlert, removeAnomalyAlert } = useStore();
  const [isCreating, setIsCreating] = useState(false);
  
  const [newRule, setNewRule] = useState<Partial<AnomalyAlert>>({
    endpoint: 'all',
    metric: 'latency',
    condition: '>',
    threshold: 200,
    channels: ['email'],
    isActive: true
  });

  const handleSave = () => {
    if (newRule.endpoint && newRule.metric && newRule.condition && newRule.threshold) {
      addAnomalyAlert(newRule as Omit<AnomalyAlert, 'id'>);
      track('alert_rule_created', { kind: 'anomaly', metric: newRule.metric, endpoint: newRule.endpoint });
      setIsCreating(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[60] flex justify-end">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-overlay backdrop-blur-sm"
          />
          <motion.div 
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="relative w-full max-w-md bg-[#14131E] border-l border-border h-full flex flex-col shadow-2xl"
          >
            <div className="p-6 border-b border-border flex items-center justify-between bg-black/20">
              <div className="flex items-center gap-3">
                <BellRing className="w-5 h-5 text-indigo-500" />
                <h2 className="text-xl font-bold text-fg">Anomaly Alerts</h2>
              </div>
              <button onClick={onClose} className="p-2 hover:bg-glass rounded-lg text-fg-muted hover:text-fg transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              
              {/* Active Rules List */}
              <div className="space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-widest text-fg-muted">Active Rules</h3>
                {anomalyAlerts.map(alert => (
                  <div key={alert.id} className="p-4 bg-glass border border-border rounded-xl relative group">
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center gap-2">
                        <div className={cn("w-2 h-2 rounded-full", alert.isActive ? "bg-emerald-500" : "bg-white/20")} />
                        <span className="font-mono text-sm text-fg font-bold">
                          {alert.metric === 'latency' ? 'Avg Latency' : alert.metric === 'error_rate' ? 'Error Rate' : 'Volume'}
                        </span>
                      </div>
                      <button
                        onClick={() => removeAnomalyAlert(alert.id)}
                        title="Delete rule"
                        className="text-fg-subtle hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="text-fg-muted text-sm">
                      If <strong className="text-fg">{alert.condition} {alert.threshold}{alert.metric === 'error_rate' ? '%' : alert.metric === 'latency' ? 'ms' : ''}</strong> on <span className="font-mono bg-overlay px-1 py-0.5 rounded text-xs">{alert.endpoint === 'all' ? 'All Endpoints' : alert.endpoint}</span>
                    </div>
                    <div className="mt-3 flex gap-2">
                      {alert.channels.map(c => (
                        <span key={c} className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                          {c}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Create New Rule */}
              {!isCreating ? (
                <button 
                  onClick={() => setIsCreating(true)}
                  className="w-full py-4 border border-dashed border-border-strong hover:border-white/40 hover:bg-glass rounded-xl text-fg-muted hover:text-fg transition-colors flex items-center justify-center gap-2 font-bold text-sm"
                >
                  <Plus className="w-4 h-4" /> Create Alert Rule
                </button>
              ) : (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="p-5 border border-indigo-500/30 bg-indigo-500/5 rounded-xl space-y-4"
                >
                  <h3 className="font-bold text-fg mb-4">New Alert Rule</h3>
                  
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-fg-muted">Target Endpoint</label>
                    <select 
                      value={newRule.endpoint}
                      onChange={(e) => setNewRule({...newRule, endpoint: e.target.value})}
                      className="w-full bg-overlay border border-border rounded-lg p-2.5 text-sm text-fg focus:outline-none focus:border-indigo-500"
                    >
                      <option value="all">All Endpoints</option>
                      {ENDPOINTS.slice(1).map(ep => (
                        <option key={ep.id} value={ep.id}>{ep.label}</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex gap-4">
                    <div className="space-y-1.5 flex-1">
                      <label className="text-xs font-bold text-fg-muted">Metric</label>
                      <select 
                        value={newRule.metric}
                        onChange={(e) => setNewRule({...newRule, metric: e.target.value as AnomalyAlert['metric']})}
                        className="w-full bg-overlay border border-border rounded-lg p-2.5 text-sm text-fg focus:outline-none focus:border-indigo-500"
                      >
                        <option value="latency">Avg Latency (ms)</option>
                        <option value="error_rate">Error Rate (%)</option>
                        <option value="volume">Traffic Volume</option>
                      </select>
                    </div>
                    <div className="space-y-1.5 w-24">
                      <label className="text-xs font-bold text-fg-muted">Cond</label>
                      <select 
                        value={newRule.condition}
                        onChange={(e) => setNewRule({...newRule, condition: e.target.value as AnomalyAlert['condition']})}
                        className="w-full bg-overlay border border-border rounded-lg p-2.5 text-sm text-fg focus:outline-none focus:border-indigo-500"
                      >
                        <option value=">">&gt;</option>
                        <option value="<">&lt;</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-fg-muted">Threshold</label>
                    <input 
                      type="number"
                      value={newRule.threshold}
                      onChange={(e) => setNewRule({...newRule, threshold: Number(e.target.value)})}
                      className="w-full bg-overlay border border-border rounded-lg p-2.5 text-sm text-fg focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div className="flex gap-3 pt-4 border-t border-border mt-4">
                    <button 
                      onClick={() => setIsCreating(false)}
                      className="flex-1 py-2 rounded-lg font-bold text-sm text-fg-muted hover:text-fg hover:bg-glass transition-colors"
                    >
                      Cancel
                    </button>
                    <button 
                      onClick={handleSave}
                      className="flex-1 py-2 rounded-lg font-bold text-sm bg-indigo-500 hover:bg-indigo-600 text-fg flex items-center justify-center gap-2 transition-colors"
                    >
                      <Save className="w-4 h-4" /> Save Rule
                    </button>
                  </div>
                </motion.div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
