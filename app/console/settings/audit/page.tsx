'use client';

import { useStore, type AuditLog } from '@/lib/store';
import { Search, Activity, FileSignature, Key, Users, CreditCard, Shield, Webhook, Download, ChevronDown, Monitor, CheckCircle2, XCircle, Undo2, BellRing, AlertTriangle } from 'lucide-react';
import React, { useState, useMemo } from 'react';
import { track } from '@/lib/telemetry';
import Link from 'next/link';
import RoleGuard from '@/components/RoleGuard';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/Toast';

export default function AuditLogsPage() {
  const { auditLogs, revertAuditAction, createAuditAlertRule } = useStore();
  const toast = useToast();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [eventFilter, setEventFilter] = useState<string>('all');
  const [envFilter, setEnvFilter] = useState<'all' | 'live' | 'sandbox'>('all');
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const filteredLogs = useMemo(() => {
    // Basic Filtering
    const logs = auditLogs.filter(log => {
      const search = searchQuery.toLowerCase();
      const matchesSearch = 
        log.actorEmail.toLowerCase().includes(search) ||
        log.action.toLowerCase().includes(search) ||
        log.resource.toLowerCase().includes(search);
        
      const matchesEvent = eventFilter === 'all' || log.action.startsWith(eventFilter);
      const matchesEnv = envFilter === 'all' || log.environment === envFilter;
      
      return matchesSearch && matchesEvent && matchesEnv;
    });

    // Velocity Heuristic Engine: Flag Rapid Destructive Actions
    const flaggedIds = new Set<string>();
    const destructiveActions = ['key.revoked', 'key.auto_revoked', 'team.removed', 'webhook.deleted'];
    
    const destructiveLogs = logs.filter(l => destructiveActions.includes(l.action)).sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    
    // Group by actor to check velocity (3+ destructive actions in 5 mins)
    const actorWindows: Record<string, typeof logs> = {};
    destructiveLogs.forEach(log => {
      if (!actorWindows[log.actorEmail]) actorWindows[log.actorEmail] = [];
      const window = actorWindows[log.actorEmail];
      window.push(log);
      
      // Keep only last 5 minutes
      const logTime = new Date(log.timestamp).getTime();
      while (window.length > 0 && logTime - new Date(window[0].timestamp).getTime() > 5 * 60 * 1000) {
        window.shift();
      }
      
      if (window.length >= 3) {
        window.forEach(wLog => flaggedIds.add(wLog.id));
      }
    });

    return logs.map(log => ({
      ...log,
      isFlagged: flaggedIds.has(log.id)
    }));
  }, [auditLogs, searchQuery, eventFilter, envFilter]);

  const handleExport = async () => {
    track('export_downloaded', { source: 'audit_logs', format: 'csv' });
    setIsExporting(true);
    await new Promise(r => setTimeout(r, 1500)); // Simulate generation
    setIsExporting(false);
    toast.success('Export Complete', 'Your audit log CSV has been downloaded successfully.');
  };

  const handleRevert = (logId: string) => {
    revertAuditAction(logId);
    toast.success('Action Reverted', 'The system state has been successfully restored.');
    setExpandedLogId(null);
  };

  const handleCreateAlert = (action: string) => {
    createAuditAlertRule(action, ['toast']);
    toast.success('Alert Rule Created', `You will be notified when '${action}' occurs again.`);
    setExpandedLogId(null);
  };

  const renderResource = (log: AuditLog) => {
    const text = <span className="truncate max-w-[200px]" title={log.resource}>{log.resource}</span>;
    let href = '';
    if (log.action.startsWith('key.')) href = '/console/keys';
    else if (log.action.startsWith('webhook.')) href = '/console/webhooks';
    else if (log.action.startsWith('team.')) href = '/console/settings/team';
    else if (log.action.startsWith('billing.') || log.action.startsWith('quota.')) href = '/console/billing';

    if (href) {
      return (
        <Link href={href} className="text-teal hover:text-teal-400 hover:underline transition-colors font-semibold">
          {text}
        </Link>
      );
    }
    return <span className="text-fg-muted">{text}</span>;
  };

  const getEventIcon = (action: string) => {
    if (action.startsWith('key.')) return <Key className="w-4 h-4 text-teal" />;
    if (action.startsWith('team.')) return <Users className="w-4 h-4 text-purple-400" />;
    if (action.startsWith('billing.') || action.startsWith('quota.')) return <CreditCard className="w-4 h-4 text-semantic-warning" />;
    if (action.startsWith('security.')) return <Shield className="w-4 h-4 text-semantic-error" />;
    if (action.startsWith('webhook.')) return <Webhook className="w-4 h-4 text-blue-400" />;
    return <Activity className="w-4 h-4 text-fg-muted" />;
  };

  return (
    <RoleGuard allowedRoles={['admin']}>
      <div className="space-y-8 animate-fade-in pb-12">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-border pb-6">
          <div>
            <h2 className="text-xl font-bold text-fg mb-2 flex items-center gap-2">
              <FileSignature className="w-5 h-5 text-teal" />
              Audit Logs
            </h2>
            <p className="text-fg-muted text-sm max-w-2xl">
              A comprehensive, immutable ledger of all team activity and security events across your workspace.
            </p>
          </div>
          
          <button 
            onClick={handleExport}
            disabled={isExporting}
            className="flex items-center gap-2 bg-glass hover:bg-glass-2 border border-border px-4 py-2 rounded-lg text-sm font-bold text-fg transition-all self-start md:self-auto disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isExporting ? <Activity className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            {isExporting ? 'Exporting...' : 'Export CSV'}
          </button>
        </div>
        
        {/* Filters */}
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-muted" />
            <input 
              type="text" 
              placeholder="Search logs by actor, event, or resource..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-surface border border-border rounded-xl py-2 pl-10 pr-4 text-sm text-fg focus:outline-none focus:border-teal/50 transition-all shadow-inner"
            />
          </div>
          <div className="flex gap-2">
            <select 
              value={eventFilter}
              onChange={(e) => setEventFilter(e.target.value)}
              className="bg-surface border border-border rounded-xl py-2 px-4 text-sm text-fg focus:outline-none focus:border-teal/50 transition-all appearance-none cursor-pointer"
            >
              <option value="all">All Events</option>
              <option value="key.">API Keys</option>
              <option value="team.">Team & Access</option>
              <option value="billing.">Billing & Quota</option>
              <option value="security.">Security</option>
              <option value="webhook.">Webhooks</option>
            </select>
            <div className="flex bg-surface p-1 rounded-xl border border-border">
              {(['all', 'live', 'sandbox'] as const).map(env => (
                <button
                  key={env}
                  onClick={() => setEnvFilter(env)}
                  className={`px-4 py-1.5 rounded-lg text-xs font-bold capitalize transition-all ${
                    envFilter === env ? 'bg-surface/10 text-fg' : 'text-fg-muted hover:text-fg-muted'
                  }`}
                >
                  {env}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Logs List */}
        <div className="glass-inner rounded-2xl border border-border shadow-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap border-collapse">
              <thead className="bg-surface/80 border-b border-border text-fg-muted font-bold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="px-6 py-4 w-12"></th>
                  <th className="px-6 py-4">Actor</th>
                  <th className="px-6 py-4">Event</th>
                  <th className="px-6 py-4">Resource</th>
                  <th className="px-6 py-4">Environment</th>
                  <th className="px-6 py-4 text-right">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-fg">
                {filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-16 text-center text-fg-muted">
                      <FileSignature className="w-8 h-8 mx-auto mb-4 opacity-20" />
                      <p className="font-medium text-fg-muted">No audit logs found</p>
                      <p className="text-xs mt-1">Try adjusting your search filters.</p>
                    </td>
                  </tr>
                ) : filteredLogs.map((log) => (
                  <React.Fragment key={log.id}>
                    <tr 
                      onClick={() => setExpandedLogId(expandedLogId === log.id ? null : log.id)}
                      className={cn(
                        "transition-colors cursor-pointer group",
                        expandedLogId === log.id ? "bg-surface/10" : "hover:bg-surface/5",
                        log.isFlagged && "bg-semantic-error/5 border-l-2 border-l-semantic-error"
                      )}
                    >
                      <td className="px-6 py-4">
                        <ChevronDown className={cn(
                          "w-4 h-4 text-fg-muted transition-transform duration-200",
                          expandedLogId === log.id && "rotate-180 text-fg",
                          log.isFlagged && "text-semantic-error"
                        )} />
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          {log.isFlagged && <div className="w-2 h-2 rounded-full bg-semantic-error animate-pulse flex-shrink-0" title="Suspicious Activity" />}
                          <div className={cn("w-6 h-6 rounded-full flex items-center justify-center font-bold text-[10px] flex-shrink-0", log.isFlagged ? "bg-semantic-error/20 text-semantic-error" : "bg-surface/10 text-fg-muted")}>
                            {log.actorEmail.charAt(0).toUpperCase()}
                          </div>
                          <span className={cn("font-semibold text-xs", log.isFlagged ? "text-semantic-error" : "text-fg")}>{log.actorEmail}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div className={cn("p-1.5 rounded border", log.isFlagged ? "bg-semantic-error/10 border-semantic-error/20" : "bg-glass border-border-subtle")}>
                            {getEventIcon(log.action)}
                          </div>
                          <span className={cn("font-mono text-xs", log.isFlagged && "text-semantic-error font-bold")}>{log.action}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-xs">
                        {renderResource(log)}
                      </td>
                      <td className="px-6 py-4">
                        <span className={cn(
                          "inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider",
                          log.environment === 'live' ? "bg-teal/10 text-teal border border-teal/20" : "bg-orange-500/10 text-orange-500 border border-orange-500/20"
                        )}>
                          {log.environment}
                        </span>
                      </td>
                      <td className="px-6 py-4 font-mono text-xs text-fg-muted text-right">
                        {new Date(log.timestamp).toLocaleString()}
                      </td>
                    </tr>
                    <AnimatePresence>
                      {expandedLogId === log.id && (
                        <motion.tr
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className={cn("bg-surface/40 border-b border-border-subtle overflow-hidden", log.isFlagged && "bg-semantic-error/5")}
                        >
                          <td colSpan={6} className="p-0">
                            <div className={cn("px-8 py-6 border-l-2 ml-8 my-4 bg-glass rounded-r-xl", log.isFlagged ? "border-semantic-error" : "border-teal")}>
                              {log.isFlagged && (
                                <div className="mb-6 bg-semantic-error/10 border border-semantic-error/20 p-3 rounded-lg flex items-start gap-3 text-semantic-error text-xs">
                                  <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                                  <div>
                                    <strong className="block mb-1">Velocity Heuristic Triggered</strong>
                                    This action is part of a cluster of 3 or more destructive events within a 5-minute window by this actor. Please verify intent.
                                  </div>
                                </div>
                              )}
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="space-y-4">
                                  <h4 className="text-[10px] font-black uppercase tracking-widest text-fg-muted">Request Details</h4>
                                  <div className="space-y-3 text-xs">
                                    <div className="flex items-center gap-4">
                                      <Monitor className="w-4 h-4 text-fg-muted" />
                                      <div className="flex-1">
                                        <div className="text-fg-muted mb-1 text-[10px] uppercase">IP Address</div>
                                        <div className="font-mono text-fg">{log.metadata?.ipAddress || 'Unknown'}</div>
                                      </div>
                                    </div>
                                    <div className="flex items-start gap-4">
                                      <Activity className="w-4 h-4 text-fg-muted mt-0.5" />
                                      <div className="flex-1">
                                        <div className="text-fg-muted mb-1 text-[10px] uppercase">User Agent</div>
                                        <div className="font-mono text-fg-muted leading-relaxed whitespace-pre-wrap">{log.metadata?.userAgent || 'Unknown'}</div>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-4">
                                      {log.metadata?.status === 'failure' ? (
                                        <XCircle className="w-4 h-4 text-semantic-error" />
                                      ) : (
                                        <CheckCircle2 className="w-4 h-4 text-teal" />
                                      )}
                                      <div className="flex-1">
                                        <div className="text-fg-muted mb-1 text-[10px] uppercase">Status</div>
                                        <div className={cn("font-bold capitalize", log.metadata?.status === 'failure' ? 'text-semantic-error' : 'text-teal')}>
                                          {log.metadata?.status || 'Success'}
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                                
                                {log.metadata?.changes && (
                                  <div className="space-y-4">
                                    <h4 className="text-[10px] font-black uppercase tracking-widest text-fg-muted">State Mutations</h4>
                                    <div className="bg-surface border border-border rounded-lg p-4 font-mono text-xs overflow-x-auto shadow-inner">
                                      <pre className="text-fg whitespace-pre-wrap">
                                        {JSON.stringify(log.metadata.changes, null, 2)}
                                      </pre>
                                    </div>
                                  </div>
                                )}
                              </div>
                              
                              <div className="mt-8 pt-6 border-t border-border flex items-center justify-end gap-3">
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleCreateAlert(log.action); }}
                                  className="flex items-center gap-2 text-xs font-bold px-3 py-2 rounded-lg bg-glass hover:bg-glass-2 text-fg-muted hover:text-fg transition-colors"
                                >
                                  <BellRing className="w-3.5 h-3.5" />
                                  Monitor Action
                                </button>
                                {log.metadata?.changes?.before != null && (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleRevert(log.id); }}
                                    className="flex items-center gap-2 text-xs font-bold px-4 py-2 rounded-lg bg-teal/10 hover:bg-teal/20 text-teal border border-teal/20 hover:border-teal/30 transition-all shadow-sm"
                                  >
                                    <Undo2 className="w-3.5 h-3.5" />
                                    Revert Action
                                  </button>
                                )}
                              </div>
                            </div>
                          </td>
                        </motion.tr>
                      )}
                    </AnimatePresence>
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </RoleGuard>
  );
}
