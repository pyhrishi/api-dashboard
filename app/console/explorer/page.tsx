'use client';

import { useState, useEffect } from 'react';
import { useStore } from '@/lib/store';
import { ENDPOINTS } from '@/src/data/endpoints';
import { validateAllParameters, hasValidationErrors } from '@/lib/validation';
import { generateCodeSamples } from '@/lib/codeSampleGenerator';
import { callSandboxAPI, isAPIError } from '@/lib/sandboxAPI';
import { Play, ShieldAlert, PhoneCall, Search, Users, Building2, Terminal, CheckCircle2, Lock, AlertCircle, Copy, Check, Hash, Mail, Type } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

export default function ExplorerPage() {
  const { deductCredits, environment, activeKeys } = useStore();
  const [selectedId, setSelectedId] = useState(ENDPOINTS[0].id);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [parameters, setParameters] = useState<Record<string, any>>({});
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  
  const [isLoading, setIsLoading] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [response, setResponse] = useState<any>(null);
  const [responseTime, setResponseTime] = useState(0);
  const [selectedKeyId, setSelectedKeyId] = useState<string>('');
  
  const [activeCodeTab, setActiveCodeTab] = useState<'curl' | 'python' | 'nodejs'>('curl');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const activeEndpoint = ENDPOINTS.find(e => e.id === selectedId)!;

  const filteredKeys = activeKeys.filter(k => 
    environment === 'live' ? k.key.startsWith('sk_live_') : k.key.startsWith('sk_test_')
  );
  
  const apiKey = filteredKeys.find(k => k.id === selectedKeyId)?.key || '';

  // Auto-select first available key
  useEffect(() => {
    if (filteredKeys.length > 0 && !filteredKeys.find(k => k.id === selectedKeyId)) {
      setSelectedKeyId(filteredKeys[0].id);
    } else if (filteredKeys.length === 0) {
      setSelectedKeyId('');
    }
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
    
    const errors = validateAllParameters(activeEndpoint.parameters, parameters);
    setValidationErrors(errors);
    if (hasValidationErrors(errors)) return;

    setIsLoading(true);
    setResponse(null);
    
    try {
      const result = await callSandboxAPI({
        endpoint: activeEndpoint,
        parameters,
        apiKey
      });

      setResponseTime(result.duration);

      if (isAPIError(result)) {
        setResponse({ status: "error", message: result.error || result.statusText });
      } else {
        setResponse(result.data);
        deductCredits(activeEndpoint.creditCost);
      }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (e: any) {
      setResponse({ status: "error", message: e.message || 'An error occurred' });
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

  const isFormValid = !hasValidationErrors(validationErrors);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col h-[calc(100vh-8rem)] min-h-[600px] bg-[#09090b] rounded-2xl border border-white/10 shadow-2xl overflow-hidden relative"
    >
      {/* 3-Pane Layout */}
      <div className="flex flex-1 overflow-hidden relative">
        
        {/* LEFT PANE: Navigation */}
        <div className="w-80 border-r border-white/10 bg-[#111115] flex flex-col z-10 flex-shrink-0">
          <div className="p-5 border-b border-white/10 bg-[#09090b]/50 backdrop-blur-md">
            <h2 className="font-display font-extrabold text-white tracking-tight text-lg">Endpoints</h2>
            <p className="text-xs text-white/50 mt-1 font-medium">Select an endpoint to configure</p>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            <ul className="space-y-1">
              {ENDPOINTS.map((ep) => (
                <li key={ep.id}>
                  <button
                    onClick={() => handleSelect(ep.id)}
                    className={cn(
                      "w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold transition-all duration-300",
                      selectedId === ep.id
                        ? "bg-teal/10 text-teal shadow-[0_0_10px_rgba(70,189,198,0.1)] border border-teal/20"
                        : "text-white/60 hover:bg-[#09090b] hover:text-white hover:shadow-[0_0_15px_rgba(255,255,255,0.02)] border border-transparent"
                    )}
                  >
                    <span className={cn("flex-shrink-0 transition-colors", selectedId === ep.id ? "text-teal" : "text-white/40")}>
                      {getIcon(ep.id)}
                    </span>
                    <span className={cn("truncate flex-1", ep.isDeprecated && "line-through text-white/40")}>{ep.name}</span>
                    {ep.isDeprecated && <ShieldAlert className="w-3.5 h-3.5 text-semantic-error flex-shrink-0" />}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* MIDDLE PANE: Configuration */}
        <div className="flex-1 border-r border-white/10 flex flex-col relative bg-[#09090b] min-w-[400px]">
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
                <h1 className="text-2xl font-display font-extrabold text-white mb-4 tracking-tight flex items-center gap-3">
                  {activeEndpoint.name}
                  {activeEndpoint.isDeprecated && (
                    <span className="text-[10px] font-bold bg-semantic-error/10 text-semantic-error px-2 py-0.5 rounded uppercase tracking-widest border border-semantic-error/20">Deprecated</span>
                  )}
                </h1>

                {activeEndpoint.isDeprecated && (
                  <div className="mb-6 bg-semantic-error/5 border border-semantic-error/20 rounded-xl p-4 flex flex-col gap-2 shadow-[0_0_15px_rgba(255,255,255,0.02)]">
                    <div className="flex items-center gap-2 text-semantic-error font-bold text-sm">
                      <ShieldAlert className="w-4 h-4" />
                      Warning: Endpoint Deprecated
                    </div>
                    <p className="text-sm text-white/70 leading-relaxed">
                      This endpoint is deprecated and will be removed on <strong className="text-white">{activeEndpoint.sunsetDate || 'a future date'}</strong>.
                      {activeEndpoint.replacementEndpointId && (
                        <span> Please migrate to the <button onClick={() => handleSelect(activeEndpoint.replacementEndpointId!)} className="font-bold text-teal hover:text-teal-ice transition-colors underline underline-offset-2">recommended replacement</button> as soon as possible.</span>
                      )}
                    </p>
                  </div>
                )}
                <div className="flex items-center gap-3 mt-4 font-mono text-sm bg-[#111115] border border-white/10 rounded-xl p-2 shadow-inner">
                  <span className={cn(
                    "px-3 py-1 rounded-md font-bold text-white tracking-widest text-xs",
                    activeEndpoint.method === 'GET' ? "bg-semantic-success" : "bg-teal text-ink"
                  )}>{activeEndpoint.method}</span>
                  <span className="text-white/80 flex-1 truncate">
                    <span className="text-white/40">https://api.zintlr.com/v1</span>
                    <span className="font-bold text-white">{activeEndpoint.path}</span>
                  </span>
                </div>
              </motion.div>
            </AnimatePresence>

            {/* Headers Section */}
            <div className="mb-8 bg-[#111115] border border-white/10 rounded-xl p-4 shadow-[0_0_15px_rgba(255,255,255,0.02)]">
              <h3 className="text-xs font-bold text-white/50 uppercase tracking-widest mb-3 flex items-center gap-2">
                <Lock className="w-3.5 h-3.5" /> Authentication
              </h3>
              <div className="space-y-2">
                <div className="flex justify-between items-center text-sm font-mono bg-[#09090b] px-3 py-2 rounded-lg border border-white/10 shadow-[0_0_15px_rgba(255,255,255,0.02)]">
                  <span className="text-white/60 font-bold">Bearer Token</span>
                  {filteredKeys.length > 0 ? (
                    <select 
                      value={selectedKeyId}
                      onChange={(e) => setSelectedKeyId(e.target.value)}
                      className="bg-[#111115] text-white font-bold px-3 py-1.5 rounded-md border border-white/10 outline-none focus:border-teal/50 text-right w-48 text-xs cursor-pointer"
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
              </div>
            </div>

            {/* Parameters Form */}
            <div className="space-y-4 flex-1 flex flex-col mb-8">
              <h3 className="text-xs font-bold text-white/50 uppercase tracking-widest flex items-center gap-2 mb-2">
                 Parameters
              </h3>
              
              <div className="space-y-4">
                {activeEndpoint.parameters.map((param) => (
                  <div key={param.name}>
                    <label className="flex items-center justify-between text-xs font-bold text-white mb-1.5">
                      <span className="flex items-center gap-1.5">
                        <span className="text-white/40">{getParamIcon(param.type)}</span>
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
                        "w-full px-4 py-3 rounded-xl border outline-none transition-all font-mono text-white shadow-[0_0_15px_rgba(255,255,255,0.02)] text-sm bg-[#111115]/20",
                        validationErrors[param.name] 
                          ? "border-semantic-error focus:ring-4 focus:ring-semantic-error/20" 
                          : "border-white/10 focus:border-teal focus:ring-4 focus:ring-teal/20"
                      )}
                    />
                    {validationErrors[param.name] ? (
                      <p className="text-xs text-semantic-error mt-1.5 flex items-start gap-1.5 font-medium">
                        <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                        {validationErrors[param.name]}
                      </p>
                    ) : (
                      <p className="text-xs text-white/40 mt-1.5 font-medium ml-1">
                        {param.description}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Execute Button */}
            <div className="pt-2 sticky bottom-0 bg-[#09090b] pb-2">
              <button
                onClick={handleTest}
                disabled={!isFormValid || isLoading || !selectedKeyId}
                className="w-full bg-teal text-ink font-extrabold text-sm px-6 py-4 rounded-xl shadow-[0_10px_36px_-10px_rgba(70,189,198,0.65)] hover:bg-teal-ice hover:shadow-[0_14px_44px_-10px_rgba(70,189,198,0.8)] hover:-translate-y-0.5 active:scale-[0.98] transition-all duration-300 disabled:opacity-50 disabled:pointer-events-none disabled:transform-none flex items-center justify-center gap-3 uppercase tracking-wider border border-teal/50"
              >
                {isLoading ? (
                  <div className="w-5 h-5 border-2 border-ink/30 border-t-ink rounded-full animate-spin" />
                ) : (
                  <>
                    <Play className="w-5 h-5 fill-current" />
                    Send Request
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* RIGHT PANE: Snippets & Response */}
        <div className="w-[400px] lg:w-[500px] flex flex-col bg-ink flex-shrink-0 z-10 shadow-2xl relative overflow-hidden">
          <div className="absolute inset-0 grid-dark opacity-20 pointer-events-none" />
          
          <div className="h-[52px] border-b border-white/10 bg-[#09090b]/5 px-5 flex items-center justify-between flex-shrink-0 backdrop-blur-xl relative z-20">
            <div className="flex items-center gap-2 text-white/50 font-mono text-xs uppercase tracking-widest font-bold">
              <Terminal className="w-4 h-4" />
              {response ? 'Response' : 'Code Snippet'}
            </div>
            {response && (
              <span className="text-xs font-mono text-white/40">
                {responseTime}ms
              </span>
            )}
          </div>
          
          <div className="flex-1 overflow-y-auto relative z-10 flex flex-col">
            {!response && !isLoading && (
              <div className="flex-1 flex flex-col">
                <div className="flex border-b border-white/5 bg-[#09090b]/5">
                  {(['curl', 'nodejs', 'python'] as const).map(lang => (
                    <button
                      key={lang}
                      onClick={() => setActiveCodeTab(lang)}
                      className={cn(
                        'flex-1 px-4 py-3 text-xs font-bold transition-colors relative uppercase tracking-wider',
                        activeCodeTab === lang
                          ? 'text-teal bg-[#09090b]/5'
                          : 'text-white/40 hover:text-white/80'
                      )}
                    >
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
                  <pre className="text-xs font-mono overflow-x-auto text-white/80 leading-relaxed">
                    <code>{codeSamples[activeCodeTab]}</code>
                  </pre>
                  <button
                    onClick={() => copyToClipboard(codeSamples[activeCodeTab], `code-${activeCodeTab}`)}
                    className="absolute top-4 right-4 p-2 rounded-lg bg-[#09090b]/5 hover:bg-[#09090b]/10 transition-colors text-white/50 hover:text-white border border-white/10"
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
                <div className="h-4 bg-[#09090b]/10 rounded w-3/4"></div>
                <div className="h-4 bg-[#09090b]/10 rounded w-1/2"></div>
                <div className="h-4 bg-[#09090b]/10 rounded w-5/6"></div>
                <div className="h-4 bg-[#09090b]/10 rounded w-2/3"></div>
                <div className="h-4 bg-[#09090b]/10 rounded w-4/5"></div>
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
                <div className="glass-inner rounded-xl border border-white/10 shadow-inner overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2 border-b border-white/10 bg-[#09090b]/5">
                    <span className="text-[10px] text-white/40 font-mono font-bold tracking-widest uppercase">JSON Response</span>
                    <button
                      onClick={() => copyToClipboard(JSON.stringify(response, null, 2), 'response')}
                      className="p-1.5 rounded-md bg-[#09090b]/5 hover:bg-[#09090b]/10 border border-white/10 text-white/50 hover:text-white transition-all backdrop-blur-sm shadow-[0_0_15px_rgba(255,255,255,0.02)]"
                      title="Copy response"
                    >
                      {copiedId === 'response' ? <CheckCircle2 className="w-3.5 h-3.5 text-teal" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  <pre className="font-mono text-xs p-5 overflow-x-auto whitespace-pre-wrap break-all text-white/70">
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
                  className="mt-6 w-full py-3 text-xs font-bold text-white/50 hover:text-white bg-[#09090b]/5 hover:bg-[#09090b]/10 rounded-xl transition-colors border border-white/10"
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
                  className="w-full py-3 text-xs font-bold text-white/50 hover:text-white bg-[#09090b]/5 hover:bg-[#09090b]/10 rounded-xl transition-colors border border-white/10"
                >
                  Try Again
                </button>
              </motion.div>
            )}
          </div>
        </div>

      </div>
    </motion.div>
  );
}
