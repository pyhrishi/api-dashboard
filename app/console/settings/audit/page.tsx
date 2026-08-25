'use client';

import { useStore } from '@/lib/store';
import { Search, Activity, User, FileSignature, ArrowRight } from 'lucide-react';
import { useState, useMemo } from 'react';

export default function AuditLogsPage() {
  const { auditLogs } = useStore();
  const [searchQuery, setSearchQuery] = useState('');

  const filteredLogs = useMemo(() => {
    return auditLogs.filter(log => {
      const search = searchQuery.toLowerCase();
      return (
        log.actorEmail.toLowerCase().includes(search) ||
        log.action.toLowerCase().includes(search) ||
        log.resource.toLowerCase().includes(search)
      );
    });
  }, [auditLogs, searchQuery]);

  return (
    <div className="space-y-8 animate-fade-in pb-12">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-white/10 pb-6">
        <div>
          <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
            <FileSignature className="w-5 h-5 text-teal" />
            Audit Logs
          </h2>
          <p className="text-white/50 text-sm max-w-2xl">
            A comprehensive, immutable ledger of all team activity and security events across your workspace.
          </p>
        </div>
        
        <div className="relative w-full md:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
          <input 
            type="text" 
            placeholder="Search logs..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#09090b] border border-white/10 rounded-xl py-2 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-teal/50 transition-all shadow-inner"
          />
        </div>
      </div>

      <div className="glass-inner rounded-2xl border border-white/10 shadow-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-[#09090b]/80 border-b border-white/10 text-white/50 font-bold uppercase tracking-wider text-[10px]">
              <tr>
                <th className="px-6 py-4">Actor</th>
                <th className="px-6 py-4">Event</th>
                <th className="px-6 py-4">Resource</th>
                <th className="px-6 py-4">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-white/80">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-white/40">
                    <Activity className="w-8 h-8 mx-auto mb-3 opacity-20" />
                    No audit logs found.
                  </td>
                </tr>
              ) : filteredLogs.map((log) => (
                <tr key={log.id} className="hover:bg-white/5 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center font-bold text-[10px] text-white/70 flex-shrink-0">
                        {log.actorEmail.charAt(0).toUpperCase()}
                      </div>
                      <span className="font-semibold text-white/90 text-xs">{log.actorEmail}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center bg-white/5 border border-white/10 rounded px-2 py-1 text-xs font-mono">
                      {log.action}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-white/60 text-xs">
                    {log.resource}
                  </td>
                  <td className="px-6 py-4 font-mono text-xs text-white/40">
                    {new Date(log.timestamp).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
