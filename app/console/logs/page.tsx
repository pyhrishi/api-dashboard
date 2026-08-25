'use client';
import React from 'react';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronRight, Search, Filter, AlertCircle, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CodeBlock } from '@/components/CodeBlock';

// Mock Log Data
const MOCK_LOGS = [
  {
    id: 'req_1a2b3c4d5e6f7g8h',
    timestamp: '2026-08-24T14:02:11Z',
    method: 'GET',
    path: '/v1/people-search',
    status: 200,
    duration: 142,
    ip: '192.168.1.1',
    request: {
      headers: {
        'Authorization': 'Bearer sk_test_...',
        'User-Agent': 'node-fetch/1.0'
      },
      query: {
        email: 'demo@example.com'
      }
    },
    response: {
      data: {
        id: 'per_abc123',
        name: 'Demo User',
        email: 'demo@example.com',
        company: 'Acme Corp'
      }
    }
  },
  {
    id: 'req_8h7g6f5e4d3c2b1a',
    timestamp: '2026-08-24T13:58:44Z',
    method: 'GET',
    path: '/v1/people-search',
    status: 400,
    duration: 34,
    ip: '192.168.1.1',
    request: {
      headers: {
        'Authorization': 'Bearer sk_test_...',
        'User-Agent': 'node-fetch/1.0'
      },
      query: {}
    },
    response: {
      error: {
        type: 'invalid_request_error',
        message: 'Missing required parameter: email or linkedin_url',
        param: 'email'
      }
    }
  },
  {
    id: 'req_x1y2z3a4b5c6d7e8',
    timestamp: '2026-08-24T13:45:10Z',
    method: 'POST',
    path: '/v1/domain-to-cin',
    status: 401,
    duration: 12,
    ip: '10.0.0.55',
    request: {
      headers: {
        'Authorization': 'Bearer sk_test_invalid_key',
        'Content-Type': 'application/json'
      },
      body: {
        domain: 'acmecorp.com'
      }
    },
    response: {
      error: {
        type: 'authentication_error',
        message: 'Invalid API key provided: sk_test_invalid_key'
      }
    }
  },
  {
    id: 'req_q9w8e7r6t5y4u3i2',
    timestamp: '2026-08-24T12:30:05Z',
    method: 'GET',
    path: '/v1/linkedin-to-profile',
    status: 200,
    duration: 310,
    ip: '192.168.1.1',
    request: {
      headers: {
        'Authorization': 'Bearer sk_test_...',
      },
      query: {
        url: 'https://linkedin.com/in/demo'
      }
    },
    response: {
      data: {
        id: 'li_888',
        name: 'Demo User',
        headline: 'Software Engineer'
      }
    }
  },
  {
    id: 'req_m1n2b3v4c5x6z7l8',
    timestamp: '2026-08-24T11:15:22Z',
    method: 'GET',
    path: '/v1/people-search',
    status: 429,
    duration: 5,
    ip: '192.168.1.1',
    request: {
      headers: {
        'Authorization': 'Bearer sk_test_...',
      },
      query: {
        email: 'spam@example.com'
      }
    },
    response: {
      error: {
        type: 'rate_limit_error',
        message: 'Rate limit exceeded. Please try again in 60 seconds.'
      }
    }
  }
];

const SENSITIVE_KEYS = new Set([
  'authorization', 
  'email', 
  'password', 
  'token', 
  'secret', 
  'api_key', 
  'phone',
  'cookie',
  'x-api-key'
]);

const redactPayload = (key: string, value: any) => {
  if (SENSITIVE_KEYS.has(key.toLowerCase())) {
    return '[REDACTED FOR PRIVACY]';
  }
  return value;
};

