'use client';

import { useState, useEffect, useRef } from 'react';
import { Activity, Server, Zap, ArrowUpRight, CheckCircle2, Loader2, ShieldCheck, AlertTriangle, PowerOff, Power } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStore } from '@/lib/store';

interface Node {
  id: string;
  region: string;
  status: 'active' | 'provisioning' | 'draining' | 'offline';
  load: number;
}

const REGIONS = ['us-east-1', 'eu-west-1', 'ap-south-1'];

export default function InfrastructurePage() {
  const { environment } = useStore();
  const [isStressTesting, setIsStressTesting] = useState(false);
  const [outageRegions, setOutageRegions] = useState<string[]>([]);
  const [traffic, setTraffic] = useState<number[]>(Array(40).fill(10));
  const [nodes, setNodes] = useState<Node[]>([
    { id: 'node-a', region: 'us-east-1', status: 'active', load: 45 },
    { id: 'node-b', region: 'us-east-1', status: 'active', load: 32 },
    { id: 'node-c', region: 'eu-west-1', status: 'active', load: 15 },
    { id: 'node-d', region: 'ap-south-1', status: 'active', load: 20 },
  ]);

  // SLA and Latency State
  const [latencyHistory, setLatencyHistory] = useState<number[]>(Array(40).fill(45));
  const [slaMetrics, setSlaMetrics] = useState({ total: 10000, failed: 1 });

  const trafficInterval = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    trafficInterval.current = setInterval(() => {
      // 1. Calculate Traffic
      setTraffic(prev => {
        const next = [...prev.slice(1)];
        let newPoint = isStressTesting 
          ? Math.floor(Math.random() * 400 + 500)
          : Math.floor(Math.random() * 20 + 5);
        
        // If all regions offline, traffic drops to 0
        if (outageRegions.length === REGIONS.length) {
          newPoint = 0;
        } else if (outageRegions.length > 0) {
          // Slight dip during failover simulation
          newPoint = Math.floor(newPoint * 0.8);
        }
        
        next.push(newPoint);
        return next;
      });

      // 2. Update node loads based on outage state
      setNodes(prevNodes => 
        prevNodes.map(node => {
          // Handle Outages
          if (outageRegions.includes(node.region)) {
            return { ...node, status: 'offline', load: 0 };
          }
          
          // Recover from outage
          if (node.status === 'offline' && !outageRegions.includes(node.region)) {
            return { ...node, status: 'active', load: Math.floor(Math.random() * 30 + 10) };
          }

          if (node.status !== 'active') return node;
          
          let targetLoad = isStressTesting 
            ? Math.floor(Math.random() * 20 + 75) // 75-95% under stress
            : Math.floor(Math.random() * 30 + 10); // 10-40% normally

          // If there is an outage in other regions, remaining nodes absorb the load
          if (outageRegions.length > 0 && !isStressTesting) {
            targetLoad += (outageRegions.length * 30); // Spike load
          }

          targetLoad = Math.min(100, targetLoad); // Cap at 100%

          return {
            ...node,
            load: Math.floor((node.load * 0.7) + (targetLoad * 0.3))
          };
        })
      );
    }, 1000);

    return () => clearInterval(trafficInterval.current as NodeJS.Timeout);
  }, [isStressTesting, outageRegions]);

  // Continuous Latency Pinger Effect
  useEffect(() => {
    const pingInterval = setInterval(async () => {
      const start = Date.now();
      try {
        const res = await fetch('/api/v1/identity/resolve?query=ping', {
          headers: {
            'X-Simulate-Outage': outageRegions.length === REGIONS.length ? 'true' : 'false'
          }
        });
        const duration = Date.now() - start;
        
        setLatencyHistory(prev => {
          const next = [...prev.slice(1)];
          // If complete outage, latency spikes artificially to simulate timeout before 503
          next.push(outageRegions.length === REGIONS.length ? 1500 : duration);
          return next;
        });

        setSlaMetrics(prev => ({
          total: prev.total + 1,
          failed: prev.failed + (res.status >= 500 || outageRegions.length === REGIONS.length ? 1 : 0)
        }));
      } catch {
        setLatencyHistory(prev => [...prev.slice(1), 2000]);
        setSlaMetrics(prev => ({ total: prev.total + 1, failed: prev.failed + 1 }));
      }
    }, 1000);

    return () => clearInterval(pingInterval);
  }, [outageRegions]);

  const handleStressTest = () => {
    setIsStressTesting(true);

    setTimeout(() => {
      const newNodes: Node[] = [];
      // Only provision in healthy regions
      const healthyRegions = REGIONS.filter(r => !outageRegions.includes(r));
      if (healthyRegions.length === 0) return;

      for(let i=0; i<6; i++) {
        newNodes.push({
          id: `node-${Math.random().toString(36).substring(2, 6)}`,
          region: healthyRegions[Math.floor(Math.random() * healthyRegions.length)],
          status: 'provisioning',
          load: 0
        });
      }
      setNodes(prev => [...prev, ...newNodes]);

      newNodes.forEach((node, i) => {
        setTimeout(() => {
          setNodes(prev => prev.map(n => 
            n.id === node.id ? { ...n, status: 'active', load: 50 } : n
          ));
        }, 3000 + (i * 1500));
      });

      setTimeout(() => {
        setIsStressTesting(false);
        setTimeout(() => {
          setNodes(prev => prev.map(n => 
            newNodes.find(newN => newN.id === n.id) ? { ...n, status: 'draining', load: 0 } : n
          ));
          setTimeout(() => {
            setNodes(prev => prev.filter(n => n.status !== 'draining'));
          }, 4000);
        }, 5000);
      }, 15000);
    }, 2000);
  };


  const toggleRegionOutage = (region: string) => {
    setOutageRegions(prev => 
      prev.includes(region) ? prev.filter(r => r !== region) : [...prev, region]
    );
  };

  if (environment === 'sandbox') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4 animate-in fade-in duration-500">
        <div className="w-20 h-20 bg-teal/10 rounded-full flex items-center justify-center mb-6">
          <Server className="w-10 h-10 text-teal" />
        </div>
        <h2 className="text-2xl font-bold text-fg mb-2">Shared Infrastructure</h2>
        <p className="text-fg-muted max-w-md">
          The Sandbox environment runs on a shared testing cluster. Switch to Live mode to view and manage your dedicated production infrastructure and edge routing.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-fg mb-2 tracking-tight">Global Infrastructure</h1>
          <p className="text-fg-muted">Live view of our auto-scaling edge network routing your API traffic.</p>
        </div>
        <button
          onClick={handleStressTest}
          disabled={isStressTesting || outageRegions.length === REGIONS.length}
          className={cn(
            "flex items-center gap-2 px-6 py-2.5 rounded-lg font-bold transition-all shadow-[0_4px_14px_rgba(70,189,198,0.3)]",
            isStressTesting || outageRegions.length === REGIONS.length
              ? "bg-glass text-fg-muted cursor-not-allowed shadow-none border border-border-subtle"
              : "bg-teal text-ink hover:bg-teal-ice"
          )}
        >
          {isStressTesting ? (
            <>
              <Activity className="w-4 h-4 animate-pulse" />
              Stress Test Active
            </>
          ) : (
            <>
              <Zap className="w-4 h-4" />
              Simulate Traffic Spike
            </>
          )}
        </button>
      </div>

      {/* Traffic Monitor */}
      <div className="p-6 rounded-xl border border-border bg-surface-2 shadow-2xl relative overflow-hidden">
        {isStressTesting && (
          <div className="absolute inset-0 bg-teal/5 animate-pulse pointer-events-none" />
        )}
        {outageRegions.length > 0 && !isStressTesting && (
          <div className="absolute inset-0 bg-semantic-error/5 animate-pulse pointer-events-none" />
        )}
        <div className="flex items-center justify-between mb-8 relative z-10">
          <div className="flex items-center gap-3">
            <div className={cn("p-2 rounded-lg", 
              outageRegions.length === REGIONS.length ? "bg-white/10" :
              isStressTesting ? "bg-teal/20" : 
              outageRegions.length > 0 ? "bg-semantic-warning/20" : "bg-teal/20"
            )}>
              <Activity className={cn("w-5 h-5", 
                outageRegions.length === REGIONS.length ? "text-fg-muted" :
                outageRegions.length > 0 && !isStressTesting ? "text-semantic-warning" : "text-teal"
              )} />
            </div>
            <div>
              <h3 className="font-bold text-fg">Requests Per Second</h3>
              <p className="text-xs text-fg-muted">Global entry points</p>
            </div>
          </div>
          <div className="text-right flex items-center gap-4">
            {outageRegions.length > 0 && outageRegions.length < REGIONS.length && (
              <span className="text-xs font-bold text-semantic-warning bg-semantic-warning/10 px-2 py-1 rounded-full flex items-center gap-1.5 animate-pulse">
                <AlertTriangle className="w-3 h-3" />
                Traffic Rerouted
              </span>
            )}
            <div className={cn("text-3xl font-black tabular-nums tracking-tighter", 
              outageRegions.length === REGIONS.length ? "text-fg-muted" :
              outageRegions.length > 0 && !isStressTesting ? "text-semantic-warning" : "text-teal"
            )}>
              {traffic[traffic.length - 1]}<span className="text-sm font-medium text-fg-muted ml-1">req/s</span>
            </div>
          </div>
        </div>

        {/* CSS Bar Chart */}
        <div className="h-32 flex items-end gap-1 relative z-10">
          {traffic.map((val, i) => (
            <div 
              key={i} 
              className="flex-1 bg-glass rounded-t overflow-hidden relative"
              style={{ height: '100%' }}
            >
              <div 
                className={cn(
                  "absolute bottom-0 left-0 right-0 transition-all duration-300 rounded-t",
                  outageRegions.length === REGIONS.length ? "bg-white/10" :
                  val > 300 ? "bg-teal" : 
                  outageRegions.length > 0 ? "bg-semantic-warning" : "bg-teal"
                )}
                style={{ height: `${Math.min((val / 1000) * 100, 100)}%` }}
              />
            </div>
          ))}
        </div>
      </div>

      {/* SLA & Latency Monitor */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* SLA Display */}
        <div className="p-6 rounded-xl border border-border bg-surface-2 shadow-2xl flex flex-col justify-center items-center text-center">
          <h3 className="font-bold text-fg-muted mb-2 uppercase tracking-widest text-xs">Rolling SLA (90d)</h3>
          <div className={cn(
            "text-5xl font-black tracking-tighter mb-2",
            ((slaMetrics.total - slaMetrics.failed) / slaMetrics.total) * 100 < 99.9 
              ? "text-semantic-error" 
              : "text-semantic-success"
          )}>
            {(((slaMetrics.total - slaMetrics.failed) / slaMetrics.total) * 100).toFixed(3)}%
          </div>
          <div className="flex items-center gap-2 text-xs font-medium text-fg-muted bg-glass px-3 py-1.5 rounded-full">
            <CheckCircle2 className="w-3.5 h-3.5" /> Guaranteed 99.99% Uptime
          </div>
        </div>

        {/* Latency Graph */}
        <div className="md:col-span-2 p-6 rounded-xl border border-border bg-surface-2 shadow-2xl">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-indigo-500/20">
                <Activity className="w-5 h-5 text-indigo-400" />
              </div>
              <div>
                <h3 className="font-bold text-fg">Edge Latency</h3>
                <p className="text-xs text-fg-muted">Continuous active pings</p>
              </div>
            </div>
            <div className="text-right flex items-center gap-4">
              <div className={cn("text-3xl font-black tabular-nums tracking-tighter", 
                latencyHistory[latencyHistory.length - 1] > 500 ? "text-semantic-error" : "text-indigo-400"
              )}>
                {latencyHistory[latencyHistory.length - 1]}<span className="text-sm font-medium text-fg-muted ml-1">ms</span>
              </div>
            </div>
          </div>

          <div className="h-24 flex items-end gap-1 relative">
            {/* 100ms threshold line */}
            <div className="absolute left-0 right-0 border-t border-dashed border-border z-0 pointer-events-none" style={{ bottom: '20%' }}>
              <span className="absolute -top-4 left-0 text-[9px] text-fg-subtle font-mono">100ms Target</span>
            </div>
            
            {latencyHistory.map((val, i) => {
              const normalizedHeight = Math.min((val / 1000) * 100, 100);
              return (
                <div 
                  key={i} 
                  className="flex-1 bg-glass rounded-t overflow-hidden relative z-10"
                  style={{ height: '100%' }}
                >
                  <div 
                    className={cn(
                      "absolute bottom-0 left-0 right-0 transition-all duration-300 rounded-t",
                      val > 500 ? "bg-semantic-error" : val > 150 ? "bg-semantic-warning" : "bg-indigo-500"
                    )}
                    style={{ height: `${normalizedHeight}%` }}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Nodes by Region */}
      <div className="space-y-6">
        {REGIONS.map(region => {
          const regionNodes = nodes.filter(n => n.region === region);
          const isOffline = outageRegions.includes(region);
          
          return (
            <div key={region} className="space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-border-subtle">
                <h3 className="font-bold text-fg flex items-center gap-2">
                  <Server className={cn("w-4 h-4", isOffline ? "text-semantic-error" : "text-fg-muted")} />
                  {region.toUpperCase()}
                  {isOffline && (
                    <span className="text-[10px] font-black uppercase tracking-wider text-semantic-error bg-semantic-error/10 px-2 py-0.5 rounded ml-2">
                      Outage
                    </span>
                  )}
                </h3>
                <button
                  onClick={() => toggleRegionOutage(region)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold transition-all",
                    isOffline
                      ? "bg-teal/10 text-teal hover:bg-teal/20"
                      : "bg-semantic-error/10 text-semantic-error hover:bg-semantic-error/20"
                  )}
                >
                  {isOffline ? (
                    <>
                      <Power className="w-3.5 h-3.5" />
                      Restore Region
                    </>
                  ) : (
                    <>
                      <PowerOff className="w-3.5 h-3.5" />
                      Trigger Outage
                    </>
                  )}
                </button>
              </div>

              {regionNodes.length === 0 ? (
                <div className="p-8 text-center border border-dashed border-border rounded-xl text-fg-subtle text-sm font-medium">
                  No active nodes in this region.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {regionNodes.map((node) => (
                    <div 
                      key={node.id} 
                      className={cn(
                        "p-4 rounded-xl border transition-all duration-500",
                        node.status === 'active' ? "border-border bg-surface-2" :
                        node.status === 'offline' ? "border-semantic-error/20 bg-semantic-error/5" :
                        node.status === 'provisioning' ? "border-teal/30 bg-teal/5 animate-pulse" :
                        "border-border-subtle bg-glass opacity-50"
                      )}
                    >
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className={cn("font-bold text-sm", node.status === 'offline' ? "text-semantic-error" : "text-fg")}>
                              zintlr-{node.id}
                            </h4>
                            {node.status === 'active' && <CheckCircle2 className="w-3.5 h-3.5 text-teal" />}
                            {node.status === 'offline' && <AlertTriangle className="w-3.5 h-3.5 text-semantic-error" />}
                          </div>
                          <p className="text-[10px] uppercase font-bold tracking-wider text-fg-subtle flex items-center gap-1.5">
                            {node.region}
                          </p>
                        </div>
                        {node.status === 'provisioning' && (
                          <span className="flex items-center gap-1 text-[10px] uppercase font-bold text-teal bg-teal/10 px-2 py-1 rounded-full">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            Prov
                          </span>
                        )}
                        {node.status === 'draining' && (
                          <span className="flex items-center gap-1 text-[10px] uppercase font-bold text-fg-muted bg-white/10 px-2 py-1 rounded-full">
                            Draining
                          </span>
                        )}
                      </div>

                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className={cn("font-medium", node.status === 'offline' ? "text-semantic-error/50" : "text-fg-muted")}>
                            {node.status === 'offline' ? 'OFFLINE' : 'CPU Load'}
                          </span>
                          <span className={cn(
                            "font-bold tabular-nums",
                            node.status === 'offline' ? "text-semantic-error/50" :
                            node.load > 85 ? "text-semantic-error" : 
                            node.load > 60 ? "text-semantic-warning" : "text-fg"
                          )}>
                            {node.load}%
                          </span>
                        </div>
                        <div className="h-1 w-full bg-glass rounded-full overflow-hidden">
                          <div 
                            className={cn(
                              "h-full transition-all duration-500",
                              node.status === 'offline' ? "bg-transparent" :
                              node.load > 85 ? "bg-semantic-error" : 
                              node.load > 60 ? "text-semantic-warning" : "bg-teal"
                            )}
                            style={{ width: `${node.load}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      
      {/* Infrastructure Details */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-border-subtle">
         <div className="p-4 rounded-xl bg-glass border border-border-subtle">
            <ShieldCheck className="w-5 h-5 text-teal mb-3" />
            <h4 className="text-sm font-bold text-fg mb-1">DDoS Protection</h4>
            <p className="text-xs text-fg-muted">Automated layer 7 mitigation across all edge points.</p>
         </div>
         <div className="p-4 rounded-xl bg-glass border border-border-subtle">
            <ArrowUpRight className="w-5 h-5 text-teal mb-3" />
            <h4 className="text-sm font-bold text-fg mb-1">Sub-50ms Routing</h4>
            <p className="text-xs text-fg-muted">Anycast routing directs requests to the nearest healthy node.</p>
         </div>
         <div className="p-4 rounded-xl bg-glass border border-border-subtle">
            <Activity className="w-5 h-5 text-teal mb-3" />
            <h4 className="text-sm font-bold text-fg mb-1">Zero-Downtime Scaling</h4>
            <p className="text-xs text-fg-muted">Traffic seamlessly drains to new instances as load increases.</p>
         </div>
      </div>

    </div>
  );
}
