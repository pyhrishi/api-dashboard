/**
 * RequestBuilder Component
 * Interactive component for building and executing API requests.
 * Supports endpoint selection, parameter input, code generation, and response display.
 * 
 * Modes:
 * - "full": Fully editable with all controls
 * - "preview": Read-only preview of endpoint
 * - "review": Full details before execution
 */

'use client';

import { useEffect, useState } from 'react';
import { Endpoint, getEndpointById, ENDPOINTS } from '@/data/endpoints';
import { validateAllParameters, hasValidationErrors } from '@/lib/validation';
import { generateCodeSamples } from '@/lib/codeSampleGenerator';
import { useStore } from '@/lib/store';
import {
  Copy,
  Check,
  Play, 
  Loader2, 
  AlertCircle,
  Code2,
  Coins
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface RequestBuilderProps {
  mode?: 'full' | 'preview' | 'review';
  preselectedEndpointId?: string;
  onExecute?: (result: {
    endpoint: Endpoint;
    statusCode: number;
    responseTime: number;
    response: unknown;
  }) => void;
  onStepChange?: (step: number) => void;
  hideExecuteButton?: boolean;
  disableEditing?: boolean;
  apiKey?: string;
}

interface CodeSampleState {
  curl: string;
  python: string;
  nodejs: string;
  graphql: string;
}

export default function RequestBuilder({
  mode = 'full',
  preselectedEndpointId,
  onExecute,
  hideExecuteButton = false,
  disableEditing = false,
  apiKey = 'sk_test_demo_key',
}: RequestBuilderProps) {
  // State management
  const { v2DarkLaunchEnabled } = useStore();
  const [selectedEndpointId, setSelectedEndpointId] = useState<string | undefined>(
    preselectedEndpointId
  );
  const [parameters, setParameters] = useState<Record<string, string>>({});
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [simulateStatus, setSimulateStatus] = useState<number>(200);
  const [activeCodeTab, setActiveCodeTab] = useState<'curl' | 'python' | 'nodejs' | 'graphql'>('curl');
  const [codeSamples, setCodeSamples] = useState<CodeSampleState>({
    curl: '',
    python: '',
    nodejs: '',
    graphql: '',
  });
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<unknown>(null);
  const [responseHeaders, setResponseHeaders] = useState<Record<string, string>>({});
  const [responseError, setResponseError] = useState<{message: string, code?: string} | null>(null);
  const [responseTime, setResponseTime] = useState<number>(0);

  const endpoint = selectedEndpointId ? getEndpointById(selectedEndpointId) : undefined;
  const isEditable = mode === 'full' && !disableEditing;

  // Generate code samples when endpoint or parameters change
  useEffect(() => {
    if (endpoint) {
      const samples = generateCodeSamples({
        endpoint,
        parameters,
        apiKey,
      });
      setCodeSamples(samples);
    }
  }, [endpoint, parameters, apiKey]);

  // Handle endpoint selection
  const handleEndpointChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newEndpointId = e.target.value;
    setSelectedEndpointId(newEndpointId);
    setParameters({});
    setValidationErrors({});
    setResponse(null);
    setResponseHeaders({});
    setResponseError(null);
  };

  // Handle parameter change
  const handleParameterChange = (paramName: string, value: string) => {
    setParameters(prev => ({
      ...prev,
      [paramName]: value,
    }));

    // Clear error for this field if it exists
    if (validationErrors[paramName]) {
      setValidationErrors(prev => {
        const next = { ...prev };
        delete next[paramName];
        return next;
      });
    }
  };

  // Validate parameters
  const validateParams = (): boolean => {
    if (!endpoint) return false;

    const errors = validateAllParameters(endpoint.parameters, parameters);
    setValidationErrors(errors);
    return !hasValidationErrors(errors);
  };

  // Execute API request
  const handleExecute = async () => {
    if (!endpoint) return;

    // Validate
    if (!validateParams()) {
      return;
    }

    setLoading(true);
    setResponseError(null);
    setResponse(null);
    setResponseHeaders({});

    try {
      const url = new URL(window.location.origin + '/api' + endpoint.path);
      const fetchOptions: RequestInit = {
        method: endpoint.method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
      };

      if (endpoint.method === 'GET') {
        Object.entries(parameters).forEach(([k, v]) => url.searchParams.append(k, v as string));
      } else {
        fetchOptions.body = JSON.stringify(parameters);
      }

      if (simulateStatus && simulateStatus !== 200) {
        // We pass this as a special query param so the middleware can intercept or pass to router
        // In reality, the router uses sandboxAPI which expects it in the request.
        // Let's pass it via header to keep the URL clean.
        (fetchOptions.headers as Record<string, string>)['X-Simulate-Status'] = simulateStatus.toString();
      }

      const start = Date.now();
      const res = await fetch(url.toString(), fetchOptions);
      const duration = Date.now() - start;
      setResponseTime(duration);

      // Extract headers
      const headers: Record<string, string> = {};
      res.headers.forEach((value, key) => {
        if (key.toLowerCase().startsWith('x-')) {
          headers[key] = value;
        }
      });
      setResponseHeaders(headers);

      const json = await res.json();

      if (!res.ok) {
        setResponseError({ 
          message: json.error?.message || res.statusText, 
          code: json.error?.code 
        });
        setResponse(json); // Also set response so the raw JSON is shown
      } else {
        setResponse(json);
        setResponseError(null);

        // Notify parent if callback provided
        if (onExecute) {
          onExecute({
            endpoint,
            statusCode: res.status,
            responseTime: duration,
            response: json,
          });
        }
      }
    } catch (error: unknown) {
      setResponseError({ message: error instanceof Error ? error.message : 'An error occurred' });
    } finally {
      setLoading(false);
    }
  };

  // Copy to clipboard
  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // With nothing selected: editable (full) mode must still render the selector so the
  // user can pick an endpoint; non-editable modes show a designed placeholder instead.
  if (!endpoint && !isEditable) {
    return (
      <div className="p-6 text-center text-ink/60 dark:text-white/60">
        <Code2 className="w-8 h-8 mx-auto mb-3 opacity-30" />
        <p>Select an endpoint to get started</p>
      </div>
    );
  }

  const isFormValid = endpoint && !hasValidationErrors(validationErrors);

  return (
    <div className="space-y-6">
      {/* Endpoint Selector */}
      {isEditable && (
        <div className="space-y-2">
          <label className="block text-sm font-bold text-ink dark:text-white">API Endpoint *</label>
          <div className="relative">
            <select
              value={selectedEndpointId || ''}
              onChange={handleEndpointChange}
              disabled={disableEditing}
              className="w-full px-4 py-2.5 rounded-lg border border-ink/10 dark:border-white/10 bg-white dark:bg-white/5 text-ink dark:text-white font-medium focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent transition-all appearance-none cursor-pointer disabled:opacity-50"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%231D1C39' d='M1 4l5 5 5-5'/%3E%3C/svg%3E")`,
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 12px center',
                paddingRight: '36px',
              }}
            >
              <option value="">Choose an endpoint...</option>
              {ENDPOINTS.filter(ep => ep.version !== 'v2' || v2DarkLaunchEnabled).map(ep => ep && (
                <option key={ep.id} value={ep.id}>
                  {ep.name} ({ep.creditCost} credit{ep.creditCost !== 1 ? 's' : ''})
                </option>
              ))}
            </select>
          </div>
          {endpoint && (
            <p className="text-xs text-ink/50 dark:text-white/50">{endpoint.description}</p>
          )}
        </div>
      )}

      {/* Parameter Inputs */}
      {endpoint && isEditable && (
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-ink dark:text-white">Parameters</h3>
          <div className="space-y-3 p-4 bg-white dark:bg-transparent rounded-lg border border-ink/8 dark:border-white/10">
            {endpoint.parameters.map(param => (
              <div key={param.name}>
                <label className="block text-xs font-bold text-ink dark:text-white mb-1.5">
                  {param.name
                    .split('_')
                    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
                    .join(' ')}
                  {param.required && <span className="text-semantic-error ml-1">*</span>}
                </label>
                <input
                  type={param.type === 'number' ? 'number' : 'text'}
                  value={parameters[param.name] || ''}
                  onChange={e => handleParameterChange(param.name, e.target.value)}
                  placeholder={param.placeholder || param.example}
                  disabled={disableEditing}
                  className={cn(
                    'w-full px-3 py-2 rounded-lg border bg-white dark:bg-white/5 text-ink dark:text-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-teal transition-all',
                    validationErrors[param.name]
                      ? 'border-semantic-error/50 focus:ring-semantic-error/30'
                      : 'border-ink/10 dark:border-white/10 focus:ring-teal focus:border-transparent'
                  )}
                />
                {validationErrors[param.name] && (
                  <p className="text-xs text-semantic-error mt-1 flex items-start gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                    {validationErrors[param.name]}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Simulation Controls */}
      {endpoint && isEditable && (
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-ink dark:text-white">Simulation Settings</h3>
          <div className="p-4 bg-white dark:bg-transparent rounded-lg border border-ink/8 dark:border-white/10">
            <label className="block text-xs font-bold text-ink dark:text-white mb-1.5">
              Simulate Response Status
            </label>
            <div className="relative">
              <select
                value={simulateStatus}
                onChange={e => setSimulateStatus(Number(e.target.value))}
                disabled={disableEditing}
                className="w-full px-3 py-2 rounded-lg border border-ink/10 dark:border-white/10 bg-white dark:bg-white/5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent transition-all appearance-none cursor-pointer disabled:opacity-50"
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 12 12'%3E%3Cpath fill='%231D1C39' d='M1 4l5 5 5-5'/%3E%3C/svg%3E")`,
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 12px center',
                  paddingRight: '32px',
                }}
              >
                <option value={200}>200 OK (Success)</option>
                <option value={400}>400 Bad Request</option>
                <option value={401}>401 Unauthorized</option>
                <option value={402}>402 Payment Required</option>
                <option value={429}>429 Too Many Requests</option>
                <option value={500}>500 Internal Server Error</option>
              </select>
            </div>
            <p className="text-[10px] text-ink/50 dark:text-white/50 mt-1.5">
              Use this to test how your integration handles different API errors.
            </p>
          </div>
        </div>
      )}

      {/* Code Samples */}
      {endpoint && (
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-ink dark:text-white">Code Samples</h3>
          <div className="border border-ink/8 dark:border-white/10 rounded-lg overflow-hidden bg-white dark:bg-transparent">
            {/* Tabs */}
            <div className="flex border-b border-ink/8 dark:border-white/10">
              {(['curl', 'python', 'nodejs', 'graphql'] as const).map(lang => (
                <button
                  key={lang}
                  onClick={() => setActiveCodeTab(lang)}
                  className={cn(
                    'flex-1 px-4 py-2 text-xs font-bold transition-colors relative',
                    activeCodeTab === lang
                      ? 'text-teal bg-teal/5'
                      : 'text-ink/60 dark:text-white/60 hover:text-ink/80 dark:text-white/80'
                  )}
                >
                  {lang === 'curl' && 'cURL'}
                  {lang === 'python' && 'Python'}
                  {lang === 'nodejs' && 'Node.js'}
                  {lang === 'graphql' && 'GraphQL'}
                  {activeCodeTab === lang && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-teal" />
                  )}
                </button>
              ))}
            </div>

            {/* Code Content */}
            <div className="relative bg-ink text-white p-4">
              <pre className="text-xs font-mono overflow-x-auto">
                <code>{codeSamples[activeCodeTab]}</code>
              </pre>
              <button
                onClick={() =>
                  copyToClipboard(codeSamples[activeCodeTab], `code-${activeCodeTab}`)
                }
                aria-label="Copy code sample"
                title="Copy code sample"
                className="absolute top-3 right-3 p-2 rounded-lg hover:bg-white/10 transition-colors text-white/70 hover:text-white"
              >
                {copiedId === `code-${activeCodeTab}` ? (
                  <Check className="w-4 h-4 text-teal" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pre-Call Cost Estimation Preview */}
      {endpoint && isEditable && !hideExecuteButton && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 rounded-xl border border-teal/20 bg-teal/5">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-teal/20 flex items-center justify-center flex-shrink-0">
              <Coins className="w-4 h-4 text-teal" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-ink dark:text-white flex items-center gap-2">
                Estimated Cost
                <span className="text-[10px] uppercase tracking-wider font-black bg-teal/10 text-teal px-1.5 py-0.5 rounded">PRE-CALL</span>
              </h4>
              <p className="text-xs text-ink/60 dark:text-white/60 mt-0.5">Will be deducted from your credit balance</p>
            </div>
          </div>
          <div className="text-right flex items-center sm:block">
            <div className="text-sm font-bold text-ink dark:text-white">
              {endpoint.creditCost} {endpoint.creditCost === 1 ? 'Credit' : 'Credits'}
            </div>
          </div>
        </div>
      )}

      {/* Execute Button */}
      {endpoint && !hideExecuteButton && isEditable && (
        <button
          onClick={handleExecute}
          disabled={!isFormValid || loading}
          className="w-full flex items-center justify-center gap-2 bg-teal text-ink dark:text-white px-6 py-3 rounded-lg font-bold hover:bg-teal-ice transition-all shadow-[0_4px_14px_rgba(70,189,198,0.3)] disabled:opacity-50 disabled:cursor-wait"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Executing...
            </>
          ) : (
            <>
              <Play className="w-4 h-4" />
              Execute Request
            </>
          )}
        </button>
      )}

      {/* Response Display */}
      {(response || responseError) && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-ink dark:text-white">Response</h3>
            <span className="text-xs font-mono text-ink/60 dark:text-white/60">
              {responseTime}ms
            </span>
          </div>

          {responseError ? (
            <div className="p-4 rounded-lg border border-semantic-error/20 bg-semantic-error/5 shadow-inner">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-semantic-error flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-sm font-bold text-semantic-error">API Error</p>
                    {responseError.code && (
                      <code className="text-[10px] font-bold text-semantic-error bg-semantic-error/20 px-1.5 py-0.5 rounded">
                        {responseError.code}
                      </code>
                    )}
                  </div>
                  <p className="text-xs text-semantic-error/80 mb-3 leading-relaxed">
                    {responseError.message}
                  </p>
                  <a 
                    href="/docs#errors" 
                    target="_blank"
                    className="inline-flex text-xs font-bold text-semantic-error hover:text-white transition-colors underline underline-offset-2"
                  >
                    View Troubleshooting Guide ↗
                  </a>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {Object.keys(responseHeaders).length > 0 && (
                <div className="p-3 rounded-lg border border-ink/8 dark:border-white/10 bg-ink text-white/80">
                  <h4 className="text-[10px] font-bold text-teal mb-2 uppercase tracking-wider">Headers</h4>
                  <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[11px] font-mono">
                    {Object.entries(responseHeaders).map(([key, value]) => (
                      <div key={key} className="contents">
                        <span className="text-white/60">{key}:</span>
                        <span className="text-white truncate">{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="p-4 rounded-lg border border-ink/8 dark:border-white/10 bg-ink text-white">
                <pre className="text-xs font-mono overflow-x-auto">
                  <code>{JSON.stringify(response, null, 2)}</code>
                </pre>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
