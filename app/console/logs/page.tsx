'use client';
import React, { useState, useEffect, useMemo } from 'react';
import { track } from '@/lib/telemetry';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, Search, Filter, AlertCircle, Clock, Database, CheckCircle2, ServerCrash, Zap, X, Pause, Play, Download, Copy, RotateCw, ShieldAlert, LifeBuoy, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { API_BASE_URL } from '@/lib/api-config';
import { JsonViewer } from '@/components/JsonViewer';
import { TraceWaterfall } from '@/components/TraceWaterfall';
import { EndpointFilter } from '@/components/EndpointFilter';
import { PrivacySettingsDrawer } from './PrivacySettingsDrawer';
import { useSearchParams, useRouter } from 'next/navigation';
import { useStore, ApiLog, getLogError } from '@/lib/store';
import { sanitizeLogData } from '@/lib/redaction-engine';
import { ENDPOINTS as FULL_ENDPOINTS } from '@/src/data/endpoints';

type Timeframe = '15m' | '1h' | '24h' | '7d';

export default function LogsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { environment, activeKeys, apiLogs, logApiRequest, privacySettings } = useStore();
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  
  // Loading State
  const [isLoading, setIsLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [methodFilter, setMethodFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedEndpoint, setSelectedEndpoint] = useState<string>('all');
  const [timeframe, setTimeframe] = useState<Timeframe>('24h');

  // Initialize from deep links
  useEffect(() => {
    const ep = searchParams?.get('endpoint');
    const st = searchParams?.get('status');
    if (ep) setSelectedEndpoint(ep);
    if (st) setStatusFilter(st);
  }, [searchParams]);

  // Advanced Features State
  const [isPaused, setIsPaused] = useState(false);
  const [frozenLogs, setFrozenLogs] = useState<ApiLog[]>([]);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isReplaying, setIsReplaying] = useState(false);
  const [isPrivacyOpen, setIsPrivacyOpen] = useState(false);

  // Simulate network load
  useEffect(() => {
    setIsLoading(true);
    const t = setTimeout(() => setIsLoading(false), 800);
    return () => clearTimeout(t);
  }, [environment]); // Reload when environment changes

  const toggleRow = (id: string) => {
    setExpandedRow(expandedRow === id ? null : id);
  };

  const getStatusColor = (status: number) => {
    if (status >= 200 && status < 300) return 'text-semantic-success bg-semantic-success/10 border-semantic-success/20';
    if (status >= 400 && status < 500) return 'text-semantic-error bg-semantic-error/10 border-semantic-error/20';
    if (status >= 500) return 'text-semantic-error bg-semantic-error/10 border-semantic-error/20';
    return 'text-fg-muted bg-surface/5 border-border';
  };

  const filteredLogs = useMemo(() => {
    const sourceLogs = isPaused ? frozenLogs : apiLogs;
    return sourceLogs.filter(log => {
      // 1. Environment
      if (log.environment !== environment) return false;

      // 2. Timeframe
      const logDate = new Date(log.timestamp).getTime();
      const now = Date.now();
      const timeDiff = now - logDate;
      const m15 = 15 * 60 * 1000;
      const h1 = 60 * 60 * 1000;
      const h24 = 24 * h1;
      const d7 = 7 * h24;

      if (timeframe === '15m' && timeDiff > m15) return false;
      if (timeframe === '1h' && timeDiff > h1) return false;
      if (timeframe === '24h' && timeDiff > h24) return false;
      if (timeframe === '7d' && timeDiff > d7) return false;

      // 3. Status Filter
      if (statusFilter !== 'all' && !log.status.toString().startsWith(statusFilter)) return false;

      // 4. Method Filter
      if (methodFilter !== 'all' && log.method !== methodFilter) return false;

      // 5. Endpoint Filter
      if (selectedEndpoint !== 'all' && log.path !== selectedEndpoint) return false;

      // 6. Deep Search (Fuzzy match)
      if (search) {
        const query = search.toLowerCase();
        const inId = log.id.toLowerCase().includes(query);
        const inPath = log.path.toLowerCase().includes(query);
        const inStatus = log.status.toString().includes(query);
        const inReq = JSON.stringify(log.request).toLowerCase().includes(query);
        const inRes = JSON.stringify(log.response).toLowerCase().includes(query);
        if (!inId && !inPath && !inStatus && !inReq && !inRes) return false;
      }

      return true;
    });
  }, [apiLogs, frozenLogs, isPaused, environment, search, methodFilter, statusFilter, selectedEndpoint, timeframe]);

  const activeFiltersCount = (methodFilter !== 'all' ? 1 : 0) + (statusFilter !== 'all' ? 1 : 0) + (selectedEndpoint !== 'all' ? 1 : 0) + (timeframe !== '24h' ? 1 : 0);
  
  // Total logs for current environment (used to determine global empty state vs search empty state)
  const sourceLogs = isPaused ? frozenLogs : apiLogs;
  const totalEnvLogs = sourceLogs.filter(l => l.environment === environment).length;

  const togglePause = () => {
    if (!isPaused) setFrozenLogs(apiLogs);
    setIsPaused(!isPaused);
  };

  const handleExport = (format: 'csv' | 'json') => {
    track('export_downloaded', { source: 'logs', format });
    let content = '';
    const type = format === 'csv' ? 'text/csv' : 'application/json';
    const ext = format === 'csv' ? 'csv' : 'json';

    // Zero-Trust Export: Sanitize all logs before generating the download blob
    const sanitizedLogs = filteredLogs.map(log => ({
      ...log,
      request: sanitizeLogData(log.request, privacySettings),
      response: sanitizeLogData(log.response, privacySettings),
    }));

    if (format === 'json') {
      content = JSON.stringify(sanitizedLogs, null, 2);
    } else {
      const headers = ['ID', 'Timestamp', 'Method', 'Path', 'Status', 'Duration (ms)', 'IP', 'Request (Sanitized)', 'Response (Sanitized)'];
      const rows = sanitizedLogs.map(l => [
        l.id, l.timestamp, l.method, l.path, l.status, l.duration, l.ip,
        `"${JSON.stringify(l.request).replace(/"/g, '""')}"`,
        `"${JSON.stringify(l.response).replace(/"/g, '""')}"`
      ]);
      content = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    }

    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `zinbit-logs-${environment}-${Date.now()}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
    setIsExportOpen(false);
  };

  const generateCurl = (log: ApiLog) => {
    let curl = `curl -X ${log.method} ${API_BASE_URL}${log.path} \\\n`;
    if (log.request.headers) {
      Object.entries(log.request.headers).forEach(([k, v]) => {
        curl += `  -H '${k}: ${v}' \\\n`;
      });
    }
    if (log.request.body && Object.keys(log.request.body).length > 0) {
      curl += `  -d '${JSON.stringify(log.request.body)}'`;
    }
    return curl.replace(/\\\n$/, ''); // remove trailing slash
  };

  const handleCopyCurl = (log: ApiLog) => {
    navigator.clipboard.writeText(generateCurl(log));
    setCopiedId(`curl_${log.id}`);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleReplay = async (log: ApiLog) => {
    setIsReplaying(true);
    // Simulate network delay for replay
    await new Promise(r => setTimeout(r, 600));
    
    logApiRequest({
      id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      timestamp: new Date().toISOString(),
      environment: log.environment,
      method: log.method,
      path: log.path,
      status: log.status, // We replay and just get the same status in this mock
      duration: Math.floor(Math.random() * 100) + 20, // New duration
      ip: log.ip,
      request: log.request,
      response: log.response
    });
    
    setIsReplaying(false);
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <div>
          <h1 className="text-3xl font-extrabold text-fg tracking-tight mb-2 flex items-center gap-3">
            Developer Logs
            <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-widest border", environment === 'live' ? "bg-[#5D5FEF]/10 text-[#5D5FEF] border-[#5D5FEF]/20" : "bg-[#00F0FF]/10 text-[#00F0FF] border-[#00F0FF]/20")}>
              {environment}
            </span>
          </h1>
          <p className="text-fg-muted text-sm max-w-xl">Deep inspect a real-time history of API requests, payloads, and response times to trace integration health.</p>
        </div>
        
        <div className="w-full md:w-auto flex flex-col sm:flex-row items-center gap-4">
          <button
            onClick={() => setIsPrivacyOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-emerald-500/20 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 transition-colors shadow-inner text-sm font-bold whitespace-nowrap w-full sm:w-auto justify-center"
          >
            <ShieldAlert className="w-4 h-4" />
            Privacy Settings
          </button>
          
          {/* Unified Endpoint Filter */}
          <EndpointFilter 
            selected={selectedEndpoint} 
            onChange={setSelectedEndpoint} 
          />
        </div>
      </div>

      {/* Advanced Controls */}
      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between relative z-20">
        <div className="relative w-full sm:max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-muted" />
          <input 
            type="text" 
            placeholder="Search by ID, path, status, or raw JSON payload..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-8 py-2 rounded-xl border border-border bg-surface/5 text-sm text-fg focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all placeholder:text-fg-subtle shadow-inner"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-fg-muted hover:text-fg transition-colors">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-3 w-full sm:w-auto">
          {/* Pause Toggle */}
          <button
            onClick={togglePause}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-colors shadow-inner text-sm font-bold",
              isPaused ? "bg-amber-500/10 border-amber-500/20 text-amber-500 hover:bg-amber-500/20" : "bg-glass border-border text-fg-muted hover:bg-glass-2 hover:text-fg"
            )}
          >
            {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
            {isPaused ? 'Paused' : 'Live'}
          </button>

          {/* Timeframe Select */}
          <div className="bg-[#121212] p-1 rounded-xl border border-border flex">
            {(['15m', '1h', '24h', '7d'] as Timeframe[]).map((tf) => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                  timeframe === tf ? "bg-white/10 text-fg" : "text-fg-muted hover:text-fg hover:bg-glass"
                )}
              >
                {tf}
              </button>
            ))}
          </div>

          {/* Export Dropdown */}
          <div className="relative">
            <button 
              onClick={() => setIsExportOpen(!isExportOpen)}
              className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border bg-glass hover:bg-glass-2 text-fg transition-colors h-full text-sm font-bold"
            >
              <Download className="w-4 h-4" />
              Export
            </button>
            <AnimatePresence>
              {isExportOpen && (
                <motion.div 
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  className="absolute top-full right-0 mt-3 p-2 w-32 bg-[#14131E] border border-border rounded-xl shadow-2xl z-50 flex flex-col gap-1"
                >
                  <button onClick={() => handleExport('csv')} className="text-left px-3 py-2 text-sm text-fg hover:text-fg hover:bg-glass rounded-lg transition-colors font-medium">CSV</button>
                  <button onClick={() => handleExport('json')} className="text-left px-3 py-2 text-sm text-fg hover:text-fg hover:bg-glass rounded-lg transition-colors font-medium">JSON</button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="relative">
            <button 
              onClick={() => setIsFilterOpen(!isFilterOpen)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-xl border transition-colors shadow-[0_0_15px_rgba(255,255,255,0.02)] whitespace-nowrap text-sm font-bold h-full",
                activeFiltersCount > 0 
                  ? "bg-indigo-500/10 border-indigo-500/20 text-indigo-400 hover:bg-indigo-500/20" 
                  : "bg-glass border-border text-fg hover:bg-glass-2"
              )}
            >
              <Filter className="w-4 h-4" />
              Filter {activeFiltersCount > 0 && <span className="bg-indigo-500 text-fg px-1.5 py-0.5 rounded-md text-[10px] ml-1">{activeFiltersCount}</span>}
            </button>
            
            <AnimatePresence>
              {isFilterOpen && (
                <motion.div 
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  className="absolute top-full right-0 mt-3 p-5 w-72 bg-[#14131E] border border-border rounded-2xl shadow-2xl z-50 flex flex-col gap-6"
                >
                  {/* Method Filter */}
                  <div>
                    <label className="block text-[10px] font-bold text-fg-muted uppercase tracking-widest mb-2">Method</label>
                    <div className="flex flex-wrap gap-2">
                      {['all', 'GET', 'POST'].map(m => (
                        <button 
                          key={m} 
                          onClick={() => setMethodFilter(m)} 
                          className={cn("px-3 py-1.5 text-xs font-bold rounded-lg border transition-colors", methodFilter === m ? "bg-indigo-500/20 text-indigo-400 border-indigo-500/30" : "bg-glass text-fg-muted border-transparent hover:bg-glass-2")}
                        >
                          {m === 'all' ? 'All' : m}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Status Filter */}
                  <div>
                    <label className="block text-[10px] font-bold text-fg-muted uppercase tracking-widest mb-2">Status Code</label>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { id: 'all', label: 'All' },
                        { id: '2', label: '2xx Success' },
                        { id: '4', label: '4xx Error' },
                        { id: '5', label: '5xx Error' }
                      ].map(s => (
                        <button 
                          key={s.id} 
                          onClick={() => setStatusFilter(s.id)} 
                          className={cn("px-3 py-1.5 text-xs font-bold rounded-lg border transition-colors", statusFilter === s.id ? "bg-indigo-500/20 text-indigo-400 border-indigo-500/30" : "bg-glass text-fg-muted border-transparent hover:bg-glass-2")}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Clear All */}
                  {activeFiltersCount > 0 && (
                    <div className="pt-4 border-t border-border">
                      <button 
                        onClick={() => { setMethodFilter('all'); setStatusFilter('all'); setSelectedEndpoint('all'); setTimeframe('24h'); setSearch(''); }}
                        className="w-full py-2.5 bg-glass hover:bg-glass-2 rounded-xl text-xs font-bold text-fg transition-colors border border-border-subtle"
                      >
                        Clear All Filters
                      </button>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Logs Table / States */}
      <div className="glass-inner rounded-2xl shadow-2xl border border-border overflow-hidden min-h-[400px] flex flex-col">
        {isLoading ? (
          // Skeleton Loader
          <div className="p-6 flex-1 flex flex-col gap-4">
            <div className="h-6 w-1/4 bg-glass rounded-md animate-pulse mb-2" />
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center gap-6 py-3 border-b border-border-subtle">
                <div className="h-4 w-12 bg-glass rounded-md animate-pulse" />
                <div className="h-4 w-16 bg-glass rounded-md animate-pulse" />
                <div className="h-4 w-48 bg-glass rounded-md animate-pulse" />
                <div className="h-4 w-32 bg-glass rounded-md animate-pulse ml-auto" />
              </div>
            ))}
          </div>
        ) : totalEnvLogs === 0 ? (
          // Complete Zero State (No logs ever)
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
            <div className="w-20 h-20 bg-indigo-500/10 rounded-full flex items-center justify-center mb-6 border border-indigo-500/20 relative">
              <Database className="w-8 h-8 text-indigo-500" />
              <div className="absolute top-0 right-0 w-3 h-3 bg-emerald-500 rounded-full border-2 border-[#121212]" />
            </div>
            <h3 className="text-xl font-extrabold text-fg mb-2">Awaiting Data</h3>
            <p className="text-fg-muted max-w-sm mb-6 text-sm">
              Your {environment} environment hasn&apos;t received any requests yet. Make a request via the Explorer or your integration to see logs flow in real-time.
            </p>
            <a href="/console/explorer" className="px-6 py-2.5 bg-white text-black font-bold rounded-xl hover:bg-white/90 transition-colors flex items-center gap-2 text-sm">
              <Zap className="w-4 h-4" /> Send Test Request
            </a>
          </div>
        ) : filteredLogs.length === 0 ? (
          // No Search Results State
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
            <div className="w-16 h-16 bg-glass rounded-full flex items-center justify-center mb-6">
              <Search className="w-6 h-6 text-fg-muted" />
            </div>
            <h3 className="text-lg font-bold text-fg mb-2">No Matching Logs</h3>
            <p className="text-fg-muted max-w-sm text-sm">
              We couldn&apos;t find any logs matching your current filters and search query. Try adjusting your timeframe or clearing filters.
            </p>
            {activeFiltersCount > 0 && (
              <button 
                onClick={() => { setMethodFilter('all'); setStatusFilter('all'); setSelectedEndpoint('all'); setTimeframe('24h'); setSearch(''); }}
                className="mt-6 px-4 py-2 border border-border rounded-lg text-sm font-bold text-fg hover:text-fg hover:bg-glass transition-colors"
              >
                Clear Filters
              </button>
            )}
          </div>
        ) : (
          // Logs Table
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-surface/40 border-b border-border backdrop-blur-md sticky top-0 z-10">
                <tr>
                  <th className="px-6 py-4 font-black text-fg-muted uppercase tracking-widest text-[10px] w-10"></th>
                  <th className="px-6 py-4 font-black text-fg-muted uppercase tracking-widest text-[10px]">Status</th>
                  <th className="px-6 py-4 font-black text-fg-muted uppercase tracking-widest text-[10px]">Endpoint</th>
                  <th className="px-6 py-4 font-black text-fg-muted uppercase tracking-widest text-[10px]">Date & Time</th>
                  <th className="px-6 py-4 font-black text-fg-muted uppercase tracking-widest text-[10px]">Duration</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 relative">
                <AnimatePresence initial={false}>
                  {filteredLogs.map((log) => {
                    const isExpanded = expandedRow === log.id;
                    const isError = log.status >= 400;
                    const logError = getLogError(log);

                    return (
                      <React.Fragment key={log.id}>
                        {/* Main Row */}
                        <motion.tr 
                          layout="position"
                          onClick={() => toggleRow(log.id)}
                          className={cn(
                            "group cursor-pointer transition-colors relative",
                            isExpanded ? "bg-[#1A1A24]" : "hover:bg-white/[0.02]"
                          )}
                        >
                          <td className="px-6 py-4 text-fg-muted group-hover:text-fg transition-colors">
                            <motion.div
                              initial={false}
                              animate={{ rotate: isExpanded ? 90 : 0 }}
                            >
                              <ChevronRight className="w-4 h-4" />
                            </motion.div>
                          </td>
                          <td className="px-6 py-4">
                            <span className={cn("px-2.5 py-1 rounded-md text-[11px] font-black font-mono shadow-[0_0_15px_rgba(255,255,255,0.02)] border flex items-center w-fit gap-1.5", getStatusColor(log.status))}>
                              {log.status >= 500 ? <ServerCrash className="w-3 h-3" /> : log.status >= 400 ? <AlertCircle className="w-3 h-3" /> : <CheckCircle2 className="w-3 h-3" />}
                              {log.status}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <span className={cn(
                                "text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-widest",
                                log.method === 'GET' ? "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20" : "bg-purple-500/10 text-purple-400 border border-purple-500/20"
                              )}>
                                {log.method}
                              </span>
                              <span className="font-mono text-fg font-medium truncate max-w-[200px] sm:max-w-xs">{log.path}</span>
                              {FULL_ENDPOINTS.find(e => e.path === log.path)?.isDeprecated && (
                                <div className="group/dep relative flex items-center">
                                  <AlertTriangle className="w-3.5 h-3.5 text-semantic-warning" />
                                  <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 bg-[#1A1A24] border border-semantic-warning/30 text-fg text-[10px] font-bold px-2 py-1 rounded opacity-0 group-hover/dep:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50 shadow-[0_0_15px_rgba(245,166,35,0.1)]">
                                    Deprecated Endpoint
                                  </div>
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-fg-muted font-medium" suppressHydrationWarning>
                            {new Date(log.timestamp).toLocaleString(undefined, { 
                              month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' 
                            })}
                          </td>
                          <td className="px-6 py-4 text-fg-muted font-mono text-xs">
                            <div className="flex items-center gap-1.5">
                              <Clock className="w-3.5 h-3.5 opacity-50" />
                              {log.duration}ms
                            </div>
                          </td>
                        </motion.tr>

                        {/* Expanded Details */}
                        <AnimatePresence>
                          {isExpanded && (
                            <motion.tr 
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              className="bg-[#14131E] shadow-inner"
                            >
                              <td colSpan={5} className="p-0 border-t border-indigo-500/10 relative overflow-hidden">
                                {/* Decorative Left Border */}
                                <div className={cn("absolute left-0 top-0 bottom-0 w-1", isError ? "bg-semantic-error" : "bg-indigo-500")} />
                                
                                <motion.div 
                                  initial={{ height: 0 }}
                                  animate={{ height: 'auto' }}
                                  exit={{ height: 0 }}
                                  transition={{ duration: 0.3, ease: 'easeInOut' }}
                                  className="overflow-hidden"
                                >
                                  <div className="p-8 grid grid-cols-1 lg:grid-cols-2 gap-8 ml-2">
                                    
                                    {/* Request Details */}
                                    <div>
                                      <div className="flex items-center justify-between mb-4">
                                        <h4 className="text-xs font-black text-fg-muted uppercase tracking-widest flex items-center gap-2">
                                          Request Payload
                                          {activeKeys.some(k => k.status === 'revoked' && log.request.headers?.['Authorization']?.includes(k.key.substring(0, 12))) && (
                                            <span className="bg-semantic-error/10 text-semantic-error border border-semantic-error/20 px-1.5 py-0.5 rounded text-[9px] uppercase tracking-widest font-black ml-2 shadow-inner">
                                              [REVOKED KEY]
                                            </span>
                                          )}
                                        </h4>
                                        <button 
                                          onClick={() => handleCopyCurl(log)}
                                          className="text-xs font-bold text-fg-muted hover:text-fg flex items-center gap-1.5 transition-colors bg-glass px-2 py-1 rounded-lg border border-border-subtle"
                                        >
                                          {copiedId === `curl_${log.id}` ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                                          cURL
                                        </button>
                                      </div>
                                      <JsonViewer data={log.request} logId={log.id} />
                                    </div>

                                    {/* Response Details */}
                                    <div>
                                      <h4 className="text-xs font-black text-fg-muted uppercase tracking-widest mb-4">Response Payload</h4>
                                      {isError ? (
                                        <div className="space-y-4">
                                          {/* Error Taxonomy Callout */}
                                          {logError && (
                                            <div className="bg-semantic-error/10 border border-semantic-error/20 rounded-xl p-4 flex items-start gap-3 shadow-inner">
                                              <AlertCircle className="w-5 h-5 text-semantic-error flex-shrink-0 mt-0.5" />
                                              <div>
                                                <div className="flex items-center gap-2 mb-1">
                                                  <span className="text-semantic-error font-bold text-sm">API Error:</span>
                                                  <code className="text-xs font-bold text-semantic-error bg-semantic-error/20 px-1.5 py-0.5 rounded">{logError.type ?? logError.code}</code>
                                                </div>
                                                <p className="text-semantic-error/80 text-sm mb-3">{logError.message}</p>
                                                <a href="/docs#errors" target="_blank" className="text-xs font-bold text-semantic-error hover:text-fg transition-colors underline underline-offset-2 flex items-center gap-1 w-fit">
                                                  View Troubleshooting Guide <ChevronRight className="w-3 h-3" />
                                                </a>
                                              </div>
                                            </div>
                                          )}
                                          {/* Raw Payload */}
                                          <JsonViewer data={log.response} className="border-semantic-error/20" logId={log.id} />
                                        </div>
                                      ) : (
                                        <JsonViewer data={log.response} className="border-semantic-success/20" logId={log.id} />
                                      )}
                                    </div>

                                    {/* Meta Bar */}
                                    <div className="lg:col-span-2 pt-4 flex items-center justify-between text-xs text-fg-muted font-mono">
                                      <div className="flex gap-4 items-center">
                                        <button 
                                          onClick={() => handleReplay(log)}
                                          disabled={isReplaying}
                                          className={cn(
                                            "px-3 py-1.5 rounded-lg border flex items-center gap-2 font-bold font-sans transition-all",
                                            isReplaying ? "bg-glass text-fg-subtle border-border-subtle" : "bg-indigo-500 hover:bg-indigo-600 text-fg border-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.3)]"
                                          )}
                                        >
                                          <RotateCw className={cn("w-3.5 h-3.5", isReplaying && "animate-spin")} />
                                          {isReplaying ? 'Replaying...' : 'Replay Request'}
                                        </button>
                                        <button 
                                          onClick={() => router.push(`/console/support?logId=${log.id}&action=new`)}
                                          className="px-3 py-1.5 rounded-lg border flex items-center gap-2 font-bold font-sans transition-all bg-glass hover:bg-glass-2 text-fg border-border-subtle"
                                        >
                                          <LifeBuoy className="w-3.5 h-3.5" />
                                          Report Issue
                                        </button>
                                        <span className="bg-glass px-2 py-1 rounded border border-border-subtle">Req ID: {log.id}</span>
                                        <span className="bg-glass px-2 py-1 rounded border border-border-subtle">IP: {log.ip}</span>
                                      </div>
                                      <span className="bg-indigo-500/10 text-indigo-400 px-2 py-1 rounded border border-indigo-500/20">
                                        Processed in {log.duration}ms
                                      </span>
                                    </div>
                                    
                                    {/* Distributed Trace Waterfall */}
                                    <div className="lg:col-span-2 bg-black/20 rounded-xl p-1 border border-border-subtle">
                                      <TraceWaterfall 
                                        duration={log.duration} 
                                        status={log.status} 
                                        endpoint={log.path} 
                                      />
                                    </div>
                                  </div>
                                </motion.div>
                              </td>
                            </motion.tr>
                          )}
                        </AnimatePresence>
                      </React.Fragment>
                    );
                  })}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        )}
      </div>

      <PrivacySettingsDrawer 
        isOpen={isPrivacyOpen}
        onClose={() => setIsPrivacyOpen(false)}
      />
    </div>
  );
}