export default function LogsPage() {
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  
  // Filter States
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [methodFilter, setMethodFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [pathFilter, setPathFilter] = useState<string>('all');

  const toggleRow = (id: string) => {
    if (expandedRow === id) {
      setExpandedRow(null);
    } else {
      setExpandedRow(id);
    }
  };

  const getStatusColor = (status: number) => {
    if (status >= 200 && status < 300) return 'text-semantic-success bg-semantic-success/10 border-semantic-success/20';
    if (status >= 400 && status < 500) return 'text-semantic-error bg-semantic-error/10 border-semantic-error/20';
    if (status >= 500) return 'text-semantic-error bg-semantic-error/10 border-semantic-error/20';
    return 'text-white/60 bg-white/5 border-white/10';
  };

  const filteredLogs = MOCK_LOGS.filter(log => {
    const matchesSearch = log.path.includes(search) || log.id.includes(search) || log.status.toString().includes(search);
    const matchesMethod = methodFilter === 'all' || log.method === methodFilter;
    const matchesStatus = statusFilter === 'all' || log.status.toString().startsWith(statusFilter);
    const matchesPath = pathFilter === 'all' || log.path === pathFilter;
    
    return matchesSearch && matchesMethod && matchesStatus && matchesPath;
  });

  const activeFiltersCount = (methodFilter !== 'all' ? 1 : 0) + (statusFilter !== 'all' ? 1 : 0) + (pathFilter !== 'all' ? 1 : 0);

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500">
      
      {/* Header */}
      <div>
        <h1 className="text-3xl font-extrabold text-white tracking-tight mb-2">Developer Logs</h1>
        <p className="text-white/60">View a real-time history of API requests made with your API keys to troubleshoot integrations.</p>
      </div>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between relative z-20">
        <div className="relative w-full sm:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
          <input 
            type="text" 
            placeholder="Search by endpoint, status, or request ID..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-xl border border-white/10 bg-white/5 text-sm text-white focus:outline-none focus:border-teal/50 focus:ring-1 focus:ring-teal/50 transition-all placeholder:text-white/30 shadow-inner"
          />
        </div>
        <div className="relative">
          <button 
            onClick={() => setIsFilterOpen(!isFilterOpen)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-xl border transition-colors shadow-sm whitespace-nowrap text-sm font-bold",
              activeFiltersCount > 0 
                ? "bg-teal/10 border-teal/20 text-teal hover:bg-teal/20" 
                : "bg-white/5 border-white/10 text-white hover:bg-white/10"
            )}
          >
            <Filter className="w-4 h-4" />
            Filter {activeFiltersCount > 0 && <span className="bg-teal text-ink px-1.5 py-0.5 rounded-md text-[10px] ml-1">{activeFiltersCount}</span>}
          </button>
          
          <AnimatePresence>
            {isFilterOpen && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="absolute top-full right-0 mt-3 p-5 w-80 glass bg-ink border border-white/10 rounded-2xl shadow-2xl z-50 flex flex-col gap-6"
              >
                {/* Method Filter */}
                <div>
                  <label className="block text-[10px] font-bold text-white/40 uppercase tracking-widest mb-2">Method</label>
                  <div className="flex flex-wrap gap-2">
                    {['all', 'GET', 'POST'].map(m => (
                      <button 
                        key={m} 
                        onClick={() => setMethodFilter(m)} 
                        className={cn("px-3 py-1.5 text-xs font-bold rounded-lg border transition-colors", methodFilter === m ? "bg-teal/20 text-teal border-teal/30" : "bg-white/5 text-white/60 border-transparent hover:bg-white/10")}
                      >
                        {m === 'all' ? 'All' : m}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Status Filter */}
                <div>
                  <label className="block text-[10px] font-bold text-white/40 uppercase tracking-widest mb-2">Status Code</label>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { id: 'all', label: 'All' },
                      { id: '2', label: '2xx Success' },
                      { id: '4', label: '4xx Client Error' },
                      { id: '5', label: '5xx Server Error' }
                    ].map(s => (
                      <button 
                        key={s.id} 
                        onClick={() => setStatusFilter(s.id)} 
                        className={cn("px-3 py-1.5 text-xs font-bold rounded-lg border transition-colors", statusFilter === s.id ? "bg-teal/20 text-teal border-teal/30" : "bg-white/5 text-white/60 border-transparent hover:bg-white/10")}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Endpoint Filter */}
                <div>
                  <label className="block text-[10px] font-bold text-white/40 uppercase tracking-widest mb-2">Endpoint</label>
                  <select 
                    value={pathFilter} 
                    onChange={e => setPathFilter(e.target.value)} 
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm font-medium text-white/80 focus:outline-none focus:border-teal/50"
                  >
                    <option value="all" className="bg-[#14131E]">All Endpoints</option>
                    <option value="/v1/people-search" className="bg-[#14131E]">/v1/people-search</option>
                    <option value="/v1/domain-to-cin" className="bg-[#14131E]">/v1/domain-to-cin</option>
                    <option value="/v1/linkedin-to-profile" className="bg-[#14131E]">/v1/linkedin-to-profile</option>
                  </select>
                </div>

                {/* Clear All */}
                {activeFiltersCount > 0 && (
                  <div className="pt-4 border-t border-white/10">
                    <button 
                      onClick={() => { setMethodFilter('all'); setStatusFilter('all'); setPathFilter('all'); setSearch(''); }}
                      className="w-full py-2.5 bg-white/5 hover:bg-white/10 rounded-xl text-xs font-bold text-white transition-colors border border-white/5"
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

      {/* Logs Table */}
      <div className="glass-panel rounded-2xl shadow-xl border border-white/10 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-white/5 border-b border-white/10">
              <tr>
                <th className="px-6 py-4 font-black text-white/40 uppercase tracking-widest text-[10px] w-10"></th>
                <th className="px-6 py-4 font-black text-white/40 uppercase tracking-widest text-[10px]">Status</th>
                <th className="px-6 py-4 font-black text-white/40 uppercase tracking-widest text-[10px]">Method / Endpoint</th>
                <th className="px-6 py-4 font-black text-white/40 uppercase tracking-widest text-[10px]">Date & Time</th>
                <th className="px-6 py-4 font-black text-white/40 uppercase tracking-widest text-[10px]">Duration</th>
                <th className="px-6 py-4 font-black text-white/40 uppercase tracking-widest text-[10px]">IP Address</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredLogs.map((log) => {
                const isExpanded = expandedRow === log.id;
                const isError = log.status >= 400;

                return (
                  <React.Fragment key={log.id}>
                    {/* Main Row */}
                    <tr 
                      onClick={() => toggleRow(log.id)}
                      className={cn(
                        "group cursor-pointer transition-colors",
                        isExpanded ? "bg-white/5" : "hover:bg-white/[0.02]"
                      )}
                    >
                      <td className="px-6 py-4 text-white/40 group-hover:text-white transition-colors">
                        {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </td>
                      <td className="px-6 py-4">
                        <span className={cn("px-2.5 py-1 rounded-md text-[11px] font-black font-mono shadow-sm border", getStatusColor(log.status))}>
                          {log.status}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <span className={cn(
                            "text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-widest",
                            log.method === 'GET' ? "bg-blue-500/10 text-blue-400 border border-blue-500/20" : "bg-purple-500/10 text-purple-400 border border-purple-500/20"
                          )}>
                            {log.method}
                          </span>
                          <span className="font-mono text-white/80 font-medium">{log.path}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-white/50 font-medium" suppressHydrationWarning>
                        {new Date(log.timestamp).toLocaleString(undefined, { 
                          month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' 
                        })}
                      </td>
                      <td className="px-6 py-4 text-white/50 font-mono text-xs">
                        {log.duration}ms
                      </td>
                      <td className="px-6 py-4 text-white/50 font-mono text-xs">
                        {log.ip}
                      </td>
                    </tr>

                    {/* Expanded Details */}
                    <AnimatePresence>
                      {isExpanded && (
                        <tr className="bg-ink/50 shadow-inner">
                          <td colSpan={6} className="p-0 border-t border-white/5">
                            <motion.div 
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.2 }}
                              className="overflow-hidden"
                            >
                              <div className="p-8 grid grid-cols-1 lg:grid-cols-2 gap-8">
                                
                                {/* Request Details */}
                                <div>
                                  <h4 className="text-xs font-black text-white/40 uppercase tracking-widest mb-4">Request</h4>
                                  <CodeBlock 
                                    code={JSON.stringify(log.request, redactPayload, 2)} 
                                    className="bg-[#0f111a]"
                                    textClassName="text-white/70"
                                  />
                                </div>

                                {/* Response Details */}
                                <div>
                                  <h4 className="text-xs font-black text-white/40 uppercase tracking-widest mb-4">Response</h4>
                                  {isError ? (
                                    <div className="space-y-4">
                                      {/* Error Taxonomy Callout */}
                                      {log.response.error && (
                                        <div className="bg-semantic-error/10 border border-semantic-error/20 rounded-xl p-4 flex items-start gap-3 shadow-inner">
                                          <AlertCircle className="w-5 h-5 text-semantic-error flex-shrink-0 mt-0.5" />
                                          <div>
                                            <div className="flex items-center gap-2 mb-1">
                                              <span className="text-semantic-error font-bold text-sm">API Error:</span>
                                              <code className="text-xs font-bold text-semantic-error bg-semantic-error/20 px-1.5 py-0.5 rounded">{log.response.error.type}</code>
                                            </div>
                                            <p className="text-semantic-error/80 text-sm mb-3">{log.response.error.message}</p>
                                            <a href="/docs#errors" target="_blank" className="text-xs font-bold text-semantic-error hover:text-white transition-colors underline underline-offset-2">
                                              View Troubleshooting Guide ↗
                                            </a>
                                          </div>
                                        </div>
                                      )}
                                      {/* Raw Payload */}
                                      <CodeBlock 
                                        code={JSON.stringify(log.response, redactPayload, 2)} 
                                        className="bg-[#0f111a] border-semantic-error/20"
                                        textClassName="text-semantic-error/80"
                                      />
                                    </div>
                                  ) : (
                                    <CodeBlock 
                                      code={JSON.stringify(log.response, redactPayload, 2)} 
                                      className="bg-[#0f111a] border-semantic-success/20"
                                      textClassName="text-semantic-success/80"
                                    />
                                  )}
                                </div>

                                {/* Meta */}
                                <div className="lg:col-span-2 pt-4 border-t border-white/5 flex items-center justify-between text-xs text-white/40 font-mono">
                                  <span>Request ID: {log.id}</span>
                                  <span>Processed in {log.duration}ms</span>
                                </div>
                              </div>
                            </motion.div>
                          </td>
                        </tr>
                      )}
                    </AnimatePresence>
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
          {filteredLogs.length === 0 && (
            <div className="p-12 text-center text-white/40">
              <p>No logs found matching your search.</p>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
