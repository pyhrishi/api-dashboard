'use client';

import { useStore } from '@/lib/store';
import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Terminal, Pause, Play, ChevronRight, ChevronDown, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export function LiveFirehose() {
  const { apiLogs, isFirehosePaused, toggleFirehose, environment } = useStore();
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  // Filter logs for the current environment and limit to latest 50 for performance
  const envLogs = useMemo(() => {
    return apiLogs.filter(l => l.environment === environment).slice(0, 50);
  }, [apiLogs, environment]);

  const toggleRow = (id: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(id)) newExpanded.delete(id);
    else newExpanded.add(id);
    setExpandedRows(newExpanded);
  };

  const getStatusColor = (status: number) => {
    if (status >= 500) return 'text-semantic-error';
    if (status >= 400) return 'text-semantic-warning';
    return 'text-semantic-success';
  };

  const getStatusIcon = (status: number) => {
    if (status >= 500) return <XCircle className="w-4 h-4 text-semantic-error" />;
    if (status >= 400) return <AlertTriangle className="w-4 h-4 text-semantic-warning" />;
    return <CheckCircle2 className="w-4 h-4 text-semantic-success" />;
  };

  const getMethodColor = (method: string) => {
    if (method === 'GET') return environment === 'live' ? 'text-[#5D5FEF]' : 'text-[#00F0FF]';
    return 'text-[#5865F2]';
  };

  return (
    <div className="glass-inner rounded-2xl border border-border-subtle overflow-hidden flex flex-col h-[500px]">
      {/* Firehose Header */}
      <div className="p-4 border-b border-border-subtle flex items-center justify-between bg-black/20">
        <div className="flex items-center gap-3">
          <Terminal className="w-5 h-5 text-fg-muted" />
          <h3 className="font-bold text-fg flex items-center gap-2">
            Live Traffic Firehose
            {!isFirehosePaused && (
              <span className="flex h-2 w-2 relative ml-1">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
            )}
          </h3>
        </div>
        <button
          onClick={toggleFirehose}
          className={cn(
            "flex items-center gap-2 px-3 py-1.5 text-xs font-bold rounded-lg border transition-colors",
            isFirehosePaused ? "bg-amber-500/10 text-amber-500 border-amber-500/20" : "bg-glass text-fg-muted border-border hover:bg-glass-2"
          )}
        >
          {isFirehosePaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
          {isFirehosePaused ? 'Resume Stream' : 'Pause Stream'}
        </button>
      </div>

      {/* Terminal View */}
      <div className="flex-1 overflow-y-auto bg-[#0a0a0c] p-2 font-mono text-xs">
        <AnimatePresence initial={false}>
          {envLogs.length === 0 ? (
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }}
              className="text-fg-muted text-center mt-20"
            >
              Waiting for incoming requests...
            </motion.div>
          ) : (
            envLogs.map((log) => {
              const isExpanded = expandedRows.has(log.id);
              return (
                <motion.div
                  key={log.id}
                  layout="position"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.2 }}
                  className="mb-1"
                >
                  <div 
                    onClick={() => toggleRow(log.id)}
                    className="flex items-center gap-4 px-4 py-2 hover:bg-glass rounded-lg cursor-pointer transition-colors group"
                  >
                    <div className="text-fg-subtle group-hover:text-fg-muted transition-colors">
                      {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                    </div>
                    
                    <div className="text-fg-muted min-w-[80px]">
                      {new Date(log.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute:'2-digit', second:'2-digit', fractionalSecondDigits: 3 })}
                    </div>

                    <div className={cn("font-bold min-w-[50px]", getMethodColor(log.method))}>
                      {log.method}
                    </div>

                    <div className="text-fg flex-1 truncate">
                      {log.path}
                    </div>

                    <div className="flex items-center gap-1.5 min-w-[60px]">
                      {getStatusIcon(log.status)}
                      <span className={cn("font-bold", getStatusColor(log.status))}>{log.status}</span>
                    </div>

                    <div className="text-fg-muted text-right min-w-[60px]">
                      {log.duration}ms
                    </div>
                  </div>

                  {/* Expanded JSON View */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="mx-8 my-2 p-4 bg-overlay rounded-xl border border-border-subtle grid grid-cols-2 gap-6">
                          <div>
                            <div className="text-fg-muted uppercase tracking-widest text-[10px] font-bold mb-2">Request Payload</div>
                            <pre className="text-fg overflow-x-auto p-2 bg-glass rounded-lg border border-border-subtle">
                              {JSON.stringify(log.request, null, 2)}
                            </pre>
                          </div>
                          <div>
                            <div className="text-fg-muted uppercase tracking-widest text-[10px] font-bold mb-2">Response Data</div>
                            <pre className="text-fg overflow-x-auto p-2 bg-glass rounded-lg border border-border-subtle">
                              {JSON.stringify(log.response, null, 2)}
                            </pre>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
