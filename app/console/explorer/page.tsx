'use client';

import { useState, useEffect, useRef } from 'react';
import { useStore } from '@/lib/store';
import { ENDPOINTS } from '@/src/data/endpoints';
import { validateAllParameters, hasValidationErrors } from '@/lib/validation';
import { generateCodeSamples } from '@/lib/codeSampleGenerator';
import { API_BASE_URL } from '@/lib/api-config';
import { track } from '@/lib/telemetry';
import { ApiScope, ScopeEndpointMap } from '@/types/auth';
import { Play, ShieldAlert, PhoneCall, Search, Users, Building2, Terminal, CheckCircle2, Lock, AlertCircle, Copy, Check, Hash, Mail, Type, Zap, X, ChevronRight, Layers } from 'lucide-react';
import Link from 'next/link';
import { isBulkEligible } from '@/lib/bulk-samples';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { Portal } from '@/components/Portal';

export default function ExplorerPage() {
  const { deductCredits, incrementKeyUsage, environment, activeKeys, v2DarkLaunchEnabled, sunsetSimulatorEnabled } = useStore();
  const [selectedId, setSelectedId] = useState(ENDPOINTS[0].id);

  // Deep link: /console/explorer?endpoint=<id> — used by the command palette and docs.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('endpoint');
    if (id && ENDPOINTS.some(e => e.id === id)) setSelectedId(id);
  }, []);
  const [parameters, setParameters] = useState<Record<string, string>>({});
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  
  const [isLoading, setIsLoading] = useState(false);
  const [response, setResponse] = useState<{ status?: string; message?: string; [key: string]: unknown } | null>(null);
  const [responseTime, setResponseTime] = useState(0);
  const [selectedKeyId, setSelectedKeyId] = useState<string>('');
  const [simulatedIp, setSimulatedIp] = useState('192.168.1.1');
  
  const [activeCodeTab, setActiveCodeTab] = useState<'cli' | 'curl' | 'python' | 'nodejs'>('cli');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  
  const [migrationTargetId, setMigrationTargetId] = useState<string | null>(null);

  const activeEndpoint = ENDPOINTS.find(e => e.id === selectedId)!;
  const visibleEndpoints = ENDPOINTS.filter(ep => ep.version !== 'v2' || v2DarkLaunchEnabled);
  const migrationTarget = migrationTargetId ? ENDPOINTS.find(e => e.id === migrationTargetId) : null;
  
  const getDaysUntilSunset = (dateString?: string) => {
    if (!dateString) return null;
    const sunset = new Date(dateString);
    const now = new Date();
    const diff = sunset.getTime() - now.getTime();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  };
  
  const daysUntilSunset = getDaysUntilSunset(activeEndpoint.sunsetDate);

  const filteredKeys = activeKeys.filter(k => 
    (environment === 'live' ? k.key.startsWith('sk_live_') : k.key.startsWith('sk_test_')) &&
    !['revoked', 'compromised', 'expired'].includes(k.status || 'active')
  );
  
  const apiKey = filteredKeys.find(k => k.id === selectedKeyId)?.key || '';

  // Auto-select keys
  const prevKeysRef = useRef(filteredKeys);
  useEffect(() => {
    if (filteredKeys.length > prevKeysRef.current.length) {
      setSelectedKeyId(filteredKeys[0].id);
    } else if (filteredKeys.length > 0 && !filteredKeys.find(k => k.id === selectedKeyId)) {
      setSelectedKeyId(filteredKeys[0].id);
    } else if (filteredKeys.length === 0) {
      setSelectedKeyId('');
    }
    prevKeysRef.current = filteredKeys;
  }, [filteredKeys, selectedKeyId]);

  // Handle endpoint selection
  const handleSelect = (id: string) => {
    setSelectedId(id);
    setParameters({});
    setValidationErrors({});
    setResponse(null);
  };

  const handleParameterChange = (name: string, value: string) => {
    setParameters(prev => ({ ...prev, [name]: value }));
    if (validationErrors[name]) {
      setValidationErrors(prev => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
  };

  // Generate dynamic code samples
  const codeSamples = generateCodeSamples({ endpoint: activeEndpoint, parameters, apiKey: apiKey || 'sk_test_...' });

  const handleTest = async () => {
    if (!selectedKeyId) return;
    
    const currentKey = filteredKeys.find(k => k.id === selectedKeyId);
    
    // Evaluate Scopes (Gateway Interceptor)
    const isAuthorized = currentKey?.scopes.includes('*') || currentKey?.scopes.includes('all') ||
                         currentKey?.scopes.some(scope => ScopeEndpointMap[scope as ApiScope]?.includes(activeEndpoint.path));

    if (!isAuthorized) {
      setIsLoading(true);
      setResponse(null);
      await new Promise(resolve => setTimeout(resolve, 12)); // Extremely fast rejection
      setResponseTime(12);
      
      const errorPayload = { 
        status: "error", 
        error_code: "INSUFFICIENT_SCOPES", 
        message: `The provided API key does not have the required scopes to access ${activeEndpoint.path}.` 
      };
      setResponse(errorPayload);
      setIsLoading(false);
      
      // Log the 403 response
      useStore.getState().logApiRequest({
        id: `req_${Math.random().toString(36).substring(2, 9)}`,
        environment,
        timestamp: new Date().toISOString(),
        method: activeEndpoint.method,
        path: activeEndpoint.path,
        status: 403,
        duration: 12,
        ip: simulatedIp,
        request: { headers: { 'Authorization': `Bearer ${apiKey}`, 'User-Agent': 'node-fetch/1.0' }, parameters },
        response: errorPayload
      });
      return;
    }

    // Evaluate IP Allowlist (Gateway Interceptor)
    if (currentKey?.allowedIps && currentKey.allowedIps.length > 0) {
      if (!currentKey.allowedIps.includes(simulatedIp)) {
        setIsLoading(true);
        setResponse(null);
        await new Promise(resolve => setTimeout(resolve, 15));
        setResponseTime(15);
        
        const ipErrorPayload = { 
          status: "error", 
          error_code: "IP_REJECTED", 
          message: `Access denied. The IP address ${simulatedIp} is not in the allowlist for this API key.` 
        };
        setResponse(ipErrorPayload);
        setIsLoading(false);
        
        useStore.getState().logApiRequest({
          id: `req_${Math.random().toString(36).substring(2, 9)}`,
          environment,
          timestamp: new Date().toISOString(),
          method: activeEndpoint.method,
          path: activeEndpoint.path,
          status: 403,
          duration: 15,
          ip: simulatedIp,
          request: { headers: { 'Authorization': `Bearer ${apiKey}`, 'User-Agent': 'node-fetch/1.0' }, parameters },
          response: ipErrorPayload
        });
        return;
      }
    }

    if (environment === 'sandbox' && sunsetSimulatorEnabled && activeEndpoint.isDeprecated) {
      setIsLoading(true);
      setResponse(null);
      await new Promise(resolve => setTimeout(resolve, 300));
      setResponseTime(35);
      
      const gonePayload = {
        error: "Gone",
        message: `The endpoint ${activeEndpoint.path} has been permanently removed in the Sandbox environment due to the Sunset Simulator.`,
        code: 410,
        migratedTo: activeEndpoint.replacementEndpointId
      };
      
      setResponse(gonePayload);
      setIsLoading(false);
      
      useStore.getState().logApiRequest({
        id: `req_${Math.random().toString(36).substring(2, 9)}`,
        environment,
        timestamp: new Date().toISOString(),
        method: activeEndpoint.method,
        path: activeEndpoint.path,
        status: 410,
        duration: 35,
        ip: simulatedIp,
        request: { headers: { 'Authorization': `Bearer ${apiKey}` }, parameters },
        response: gonePayload
      });
      return;
    }

    if (currentKey && currentKey.creditLimit) {
      if ((currentKey.creditsUsed || 0) + activeEndpoint.creditCost > currentKey.creditLimit) {
        setIsLoading(true);
        setResponse(null);
        await new Promise(resolve => setTimeout(resolve, 400));
        setResponseTime(45);
        setResponse({ status: "error", message: "429 Too Many Requests: Key Quota Exceeded" });
        setIsLoading(false);
        return;
      }
    }

    const errors = validateAllParameters(activeEndpoint.parameters, parameters);
    setValidationErrors(errors);
    if (hasValidationErrors(errors)) return;

    setIsLoading(true);
    setResponse(null);

    const startedAt = performance.now();
    try {
      // Fire a REAL request through the production gateway (/api/v1/...) so the
      // console is driven by the actual API — real status, headers, billing,
      // rate-limiting, and (for live keys only) DPDP privacy masking. The rich
      // scope / IP / sunset / quota checks above stay client-side as the UX layer.
      const isGet = activeEndpoint.method === 'GET';
      const queryEntries = Object.entries(parameters)
        .filter(([, v]) => v !== undefined && v !== null && `${v}`.length > 0)
        .map(([k, v]) => [k, `${v}`] as [string, string]);
      const qs = isGet && queryEntries.length ? `?${new URLSearchParams(queryEntries).toString()}` : '';
      const url = `/api${activeEndpoint.path}${qs}`;

      const res = await fetch(url, {
        method: activeEndpoint.method,
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        ...(isGet ? {} : { body: JSON.stringify(parameters) }),
      });

      const duration = Math.round(performance.now() - startedAt);
      setResponseTime(duration);

      let body: unknown;
      try { body = await res.json(); } catch { body = { error: { message: 'Invalid response from gateway' } }; }

      if (res.ok) {
        const payload = body && typeof body === 'object' && 'data' in body ? (body as { data: unknown }).data : body;
        setResponse(payload as Record<string, unknown>);
        deductCredits(activeEndpoint.creditCost);
        incrementKeyUsage(selectedKeyId, activeEndpoint.creditCost);
      } else {
        setResponse(body as Record<string, unknown>);
      }

      track('explorer_run', { endpoint: activeEndpoint.id, status: res.status, ok: res.ok, credits: activeEndpoint.creditCost, durationMs: duration });

      // Log the REAL gateway round-trip (drives the Logs / Analytics / Security pages)
      useStore.getState().logApiRequest({
        id: res.headers.get('x-request-id') || `req_${Math.random().toString(36).substring(2, 9)}`,
        environment,
        timestamp: new Date().toISOString(),
        method: activeEndpoint.method,
        path: activeEndpoint.path,
        status: res.status,
        duration,
        ip: simulatedIp,
        request: { headers: { 'Authorization': `Bearer ${apiKey}`, 'User-Agent': 'node-fetch/1.0' }, parameters },
        response: body
      });

    } catch (e: unknown) {
      setResponse({ status: "error", message: e instanceof Error ? e.message : 'Network error reaching the gateway' });
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const getIcon = (id: string) => {
    if (id.includes('people') || id.includes('contact')) return <Users className="w-4 h-4" />;
    if (id.includes('phone')) return <PhoneCall className="w-4 h-4" />;
    if (id.includes('cin') || id.includes('domain')) return <Building2 className="w-4 h-4" />;
    return <Search className="w-4 h-4" />;
  };

  const getParamIcon = (type: string) => {
    if (type === 'email') return <Mail className="w-3.5 h-3.5" />;
    if (type === 'number') return <Hash className="w-3.5 h-3.5" />;
    return <Type className="w-3.5 h-3.5" />;
  };

  const currentKeyForValidation = filteredKeys.find(k => k.id === selectedKeyId);
  const isAuthorized = currentKeyForValidation 
    ? (currentKeyForValidation.scopes.includes('*') || currentKeyForValidation.scopes.includes('all') ||
       currentKeyForValidation.scopes.some(scope => ScopeEndpointMap[scope as ApiScope]?.includes(activeEndpoint.path)))
    : false;

  const isFormValid = !hasValidationErrors(validationErrors);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col h-[calc(100vh-8rem)] min-h-[600px] bg-surface rounded-2xl border border-border shadow-2xl overflow-hidden relative"
    >
      {/* 3-Pane Layout */}
      <div className="flex flex-1 overflow-hidden relative">
        
        {/* LEFT PANE: Navigation */}
        <div className="w-80 border-r border-border bg-surface-2 flex flex-col z-10 flex-shrink-0">
          <div className="p-5 border-b border-border bg-surface/50 backdrop-blur-md">
            <h2 className="font-display font-extrabold text-fg tracking-tight text-lg">Endpoints</h2>
            <p className="text-xs text-fg-muted mt-1 font-medium">Select an endpoint to configure</p>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            <ul className="space-y-1">
              {visibleEndpoints.map((ep) => (
                <li key={ep.id}>
                  <button
                    onClick={() => handleSelect(ep.id)}
                    className={cn(
                      "w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold transition-all duration-300",
                      selectedId === ep.id
                        ? "bg-teal/10 text-teal shadow-[0_0_10px_rgba(70,189,198,0.1)] border border-teal/20"
                        : "text-fg-muted hover:bg-surface hover:text-fg hover:shadow-[0_0_15px_rgba(255,255,255,0.02)] border border-transparent"
                    )}
                  >
                    <span className={cn("flex-shrink-0 transition-colors", selectedId === ep.id ? "text-teal" : "text-fg-muted")}>
                      {getIcon(ep.id)}
                    </span>
                    <span className={cn("truncate flex-1", ep.isDeprecated && "line-through text-fg-muted")}>{ep.name}</span>
                    {ep.isDeprecated && (
                      <span className="text-[9px] font-black uppercase tracking-widest bg-semantic-warning/20 text-semantic-warning px-1.5 py-0.5 rounded border border-semantic-warning/30 flex-shrink-0">
                        Deprecated
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* MIDDLE PANE: Configuration */}
        <div className="flex-1 border-r border-border flex flex-col relative bg-surface min-w-[400px]">
          {/* Sticky Badge */}
          <div className="bg-semantic-warning/10 border-b border-semantic-warning/20 px-4 py-2.5 flex items-center justify-center gap-2 flex-shrink-0">
            <ShieldAlert className="w-4 h-4 text-semantic-warning" />
            <span className="text-[10px] font-bold text-semantic-warning uppercase tracking-widest">
              Cost: {activeEndpoint.creditCost} Credit{activeEndpoint.creditCost > 1 ? 's' : ''} (Charged on Success)
            </span>
          </div>
          
          <div className="p-8 flex-1 overflow-y-auto flex flex-col">
            <AnimatePresence mode="wait">
              <motion.div 
                key={activeEndpoint.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                transition={{ duration: 0.2 }}
                className="mb-8"
              >
                <h1 className="text-2xl font-display font-extrabold text-fg mb-4 tracking-tight flex items-center gap-3 flex-wrap">
                  {activeEndpoint.name}
                  {activeEndpoint.isDeprecated && (
                    <span className="text-[10px] font-bold bg-semantic-error/10 text-semantic-error px-2 py-0.5 rounded uppercase tracking-widest border border-semantic-error/20">Deprecated</span>
                  )}
                  {isBulkEligible(activeEndpoint) && (
                    <Link
                      href={`/console/jobs?new=1&endpoint=${activeEndpoint.id}`}
                      className="ml-auto inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg bg-glass border border-border text-fg-muted hover:text-teal hover:border-teal/30 transition-colors"
                      title="Run this endpoint over a CSV of inputs"
                    >
                      <Layers className="w-3.5 h-3.5" /> Run in bulk
                    </Link>
                  )}
                </h1>

                {activeEndpoint.isDeprecated && (
                  <div className="mb-6 bg-semantic-warning/10 border border-semantic-warning/30 rounded-2xl p-6 flex flex-col gap-4 shadow-[0_0_30px_rgba(245,166,35,0.1)] relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-6 opacity-10 pointer-events-none">
                      <ShieldAlert className="w-32 h-32 text-semantic-warning" />
                    </div>
                    <div className="flex items-center gap-2 text-semantic-warning font-black tracking-widest uppercase text-sm z-10">
                      <ShieldAlert className="w-5 h-5" />
                      Endpoint Deprecated
                    </div>
                    <p className="text-sm text-fg leading-relaxed max-w-2xl z-10 font-medium">
                      This endpoint is deprecated and will be permanently removed. 
                      {daysUntilSunset !== null && (
                        <span className="inline-block mt-2 font-black text-semantic-warning bg-semantic-warning/10 px-3 py-1 rounded-lg border border-semantic-warning/20">
                          Sunsets in {daysUntilSunset} Days
                        </span>
                      )}
                    </p>
                    
                    {activeEndpoint.replacementEndpointId && (
                      <div className="mt-2 z-10">
                        <button 
                          onClick={() => setMigrationTargetId(activeEndpoint.replacementEndpointId!)} 
                          className="bg-semantic-warning text-[#09090b] font-bold px-6 py-3 rounded-xl hover:bg-opacity-90 transition-colors shadow-[0_0_15px_rgba(245,166,35,0.3)] flex items-center gap-2"
                        >
                          <Zap className="w-4 h-4" />
                          Migrate to Replacement Endpoint
                        </button>
                      </div>
                    )}
                  </div>
                )}
                <div className="flex items-center gap-3 mt-4 font-mono text-sm bg-surface-2 border border-border rounded-xl p-2 shadow-inner">
                  <span className={cn(
                    "px-3 py-1 rounded-md font-bold text-fg tracking-widest text-xs",
                    activeEndpoint.method === 'GET' ? "bg-semantic-success" : "bg-teal text-ink"
                  )}>{activeEndpoint.method}</span>
                  <span className="text-fg flex-1 truncate">
                    <span className="text-fg-muted">{API_BASE_URL}</span>
                    <span className="font-bold text-fg">{activeEndpoint.path}</span>
                  </span>
                </div>
              </motion.div>
            </AnimatePresence>

            {/* Headers Section */}
            <div className="mb-8 bg-surface-2 border border-border rounded-xl p-4 shadow-[0_0_15px_rgba(255,255,255,0.02)]">
              <h3 className="text-xs font-bold text-fg-muted uppercase tracking-widest mb-3 flex items-center gap-2">
                <Lock className="w-3.5 h-3.5" /> Authentication
              </h3>
              <div className="space-y-2">
                <div className="flex justify-between items-center text-sm font-mono bg-surface px-3 py-2 rounded-lg border border-border shadow-[0_0_15px_rgba(255,255,255,0.02)]">
                  <span className="text-fg-muted font-bold">Bearer Token</span>
                  {filteredKeys.length > 0 ? (
                    <select 
                      value={selectedKeyId}
                      onChange={(e) => setSelectedKeyId(e.target.value)}
                      className="bg-surface-2 text-fg font-bold px-3 py-1.5 rounded-md border border-border outline-none focus:border-teal/50 text-right w-48 text-xs cursor-pointer"
                    >
                      {filteredKeys.map(k => (
                        <option key={k.id} value={k.id}>{k.name} ({k.key.substring(0, 12)}...)</option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-semantic-error flex items-center gap-1 text-xs font-sans">
                      <AlertCircle className="w-3.5 h-3.5" /> No {environment} keys available
                    </span>
                  )}
                </div>
                <div className="flex justify-between items-center text-sm font-mono bg-surface px-3 py-2 rounded-lg border border-border shadow-[0_0_15px_rgba(255,255,255,0.02)] mt-2">
                  <span className="text-fg-muted font-bold">Simulated IP</span>
                  <input 
                    type="text"
                    value={simulatedIp}
                    onChange={(e) => setSimulatedIp(e.target.value)}
                    placeholder="e.g. 192.168.1.1"
                    className="bg-surface-2 text-fg font-bold px-3 py-1.5 rounded-md border border-border outline-none focus:border-teal/50 text-right w-48 text-xs placeholder:text-fg-subtle"
                  />
                </div>
              </div>
            </div>

            {/* Parameters Form */}
            <div className="space-y-4 flex-1 flex flex-col mb-8">
              <h3 className="text-xs font-bold text-fg-muted uppercase tracking-widest flex items-center gap-2 mb-2">
                 Parameters
              </h3>
              
              <div className="space-y-4">
                {activeEndpoint.parameters.map((param) => (
                  <div key={param.name}>
                    <label className="flex items-center justify-between text-xs font-bold text-fg mb-1.5">
                      <span className="flex items-center gap-1.5">
                        <span className="text-fg-muted">{getParamIcon(param.type)}</span>
                        {param.name}
                        {param.required && <span className="text-semantic-error ml-1">*</span>}
                      </span>
                    </label>
                    <input 
                      type={param.type === 'number' ? 'number' : 'text'}
                      value={parameters[param.name] || ''}
                      onChange={(e) => handleParameterChange(param.name, e.target.value)}
                      placeholder={param.placeholder || param.example}
                      className={cn(
                        "w-full px-4 py-3 rounded-xl border outline-none transition-all font-mono text-fg shadow-[0_0_15px_rgba(255,255,255,0.02)] text-sm bg-surface-2/20",
                        validationErrors[param.name] 
                          ? "border-semantic-error focus:ring-4 focus:ring-semantic-error/20" 
                          : "border-border focus:border-teal focus:ring-4 focus:ring-teal/20"
                      )}
                    />
                    {validationErrors[param.name] ? (
                      <p className="text-xs text-semantic-error mt-1.5 flex items-start gap-1.5 font-medium">
                        <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                        {validationErrors[param.name]}
                      </p>
                    ) : (
                      <p className="text-xs text-fg-muted mt-1.5 font-medium ml-1">
                        {param.description}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Execute Button */}
            <div className="pt-2 sticky bottom-0 bg-surface pb-2">
              <button
                onClick={handleTest}
                disabled={!isFormValid || isLoading || !selectedKeyId || !isAuthorized}
                className={cn(
                  "w-full font-extrabold text-sm px-6 py-4 rounded-xl shadow-[0_10px_36px_-10px_rgba(70,189,198,0.65)] hover:-translate-y-0.5 active:scale-[0.98] transition-all duration-300 disabled:opacity-50 disabled:pointer-events-none disabled:transform-none flex items-center justify-center gap-3 uppercase tracking-wider border",
                  isAuthorized 
                    ? "bg-teal text-ink hover:bg-teal-ice border-teal/50" 
                    : "bg-surface/50 text-fg-muted border-border shadow-none hover:shadow-none"
                )}
              >
                {isLoading ? (
                  <div className="w-5 h-5 border-2 border-ink/30 border-t-ink rounded-full animate-spin" />
                ) : (
                  <>
                    <Play className="w-5 h-5 fill-current" />
                    {isAuthorized ? 'Send Request' : 'Unauthorized Scope'}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* RIGHT PANE: Snippets & Response */}
        <div className="w-[400px] lg:w-[500px] flex flex-col bg-surface flex-shrink-0 z-10 shadow-2xl relative overflow-hidden">
          <div className="absolute inset-0 theme-grid opacity-20 pointer-events-none" />
          
          <div className="h-[52px] border-b border-border bg-surface/5 px-5 flex items-center justify-between flex-shrink-0 backdrop-blur-xl relative z-20">
            <div className="flex items-center gap-2 text-fg-muted font-mono text-xs uppercase tracking-widest font-bold">
              <Terminal className="w-4 h-4" />
              {response ? 'Response' : 'Code Snippet'}
            </div>
            {response && (
              <span className="text-xs font-mono text-fg-muted">
                {responseTime}ms
              </span>
            )}
          </div>
          
          <div className="flex-1 overflow-y-auto relative z-10 flex flex-col">
            {!response && !isLoading && (
              <div className="flex-1 flex flex-col">
                <div className="flex border-b border-border-subtle bg-surface/5">
                  {(['cli', 'curl', 'nodejs', 'python'] as const).map(lang => (
                    <button
                      key={lang}
                      onClick={() => setActiveCodeTab(lang)}
                      className={cn(
                        'flex-1 px-4 py-3 text-xs font-bold transition-colors relative uppercase tracking-wider',
                        activeCodeTab === lang
                          ? 'text-teal bg-surface/5'
                          : 'text-fg-muted hover:text-fg'
                      )}
                    >
                      {lang === 'cli' && 'CLI'}
                      {lang === 'curl' && 'cURL'}
                      {lang === 'python' && 'Python'}
                      {lang === 'nodejs' && 'Node.js'}
                      {activeCodeTab === lang && (
                        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-teal shadow-[0_0_10px_rgba(70,189,198,0.5)]" />
                      )}
                    </button>
                  ))}
                </div>
                
                <div className="relative flex-1 p-6">
                  <pre className="text-xs font-mono overflow-x-auto text-fg leading-relaxed">
                    <code>{codeSamples[activeCodeTab]}</code>
                  </pre>
                  <button
                    onClick={() => copyToClipboard(codeSamples[activeCodeTab], `code-${activeCodeTab}`)}
                    className="absolute top-4 right-4 p-2 rounded-lg bg-surface/5 hover:bg-surface/10 transition-colors text-fg-muted hover:text-fg border border-border"
                  >
                    {copiedId === `code-${activeCodeTab}` ? (
                      <Check className="w-4 h-4 text-teal" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            )}

            {isLoading && (
              <div className="p-8 space-y-4 animate-pulse">
                <div className="h-4 bg-surface/10 rounded w-3/4"></div>
                <div className="h-4 bg-surface/10 rounded w-1/2"></div>
                <div className="h-4 bg-surface/10 rounded w-5/6"></div>
                <div className="h-4 bg-surface/10 rounded w-2/3"></div>
                <div className="h-4 bg-surface/10 rounded w-4/5"></div>
              </div>
            )}

            {!isLoading && response && response.status !== "error" && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-6"
              >
                <div className="mb-6 bg-semantic-success/10 border border-semantic-success/20 rounded-xl p-4 flex items-center gap-3 shadow-inner">
                  <CheckCircle2 className="w-6 h-6 text-semantic-success flex-shrink-0" />
                  <span className="text-semantic-success text-sm font-bold tracking-wide">
                    200 OK
                  </span>
                </div>
                <div className="glass-inner rounded-xl border border-border shadow-inner overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-surface/5">
                    <span className="text-[10px] text-fg-muted font-mono font-bold tracking-widest uppercase">JSON Response</span>
                    <button
                      onClick={() => copyToClipboard(JSON.stringify(response, null, 2), 'response')}
                      className="p-1.5 rounded-md bg-surface/5 hover:bg-surface/10 border border-border text-fg-muted hover:text-fg transition-all backdrop-blur-sm shadow-[0_0_15px_rgba(255,255,255,0.02)]"
                      title="Copy response"
                    >
                      {copiedId === 'response' ? <CheckCircle2 className="w-3.5 h-3.5 text-teal" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  <pre className="font-mono text-xs p-5 overflow-x-auto whitespace-pre-wrap break-all text-fg-muted">
                    <code dangerouslySetInnerHTML={{ 
                      __html: JSON.stringify(response, null, 2)
                        .replace(/"(.*?)":/g, '<span class="text-teal">"$1"</span>:')
                        .replace(/"(.*?)"/g, (match, p1) => match.includes(':') ? match : `<span class="text-teal-ice">"${p1}"</span>`) 
                        .replace(/\\b(\\d+)\\b/g, '<span class="text-semantic-success">$1</span>')
                    }} />
                  </pre>
                </div>
                <button 
                  onClick={() => setResponse(null)}
                  className="mt-6 w-full py-3 text-xs font-bold text-fg-muted hover:text-fg bg-surface/5 hover:bg-surface/10 rounded-xl transition-colors border border-border"
                >
                  Clear Response
                </button>
              </motion.div>
            )}
            
            {!isLoading && response && response.status === "error" && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-6"
              >
                <div className="mb-6 bg-semantic-error/10 border border-semantic-error/20 rounded-xl p-4 flex items-start gap-3 shadow-inner">
                  <ShieldAlert className="w-5 h-5 text-semantic-error flex-shrink-0 mt-0.5" />
                  <div>
                    <span className="text-semantic-error text-sm font-bold tracking-wide block mb-1">
                      Request Failed
                    </span>
                    <span className="text-semantic-error/80 text-xs">{response.message}</span>
                  </div>
                </div>
                <button 
                  onClick={() => setResponse(null)}
                  className="w-full py-3 text-xs font-bold text-fg-muted hover:text-fg bg-surface/5 hover:bg-surface/10 rounded-xl transition-colors border border-border"
                >
                  Try Again
                </button>
              </motion.div>
            )}
          </div>
        </div>
      </div>
      
      {/* Migration Diff Modal */}
      <Portal>
        <AnimatePresence>
          {migrationTargetId && migrationTarget && (
             <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
               <motion.div 
                 initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                 className="absolute inset-0 bg-overlay backdrop-blur-sm" 
                 onClick={() => setMigrationTargetId(null)} 
               />
               <motion.div 
                 initial={{ opacity: 0, scale: 0.95, y: 20 }}
                 animate={{ opacity: 1, scale: 1, y: 0 }}
                 exit={{ opacity: 0, scale: 0.95, y: 20 }}
                 className="relative w-full max-w-4xl bg-surface border border-border rounded-2xl shadow-2xl overflow-hidden z-10 flex flex-col max-h-[90vh]"
               >
                  <div className="p-6 border-b border-border flex justify-between items-center bg-surface-2">
                     <div>
                        <h3 className="text-xl font-bold text-fg mb-1">Migration Diff</h3>
                        <p className="text-sm text-fg-muted font-medium">From <strong className="text-semantic-error line-through">{activeEndpoint.path}</strong> to <strong className="text-teal">{migrationTarget.path}</strong></p>
                     </div>
                     <button onClick={() => setMigrationTargetId(null)} className="text-fg-muted hover:text-fg transition-colors">
                        <X className="w-5 h-5" />
                     </button>
                  </div>
                  
                  <div className="flex-1 overflow-y-auto p-6 bg-surface">
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-white/10 border border-border rounded-xl overflow-hidden shadow-inner">
                       {/* Left: Old */}
                       <div className="bg-surface-2 p-6">
                          <h4 className="text-xs font-black text-semantic-error uppercase tracking-widest mb-4 flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-semantic-error" /> Old Payload
                          </h4>
                          <pre className="text-sm font-mono space-y-2">
                            {activeEndpoint.parameters.map(p => {
                               const remains = migrationTarget.parameters.find(newP => newP.name === p.name);
                               return (
                                 <div key={p.name} className={cn("flex gap-3 px-2 py-1.5 rounded-lg", remains ? "text-fg-muted" : "bg-semantic-error/10 text-semantic-error")}>
                                   <span className="opacity-50 select-none">{remains ? ' ' : '-'}</span>
                                   <span className="flex-1 font-bold">{p.name}</span>
                                   <span className="opacity-60">{p.type}</span>
                                 </div>
                               )
                            })}
                          </pre>
                       </div>
                       {/* Right: New */}
                       <div className="bg-surface-2 p-6">
                          <h4 className="text-xs font-black text-teal uppercase tracking-widest mb-4 flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-teal" /> New Payload
                          </h4>
                          <pre className="text-sm font-mono space-y-2">
                            {migrationTarget.parameters.map(p => {
                               const existed = activeEndpoint.parameters.find(old => old.name === p.name);
                               return (
                                 <div key={p.name} className={cn("flex gap-3 px-2 py-1.5 rounded-lg", existed ? "text-fg-muted" : "bg-teal/10 text-teal")}>
                                   <span className="opacity-50 select-none">{existed ? ' ' : '+'}</span>
                                   <span className="flex-1 font-bold">{p.name}</span>
                                   <span className="opacity-60">{p.type}</span>
                                 </div>
                               )
                            })}
                          </pre>
                       </div>
                     </div>
                     
                     <div className="mt-8 bg-teal/10 border border-teal/20 rounded-xl p-4 flex gap-3 shadow-[0_0_20px_rgba(70,189,198,0.1)]">
                       <Zap className="w-5 h-5 text-teal shrink-0" />
                       <div>
                         <h5 className="text-sm font-bold text-teal mb-1 tracking-wide">Ready to upgrade?</h5>
                         <p className="text-xs text-fg-muted leading-relaxed max-w-2xl">
                           Update your integration&apos;s code to match the new payload structure above, then switch the endpoint in the explorer to test it live.
                         </p>
                       </div>
                     </div>
                  </div>
                  
                  <div className="p-4 border-t border-border bg-surface-2 flex justify-end gap-3 shrink-0">
                     <button onClick={() => setMigrationTargetId(null)} className="px-5 py-2.5 rounded-xl font-bold text-fg-muted hover:text-fg hover:bg-glass transition-colors">
                       Cancel
                     </button>
                     <button 
                       onClick={() => { handleSelect(migrationTarget.id); setMigrationTargetId(null); }} 
                       className="px-6 py-2.5 rounded-xl font-bold bg-teal text-ink hover:bg-teal-ice transition-colors shadow-[0_0_15px_rgba(70,189,198,0.3)] flex items-center gap-2"
                     >
                       Switch Explorer to {migrationTarget.version?.toUpperCase() || 'New Endpoint'}
                       <ChevronRight className="w-4 h-4" />
                     </button>
                  </div>
               </motion.div>
             </div>
          )}
        </AnimatePresence>
      </Portal>
    </motion.div>
  );
}
