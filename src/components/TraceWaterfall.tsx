import React from 'react';
import { motion } from 'framer-motion';

export interface TraceWaterfallProps {
  duration: number;
  status: number;
  endpoint: string;
}

export function TraceWaterfall({ duration, status, endpoint }: TraceWaterfallProps) {
  // Generate simulated spans based on duration and status
  const generateSpans = () => {
    let currentStart = 0;
    const spans = [];

    // 1. Gateway Routing (always happens)
    const gwDur = Math.max(1, Math.floor(duration * 0.05));
    spans.push({ service: 'api-gateway', name: 'request_routing', start: currentStart, dur: gwDur, color: 'bg-indigo-500' });
    currentStart += gwDur;

    // 2. Auth Check (always happens)
    const authDur = Math.max(2, Math.floor(duration * 0.10));
    spans.push({ service: 'auth-service', name: 'verify_token', start: currentStart, dur: authDur, color: 'bg-fuchsia-500' });
    currentStart += authDur;

    if (status === 401) {
      // Failed auth, stop here
      return spans;
    }

    // 3. Rate Limit / WAF (always happens)
    const wafDur = Math.max(1, Math.floor(duration * 0.05));
    spans.push({ service: 'api-gateway', name: 'rate_limit_check', start: currentStart, dur: wafDur, color: 'bg-indigo-500' });
    currentStart += wafDur;

    if (status === 429) {
      return spans;
    }

    // 4. Cache Lookup
    const cacheDur = Math.max(1, Math.floor(duration * 0.05));
    spans.push({ service: 'edge-cache', name: 'lookup', start: currentStart, dur: cacheDur, color: 'bg-emerald-500' });
    currentStart += cacheDur;

    // If duration is extremely short and status is 200, assume Cache Hit
    if (duration < 20 && status === 200) {
      spans[spans.length - 1].name = 'cache_hit';
      return spans;
    }

    // 5. Backend Logic (if cache miss)
    const backendDur = Math.max(10, Math.floor(duration * 0.40));
    spans.push({ service: 'core-api', name: `process_${endpoint.split('/').pop()}`, start: currentStart, dur: backendDur, color: 'bg-teal-500' });
    currentStart += backendDur;

    if (status >= 500) {
      // Backend crashed
      spans[spans.length - 1].error = true;
      return spans;
    }

    if (status === 400) {
      // Validation error
      spans[spans.length - 1].error = true;
      return spans;
    }

    // 6. DB Query (if successful or if backend logic needed it)
    const dbDur = Math.max(5, duration - currentStart - 2); // leave 2ms for formatting
    spans.push({ service: 'postgres-db', name: 'SELECT * FROM records', start: currentStart, dur: dbDur, color: 'bg-blue-500' });
    currentStart += dbDur;

    // 7. Response Formatting
    const formatDur = duration - currentStart;
    if (formatDur > 0) {
      spans.push({ service: 'api-gateway', name: 'format_response', start: currentStart, dur: formatDur, color: 'bg-indigo-500' });
    }

    return spans;
  };

  const spans = generateSpans();
  const actualDuration = spans[spans.length - 1].start + spans[spans.length - 1].dur;
  // Use actualDuration just in case it drifts from total duration slightly

  return (
    <div className="w-full bg-[#0a0a0c] border border-white/10 rounded-xl overflow-hidden mt-6 shadow-2xl">
      <div className="px-4 py-3 bg-[#111115] border-b border-white/10 flex justify-between items-center">
        <h4 className="text-xs font-black text-white/60 uppercase tracking-widest flex items-center gap-2">
          <svg className="w-4 h-4 text-teal" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          Distributed Trace
        </h4>
        <span className="text-xs font-mono text-white/40">trace_{Math.random().toString(36).substring(2, 10)}</span>
      </div>
      
      <div className="p-4 overflow-x-auto">
        <div className="min-w-[600px]">
          {/* Timeline header */}
          <div className="flex relative h-6 border-b border-white/5 mb-4 text-[10px] text-white/30 font-mono">
            {[0, 25, 50, 75, 100].map(percent => (
              <div 
                key={percent} 
                className="absolute top-0 border-l border-white/5 h-full pl-1"
                style={{ left: `${percent}%` }}
              >
                {Math.round((percent / 100) * actualDuration)}ms
              </div>
            ))}
          </div>

          {/* Spans */}
          <div className="space-y-2 relative pb-2">
            {/* Grid lines */}
            <div className="absolute inset-0 pointer-events-none">
              {[0, 25, 50, 75, 100].map(percent => (
                <div 
                  key={percent} 
                  className="absolute top-0 bottom-0 border-l border-white/5"
                  style={{ left: `${percent}%` }}
                />
              ))}
            </div>

            {spans.map((span, idx) => {
              const leftPercent = (span.start / actualDuration) * 100;
              const widthPercent = Math.max((span.dur / actualDuration) * 100, 1); // at least 1% wide

              return (
                <div key={idx} className="relative flex items-center h-8 text-xs font-mono group">
                  {/* Service Name (fixed left) */}
                  <div className="w-40 flex-shrink-0 z-10 pr-4 text-right truncate">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold bg-white/5 ${span.error ? 'text-semantic-error' : 'text-white/60'}`}>
                      {span.service}
                    </span>
                  </div>
                  
                  {/* Timeline Bar Area */}
                  <div className="flex-1 relative h-full flex items-center">
                    <motion.div
                      initial={{ width: 0, opacity: 0 }}
                      animate={{ width: `${widthPercent}%`, opacity: 1 }}
                      transition={{ duration: 0.5, delay: idx * 0.1, ease: 'easeOut' }}
                      className={`absolute h-5 rounded-sm ${span.error ? 'bg-semantic-error' : span.color} bg-opacity-80 flex items-center px-2 overflow-hidden shadow-sm`}
                      style={{ left: `${leftPercent}%` }}
                    >
                      <span className="text-[10px] font-bold text-white whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-md">
                        {span.name} ({span.dur}ms)
                      </span>
                    </motion.div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
