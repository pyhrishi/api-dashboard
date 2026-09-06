import { NextRequest, NextResponse } from 'next/server';
import { resolveEndpoint } from '@/lib/gateway/router';
import { logRequest } from '@/lib/gateway/logger';
import { checkCache, setCache, generateCacheKey, checkIdempotency, setIdempotency } from '@/lib/gateway/cache';
import { checkNegativeCache, recordNegativeMiss, registerNegativeHit, getNegativeCacheStats } from '@/lib/gateway/negativeCache';
import { getBounceStats, recordBounce, isSuppressed, type BounceType } from '@/lib/gateway/bounceFeedback';
import { callSandboxAPI, isAPIError, type APIResponse, type APIError } from '@/lib/sandboxAPI';
import { getCircuitState, recordSuccess, recordFailure } from '@/lib/gateway/circuitBreaker';
import { deductCredits, calculateVolumeDiscount, getApiKeyRecord } from '@/lib/gateway/billing';
import { detectPrivacyFramework, applyPrivacyMasking, enforceOptOutPropagation } from '@/lib/gateway/privacy';
import { enforceSOC2Controls, attachISO27001Headers, enforceDDoSProtection, enforceMSAControls, enforceDPAControls, enforceFraudDetection } from '@/lib/gateway/security';
import { inspectPayload } from '@/lib/gateway/waf';
import { Logger } from '@/lib/gateway/logger';
import { provisionDataShare, listDataShares, revokeDataShare, type DataShareDataset } from '@/lib/gateway/dataSharing';
import { createAsyncJob, getAsyncJob, listAsyncJobs, cancelAsyncJob } from '@/lib/gateway/asyncJobs';
import { resolveStreamRow, normalizeStreamInputs, kindForEndpoint, MAX_STREAM_INPUTS, STREAM_ROW_DELAY_MS } from '@/lib/gateway/streamEnrich';
import { getAllPartners, getPartnerDashboard, lookupPartner, attributeReferral, recordRevenueEvent, processMonthEndPayouts } from '@/lib/gateway/partnerRevenue';
import { generateForecastReport, forecastCapacity, getCurrentUsageSnapshot, type ForecastHorizon, type RegionId, type ResourceType } from '@/lib/gateway/capacityForecast';
import { API_BASE_URL } from '@/lib/api-config';

async function handleRequest(request: NextRequest, { params }: { params: { route: string[] } }) {
  const startTime = Date.now();
  const path = `/v1/${params.route.join('/')}`;
  const traceId = `trace_${Math.random().toString(36).substring(2, 15)}`;
  
  // Headers injected by middleware
  const requestId = request.headers.get('x-request-id') || `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const apiKey = request.headers.get('x-api-key') || '';
  const clientIp = request.headers.get('x-forwarded-for') || 'unknown';
  const keyRecord = getApiKeyRecord(apiKey);

  // 1. Edge Firewall: Layer 7 DDoS Adaptive Mitigation
  const ddosCheck = enforceDDoSProtection(clientIp);
  if (!ddosCheck.allowed) {
    const status = ddosCheck.errorCode === 'DDOS_BLACKHOLE' ? 403 : 429;
    return NextResponse.json({
      success: false,
      error: {
        code: ddosCheck.errorCode,
        message: ddosCheck.error
      },
      metadata: { requestId, timestamp: Date.now() }
    }, { 
      status, 
      headers: { 
        'Retry-After': '5',
        'X-Request-Id': requestId
      } 
    });
  }

  const limit = request.headers.get('X-RateLimit-Limit') || '100';
  const remaining = request.headers.get('X-RateLimit-Remaining') || '99';
  const reset = request.headers.get('X-RateLimit-Reset') || '0';

  // Load Balancer Simulation
  const regions = ['us-east-1', 'eu-west-1', 'ap-south-1'];
  const nodes = ['a', 'b', 'c'];

  // A key's "home region" is deterministic (stable per account), NOT random per request.
  // Random regions made consecutive calls look like impossible travel and spuriously locked
  // the key via the fraud detector — breaking normal repeated use (e.g. the Enrichment Studio).
  const keyHash = Array.from(apiKey).reduce((h, ch) => (Math.imul(h, 31) + ch.charCodeAt(0)) | 0, 0);
  const homeRegionIndex = Math.abs(keyHash) % regions.length;

  // Data Localization & Residency Check
  let selectedRegion = regions[homeRegionIndex];
  const forcedRegion = request.headers.get('x-force-region');

  if (keyRecord?.dataResidency) {
    const requiredRegion = keyRecord.dataResidency === 'EU' ? 'eu-west-1' 
                         : keyRecord.dataResidency === 'IN' ? 'ap-south-1' 
                         : 'us-east-1';
    
    if (forcedRegion && forcedRegion !== requiredRegion) {
       // Cross-border violation
       return NextResponse.json({
         success: false,
         error: {
           code: 'DATA_LOCALIZATION_VIOLATION',
           message: `Cross-border data transfer prohibited. API Key is legally bound to ${keyRecord.dataResidency} residency.`
         },
         metadata: { requestId, timestamp: Date.now() }
       }, { status: 451 });
    }
    // Automatically route to required region
    selectedRegion = requiredRegion;
  } else if (forcedRegion && regions.includes(forcedRegion)) {
    selectedRegion = forcedRegion;
  }
  const selectedNode = nodes[Math.abs(keyHash >> 4) % nodes.length];
  const serverNodeId = `${selectedRegion}-${selectedNode}`;

  const responseHeaders: Record<string, string> = {
    'X-RateLimit-Limit': limit,
    'X-RateLimit-Remaining': remaining,
    'X-RateLimit-Reset': reset,
    'X-Served-By': `zinbit-node-${serverNodeId}`,
    'X-Region': selectedRegion,
    'X-Request-Id': requestId,
  };

  // ISO 27001 Security Headers
  attachISO27001Headers(responseHeaders);

  // Zero-Copy Data Share Route Handler
  // Handles /v1/data-shares/{snowflake|bigquery} outside the normal pipeline
  const routeSegments = params.route;
  if (routeSegments[0] === 'data-shares') {
    const target = routeSegments[1] as 'snowflake' | 'bigquery';

    if (target !== 'snowflake' && target !== 'bigquery') {
      return NextResponse.json({
        success: false,
        error: { code: 'INVALID_TARGET', message: 'Data share target must be "snowflake" or "bigquery".' }
      }, { status: 400, headers: responseHeaders });
    }

    // Revoke: DELETE /v1/data-shares/{target}/{shareId}
    if (request.method === 'DELETE' && routeSegments[2]) {
      const revoke = revokeDataShare(routeSegments[2]);
      return NextResponse.json(
        { success: revoke.success, error: revoke.error },
        { status: revoke.success ? 200 : 404, headers: responseHeaders }
      );
    }

    // List: GET /v1/data-shares/{target}
    if (request.method === 'GET') {
      const shares = listDataShares();
      return NextResponse.json(
        { success: true, data: { shares }, metadata: { requestId, timestamp: Date.now() } },
        { status: 200, headers: responseHeaders }
      );
    }

    // Provision: POST /v1/data-shares/{target}
    if (request.method === 'POST') {
      let body: Record<string, unknown> = {};
      try { body = await request.json(); } catch {}

      const result = await provisionDataShare({
        target,
        accountIdentifier: String(body.account_identifier ?? body.project_id ?? ''),
        dataset: (typeof body.dataset === 'string' ? body.dataset : 'b2b_contacts') as DataShareDataset,
        apiKey,
      });

      return NextResponse.json(
        { success: result.success, data: result, metadata: { requestId, timestamp: Date.now() } },
        { status: result.success ? 201 : 400, headers: responseHeaders }
      );
    }
  }

  // ── Async Job API Routes ────────────────────────────────────────────────
  // Handles /v1/jobs/* — create, poll, list, cancel — outside the main pipeline.
  if (routeSegments[0] === 'jobs') {
    const jobId = routeSegments[1];

    // Create: POST /v1/jobs
    if (!jobId && request.method === 'POST') {
      let body: Record<string, unknown> = {};
      try { body = await request.json(); } catch {}
      // Accept inputs as a JSON array or a comma/newline-delimited string (Explorer sends a string).
      const rawInputs = body.inputs;
      const inputs = Array.isArray(rawInputs)
        ? rawInputs
        : typeof rawInputs === 'string'
          ? rawInputs.replace(/^\s*\[|\]\s*$/g, '').split(/[\n,]/).map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean)
          : rawInputs;
      const result = createAsyncJob({
        apiKey,
        endpoint: typeof body.endpoint === 'string' ? body.endpoint : 'people-search',
        inputs,
        perRowCost: typeof body.per_row_cost === 'number' ? body.per_row_cost : 1,
      });
      if (!result.success) {
        const status = result.code === 'PAYMENT_REQUIRED' ? 402 : result.code === 'JOB_TOO_LARGE' ? 413 : 400;
        return NextResponse.json({ success: false, error: { code: result.code, message: result.message } }, { status, headers: responseHeaders });
      }
      return NextResponse.json({ success: true, data: result.job, metadata: { requestId, timestamp: Date.now() } }, { status: 202, headers: responseHeaders });
    }

    // List: GET /v1/jobs
    if (!jobId && request.method === 'GET') {
      const jobs = listAsyncJobs(apiKey);
      return NextResponse.json({ success: true, data: { jobs }, metadata: { requestId, timestamp: Date.now() } }, { status: 200, headers: responseHeaders });
    }

    // Cancel: POST /v1/jobs/{id}/cancel
    if (jobId && routeSegments[2] === 'cancel' && request.method === 'POST') {
      const result = cancelAsyncJob(jobId);
      if (!result.success) {
        const status = result.code === 'NOT_FOUND' ? 404 : 409;
        return NextResponse.json({ success: false, error: { code: result.code, message: result.message } }, { status, headers: responseHeaders });
      }
      return NextResponse.json({ success: true, data: result.job, metadata: { requestId, timestamp: Date.now() } }, { status: 200, headers: responseHeaders });
    }

    // Poll: GET /v1/jobs/{id}
    if (jobId && request.method === 'GET') {
      const job = getAsyncJob(jobId);
      if (!job) {
        return NextResponse.json({ success: false, error: { code: 'NOT_FOUND', message: `No job with id ${jobId}.` } }, { status: 404, headers: responseHeaders });
      }
      return NextResponse.json({ success: true, data: job, metadata: { requestId, timestamp: Date.now() } }, { status: 200, headers: responseHeaders });
    }

    return NextResponse.json({ success: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'Unsupported method or path for /v1/jobs.' } }, { status: 405, headers: responseHeaders });
  }

  // ── Streaming Inline Enrichment ─────────────────────────────────────────────
  // POST /v1/enrich/stream — flush each row's result as NDJSON the moment it
  // resolves, instead of waiting for the whole batch. Low-latency inline path.
  if (routeSegments[0] === 'enrich' && routeSegments[1] === 'stream') {
    if (request.method !== 'POST') {
      return NextResponse.json({ success: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'Use POST /v1/enrich/stream.' } }, { status: 405, headers: responseHeaders });
    }
    let body: Record<string, unknown> = {};
    try { body = await request.json(); } catch {}
    const inputs = normalizeStreamInputs(body.inputs);
    const kind = kindForEndpoint(typeof body.endpoint === 'string' ? body.endpoint : 'people-search');

    if (inputs.length === 0) {
      return NextResponse.json({ success: false, error: { code: 'INVALID_PARAMETERS', message: 'Provide a non-empty "inputs" array or delimited string.' } }, { status: 400, headers: responseHeaders });
    }
    if (inputs.length > MAX_STREAM_INPUTS) {
      return NextResponse.json({ success: false, error: { code: 'STREAM_TOO_LARGE', message: `A stream accepts at most ${MAX_STREAM_INPUTS} inputs.` } }, { status: 413, headers: responseHeaders });
    }
    const charge = deductCredits(apiKey, inputs.length);
    if (!charge.success) {
      return NextResponse.json({ success: false, error: { code: 'PAYMENT_REQUIRED', message: charge.error ?? 'Insufficient credits for this stream.' } }, { status: 402, headers: responseHeaders });
    }

    const encoder = new TextEncoder();
    const line = (obj: unknown) => encoder.encode(JSON.stringify(obj) + '\n');
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let matched = 0, missed = 0;
        controller.enqueue(line({ type: 'start', total: inputs.length, credits_charged: inputs.length, kind }));
        for (let i = 0; i < inputs.length; i++) {
          const row = resolveStreamRow(kind, inputs[i], i);
          if (row.status === 'matched') matched++; else if (row.status === 'missed') missed++;
          controller.enqueue(line(row));
          // Pace the stream so rows arrive progressively (visible, low-latency feel).
          await new Promise((r) => setTimeout(r, STREAM_ROW_DELAY_MS));
        }
        controller.enqueue(line({ type: 'end', total: inputs.length, matched, missed }));
        controller.close();
      },
    });

    return new Response(stream, {
      status: 200,
      headers: { ...responseHeaders, 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' },
    });
  }

  // ── Partner & Affiliate API Routes ──────────────────────────────────────
  // Handles /v1/partner/* outside the main billing pipeline
  if (routeSegments[0] === 'partner') {
    const sub = routeSegments[1];

    // GET /v1/partner/list — list all registered partners
    if (sub === 'list' && request.method === 'GET') {
      return NextResponse.json(
        { success: true, data: { partners: getAllPartners() }, metadata: { requestId, timestamp: Date.now() } },
        { status: 200, headers: responseHeaders }
      );
    }

    // GET /v1/partner/dashboard?id=prt_xxx  — full dashboard for a partner
    if (sub === 'dashboard' && request.method === 'GET') {
      const id = new URL(request.url).searchParams.get('id') || '';
      const dashboard = getPartnerDashboard(id);
      if (!dashboard) return NextResponse.json({ success: false, error: { code: 'NOT_FOUND', message: 'Partner not found.' } }, { status: 404, headers: responseHeaders });
      return NextResponse.json({ success: true, data: dashboard, metadata: { requestId, timestamp: Date.now() } }, { status: 200, headers: responseHeaders });
    }

    // GET /v1/partner/lookup?code=APOLLO2026 — resolve partner by referral code
    if (sub === 'lookup' && request.method === 'GET') {
      const code = new URL(request.url).searchParams.get('code') || '';
      const partner = lookupPartner(code);
      if (!partner) return NextResponse.json({ success: false, error: { code: 'NOT_FOUND', message: `Referral code '${code}' not found.` } }, { status: 404, headers: responseHeaders });
      return NextResponse.json({ success: true, data: partner, metadata: { requestId, timestamp: Date.now() } }, { status: 200, headers: responseHeaders });
    }

    // POST /v1/partner/attribute — link an API key to a partner referral code
    if (sub === 'attribute' && request.method === 'POST') {
      let body: Record<string, unknown> = {};
      try { body = await request.json(); } catch {}
      const result = attributeReferral(String(body.api_key ?? ''), String(body.referral_code ?? ''));
      return NextResponse.json(
        { success: result.success, data: result, metadata: { requestId, timestamp: Date.now() } },
        { status: result.success ? 200 : 400, headers: responseHeaders }
      );
    }

    // POST /v1/partner/payout/process — trigger month-end payout batch
    if (sub === 'payout' && routeSegments[2] === 'process' && request.method === 'POST') {
      const payouts = processMonthEndPayouts();
      return NextResponse.json(
        { success: true, data: { payouts_processed: payouts.length, payouts }, metadata: { requestId, timestamp: Date.now() } },
        { status: 200, headers: responseHeaders }
      );
    }
  }

  // ── Infrastructure Capacity Forecast Routes ──────────────────────────────────
  if (routeSegments[0] === 'infra') {
    const sub = routeSegments[1];

    // GET /v1/infra/forecast?horizon=24h  — full multi-region report
    if (sub === 'forecast' && request.method === 'GET') {
      const qs = new URL(request.url).searchParams;
      const horizon = (qs.get('horizon') || '24h') as ForecastHorizon;
      const report = generateForecastReport(horizon);
      return NextResponse.json(
        { success: true, data: report, metadata: { requestId, timestamp: Date.now() } },
        { status: 200, headers: responseHeaders }
      );
    }

    // GET /v1/infra/snapshot — live telemetry snapshot for all regions
    if (sub === 'snapshot' && request.method === 'GET') {
      const snapshot = getCurrentUsageSnapshot();
      return NextResponse.json(
        { success: true, data: { snapshot }, metadata: { requestId, timestamp: Date.now() } },
        { status: 200, headers: responseHeaders }
      );
    }

    // GET /v1/infra/resource?region=us-east-1&resource=cpu&horizon=6h
    if (sub === 'resource' && request.method === 'GET') {
      const qs = new URL(request.url).searchParams;
      const region = (qs.get('region') || 'us-east-1') as RegionId;
      const resource = (qs.get('resource') || 'cpu') as ResourceType;
      const horizon = (qs.get('horizon') || '6h') as ForecastHorizon;
      const fc = forecastCapacity(region, resource, horizon);
      return NextResponse.json(
        { success: true, data: fc, metadata: { requestId, timestamp: Date.now() } },
        { status: 200, headers: responseHeaders }
      );
    }
  }

  // Negative-cache stats — a free meta endpoint reporting credits saved by
  // remembering misses. Handled before route resolution + billing.
  if (path === '/v1/cache/negative' && request.method === 'GET') {
    responseHeaders['X-Credits-Cost'] = '0';
    return NextResponse.json(
      { success: true, data: getNegativeCacheStats(), metadata: { requestId, timestamp: Date.now() } },
      { status: 200, headers: responseHeaders },
    );
  }

  // Bounce feedback loop — report a bounce (POST) or read the registry (GET).
  // Free meta endpoint; handled before route resolution + billing.
  if (path === '/v1/feedback/bounce') {
    responseHeaders['X-Credits-Cost'] = '0';
    if (request.method === 'GET') {
      return NextResponse.json(
        { success: true, data: getBounceStats(), metadata: { requestId, timestamp: Date.now() } },
        { status: 200, headers: responseHeaders },
      );
    }
    if (request.method === 'POST') {
      let parsed: unknown;
      try { parsed = await request.clone().json(); } catch { parsed = {}; }
      const body = (typeof parsed === 'object' && parsed !== null ? parsed : {}) as Record<string, unknown>;
      const email = typeof body.email === 'string' ? body.email : '';
      const typeRaw = typeof body.type === 'string' ? body.type : 'hard';
      const type = (['hard', 'soft', 'complaint'].includes(typeRaw) ? typeRaw : 'hard') as BounceType;
      if (!email) {
        return NextResponse.json(
          { success: false, error: { code: 'INVALID_PARAMETERS', message: 'Provide an "email" to report a bounce.' } },
          { status: 400, headers: responseHeaders },
        );
      }
      const record = recordBounce(email, type);
      return NextResponse.json(
        { success: true, data: { reported: record, suppressed: isSuppressed(email) }, metadata: { requestId, timestamp: Date.now() } },
        { status: 200, headers: responseHeaders },
      );
    }
    return NextResponse.json(
      { success: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'Use GET or POST /v1/feedback/bounce.' } },
      { status: 405, headers: responseHeaders },
    );
  }

  // 1. Route resolution
  const endpoint = resolveEndpoint(path);

  if (!endpoint || endpoint.method !== request.method) {
    const duration = Date.now() - startTime;
    logRequest(requestId, request.method, path, 404, duration);
    
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: `Endpoint ${request.method} ${path} does not exist.`,
        },
        metadata: {
          requestId,
          timestamp: Date.now(),
        },
      },
      { status: 404, headers: responseHeaders }
    );
  }

  // 2. Parse Parameters
  let parameters: Record<string, unknown> = {};
  let body: unknown;
  
  try {
    if (request.method === 'GET') {
      const searchParams = request.nextUrl.searchParams;
      searchParams.forEach((value, key) => {
        parameters[key] = value;
      });
    } else {
      try {
        const clonedReq = request.clone();
        body = await clonedReq.json();
        parameters = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;
      } catch {
        // Ignored for empty bodies
      }
    }
  } catch {
    // Failed to parse body
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'BAD_REQUEST',
          message: 'Invalid JSON body.',
        },
        metadata: {
          requestId,
          timestamp: Date.now(),
        },
      },
      { status: 400, headers: responseHeaders }
    );
  }

  // Log incoming request with PII auto-redaction
  Logger.info('API Request Initiated', {
    method: request.method,
    url: request.url,
    ip: clientIp,
    parameters
  });

  // 1.5 API Abuse & Fraud Detection (Impossible Travel / Geo-Velocity)
  if (apiKey) {
    const fraudContext = enforceFraudDetection(apiKey, selectedRegion);
    if (!fraudContext.allowed) {
      Logger.warn(`Fraud Detected: ${fraudContext.error}`, { apiKey, clientIp, selectedRegion });
      return NextResponse.json({
        success: false,
        error: {
          code: fraudContext.errorCode || 'FRAUD_DETECTED',
          message: fraudContext.error,
        },
        metadata: { requestId, timestamp: Date.now() }
      }, { status: 403 });
    }
  }

  // 1.8 Edge WAF (Web Application Firewall) (WAF) & Bug Bounty Safe Harbor
  const wafResult = inspectPayload(request.url, request.headers, body);
  if (wafResult.blocked) {
    return NextResponse.json({
      success: false,
      error: {
        code: wafResult.reason,
        message: 'Request blocked by Web Application Firewall (WAF). Malicious payload detected.'
      },
      metadata: { requestId, timestamp: Date.now() }
    }, { status: 406, headers: responseHeaders });
  }

  // 3. Process Caching & Idempotency
  const simulateStatusStr = request.headers.get('x-simulate-status');
  const simulateStatus = simulateStatusStr ? Number(simulateStatusStr) : undefined;
  
  // 2. SOC 2 / ISO 27001 Security Controls (IP Allowlist, ISMS, Revocation & Audit Logging)
  const securityContext = enforceSOC2Controls(request, apiKey, keyRecord?.status);
  if (!securityContext.allowed) {
    return NextResponse.json({
      success: false,
      error: {
        code: securityContext.errorCode || 'FORBIDDEN',
        message: securityContext.error,
      },
      metadata: { requestId, timestamp: Date.now(), auditId: securityContext.auditId }
    }, { status: 403 });
  }

  // 2.5 Master Service Agreement (MSA) & DPA Checks
  const simulatedCountry = selectedRegion === 'eu-west-1' ? 'DE' : selectedRegion === 'ap-south-1' ? 'IN' : 'US';
  const countryCode = request.headers.get('x-country-code') || simulatedCountry;
  const privacyFramework = detectPrivacyFramework(countryCode);

  if (keyRecord) {
    const msaContext = enforceMSAControls(keyRecord.msaStatus);
    if (!msaContext.allowed) {
      return NextResponse.json({
        success: false,
        error: {
          code: msaContext.errorCode,
          message: msaContext.error,
        },
        metadata: { requestId, timestamp: Date.now(), auditId: securityContext.auditId }
      }, { status: 403 });
    }

    const dpaContext = enforceDPAControls(keyRecord.dpaStatus, privacyFramework);
    if (!dpaContext.allowed) {
      return NextResponse.json({
        success: false,
        error: {
          code: dpaContext.errorCode,
          message: dpaContext.error,
        },
        metadata: { requestId, timestamp: Date.now(), auditId: securityContext.auditId }
      }, { status: 451 }); // 451 Unavailable For Legal Reasons
    }
  }

  // 3. Idempotency Check for POST
  const idempotencyKey = request.headers.get('idempotency-key');
  let result;
  let cacheHeader = 'MISS';
  let isIdempotentReplay = false;

  if (request.method === 'POST' && idempotencyKey) {
    const idemResult = checkIdempotency(apiKey, idempotencyKey);
    if (idemResult.hit && !simulateStatus) {
      result = { status: 200, data: idemResult.payload, duration: 5, timestamp: Date.now() } as APIResponse;
      isIdempotentReplay = true;
    }
  }

  // Negative-match cache: a repeat of a known-miss GET is served free, BEFORE
  // billing — so repeat unresolved lookups don't cost credits.
  if (!result && request.method === 'GET' && !simulateStatus && !isIdempotentReplay && endpoint) {
    const negKey = generateCacheKey(path, parameters);
    const neg = checkNegativeCache(negKey);
    if (neg.hit) {
      const wouldCharge = calculateVolumeDiscount(apiKey, endpoint.creditCost || 1).cost;
      registerNegativeHit(negKey, wouldCharge);
      result = { status: neg.status ?? 200, data: neg.payload, duration: 3, timestamp: Date.now() } as APIResponse;
      responseHeaders['X-Negative-Cache'] = 'HIT';
      responseHeaders['X-Credits-Cost'] = '0';
      const bal = (keyRecord as { creditBalance?: number } | null)?.creditBalance;
      if (typeof bal === 'number') responseHeaders['X-Credits-Remaining'] = String(bal);
    }
  }

  let appliedCreditCost = 0;
  let remainingCredits = 0;
  let appliedDiscount = 0;

  // 4. Metered Billing Engine
  if (!result && !isIdempotentReplay && endpoint) {
    let baseCreditCost = endpoint.creditCost || 1;
    // Scale batch requests
    if (endpoint.id === 'batch-company-enrich' && Array.isArray(parameters.domains)) {
      baseCreditCost = baseCreditCost * Math.max(1, parameters.domains.length);
    }

    // Apply Volume Discount Automation
    const { cost: finalCreditCost, discountPct } = calculateVolumeDiscount(apiKey, baseCreditCost);

    const billingResult = deductCredits(apiKey, finalCreditCost);
    appliedCreditCost = finalCreditCost;
    remainingCredits = billingResult.remaining;
    appliedDiscount = discountPct;
    
    if (!billingResult.success) {
      const duration = Date.now() - startTime;
      logRequest(requestId, request.method, path, 402, duration);
      
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'PAYMENT_REQUIRED',
            message: billingResult.error,
          },
          metadata: {
            requestId,
            timestamp: Date.now(),
          },
        },
        { status: 402, headers: responseHeaders }
      );
    }
    
    // Attach billing headers to successful responses
    responseHeaders['X-Credits-Cost'] = finalCreditCost.toString();
    responseHeaders['X-Credits-Remaining'] = billingResult.remaining.toString();
    if (discountPct > 0) {
      responseHeaders['X-Credits-Discount-Pct'] = discountPct.toString();
    }
  }

  // Async Processing (202 Accepted)
  const preferHeader = request.headers.get('prefer');
  if (preferHeader?.includes('respond-async') && !result) {
    const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    result = {
      status: 202,
      data: {
        job_id: jobId,
        status: 'pending',
        status_url: `${API_BASE_URL}/v1/jobs/${jobId}`,
        message: 'Request accepted for asynchronous processing.'
      },
      duration: 1,
      timestamp: Date.now()
    } as APIResponse;
  }

  // Edge caching for GET
  const cacheKey = generateCacheKey(path, parameters);
  if (!result) {
    // Check cache, do not allow stale yet
    const cacheResult = checkCache(cacheKey, false);
    
    if (cacheResult.hit && !simulateStatus && request.method === 'GET') {
      result = { status: 200, data: cacheResult.payload, duration: 5, timestamp: Date.now() } as APIResponse;
      cacheHeader = 'HIT';
    } else {
      const circuitState = getCircuitState('sandboxAPI');
      
      if (circuitState === 'OPEN') {
        result = {
          isAPIError: true,
          status: 503,
          statusText: 'Service Unavailable',
          error: 'Circuit Breaker is OPEN. Downstream service is currently unavailable.',
          errorCode: 'SERVICE_UNAVAILABLE',
          timestamp: Date.now(),
          duration: 0,
          requestId,
          data: null,
        } as APIError;
        responseHeaders['X-Circuit-Breaker'] = 'OPEN';
      } else {
        try {
          result = await callSandboxAPI({
            endpoint,
            parameters,
            apiKey,
            simulateStatus,
            isIdempotentReplay,
          });
        } catch (err: unknown) {
          // If it throws an APIError (which it does for simulateStatus >= 400), catch it here
          const thrownApiError = typeof err === 'object' && err !== null && (err as { isAPIError?: boolean }).isAPIError;
          if (thrownApiError) {
            result = err as APIError;
          } else {
            result = {
              isAPIError: true,
              status: 500,
              statusText: 'Internal Server Error',
              error: err instanceof Error ? err.message : 'Unknown error',
              errorCode: 'INTERNAL_ERROR',
              timestamp: Date.now(),
              duration: 0,
              requestId,
              data: null,
            } as APIError;
          }
        }
        
        // Track circuit breaker metrics
        if (isAPIError(result) && result.status >= 500) {
          recordFailure('sandboxAPI');
        } else {
          recordSuccess('sandboxAPI');
        }
      }
      
      // Graceful Degradation: Serve-stale-on-error
      if (isAPIError(result) && result.status >= 500 && request.method === 'GET') {
        const staleCache = checkCache(cacheKey, true); // explicitly allow stale
        if (staleCache.hit) {
          result = { status: 200, data: staleCache.payload, duration: 5, timestamp: Date.now() } as APIResponse;
          cacheHeader = staleCache.isStale ? 'STALE' : 'HIT';
        }
      }

      // Cache the successful payload
      if (!isAPIError(result) && !simulateStatus) {
        if (request.method === 'GET' && cacheHeader !== 'STALE') {
          setCache(cacheKey, result.data);
        } else if (request.method === 'POST' && idempotencyKey) {
          setIdempotency(apiKey, idempotencyKey, result.data);
        }
      }

      // Record a genuine coverage miss so the identical repeat GET is free.
      if (!isAPIError(result) && !simulateStatus && request.method === 'GET') {
        const payloadData = result.data as { success?: boolean } | null;
        if (payloadData && payloadData.success === false) {
          recordNegativeMiss(cacheKey, result.data, result.status);
          if (!responseHeaders['X-Negative-Cache']) responseHeaders['X-Negative-Cache'] = 'STORE';
        }
      }
    }
  }

  // Inject Cache & Idempotency Headers
  responseHeaders['X-Cache'] = cacheHeader;
  if (request.method === 'GET' && !responseHeaders['X-Negative-Cache']) {
    responseHeaders['X-Negative-Cache'] = 'MISS';
  }
  responseHeaders['X-Trace-Id'] = traceId;
  if (isIdempotentReplay) {
    responseHeaders['X-Idempotency-Replayed'] = 'true';
  }

  const duration = Date.now() - startTime;
  logRequest(requestId, request.method, path, result.status, duration);

  // Helper function to send compressed or uncompressed response
  const sendResponse = (payloadObj: unknown, statusCode: number) => {
    const jsonString = JSON.stringify(payloadObj);
    const acceptEncoding = request.headers.get('accept-encoding') || '';
    
    if (acceptEncoding.includes('gzip')) {
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(jsonString));
          controller.close();
        }
      });
      const compressedStream = stream.pipeThrough(new CompressionStream('gzip'));
      
      responseHeaders['Content-Encoding'] = 'gzip';
      responseHeaders['Content-Type'] = 'application/json';
      
      return new Response(compressedStream, {
        status: statusCode,
        headers: responseHeaders as HeadersInit,
      });
    }

    // Uncompressed fallback
    return NextResponse.json(payloadObj, { status: statusCode, headers: responseHeaders as HeadersInit });
  };

  if (isAPIError(result)) {
    return sendResponse({
      success: false,
      error: {
        code: result.errorCode || 'UNKNOWN_ERROR',
        message: result.error || result.statusText,
      },
      metadata: {
        requestId,
        auditId: securityContext.auditId,
        timestamp: result.timestamp,
      },
    }, result.status);
  }

  // Extract payload cleanly
  let payload = result.data;
  if (payload && typeof payload === 'object') {
    // If it's already wrapped in {success, data}, extract data
    if (payload.success !== undefined && payload.data !== undefined) {
      payload = payload.data;
    } else if (payload.success !== undefined) {
      // If it just has success, strip it
      const rest = { ...payload };
      delete rest.success;
      payload = rest;
    }
  }

  // Privacy enforcement applies to LIVE keys only. Sandbox (sk_test_) responses
  // are fully synthetic (no real PII) and are returned unmasked so developers can
  // see complete example payloads while testing. Live keys get DPDP/GDPR/CCPA
  // opt-out propagation + PII masking.
  const isLiveKey = apiKey.startsWith('sk_live_');
  let optOutsRemoved = 0;
  const redactionApplied = isLiveKey && privacyFramework !== 'NONE';
  if (isLiveKey) {
    // Opt-out propagation (Drop Do-Not-Sell / Right-To-Be-Forgotten records completely)
    const optOutResult = enforceOptOutPropagation(payload);
    payload = optOutResult.sanitizedData;
    optOutsRemoved = optOutResult.optOutsRemoved;

    // Mask remaining PII based on framework
    payload = applyPrivacyMasking(payload, privacyFramework);
    if (privacyFramework !== 'NONE') {
      responseHeaders['X-Privacy-Framework'] = privacyFramework;
    }
  }

  // 5. Return standard envelope
  return sendResponse({
    success: true,
    data: payload,
    metadata: {
      requestId,
      timestamp: result.timestamp,
      processingTimeMs: result.duration,
      billing: appliedCreditCost > 0 ? {
        cost: appliedCreditCost,
        remaining: remainingCredits,
        discount_applied_pct: appliedDiscount > 0 ? appliedDiscount : undefined
      } : undefined,
      compliance: {
        framework: privacyFramework,
        country_code: countryCode,
        redaction_applied: redactionApplied,
        opt_outs_honored: optOutsRemoved > 0 ? optOutsRemoved : undefined
      }
    },
  }, result.status);
}

// ─── Thin route wrapper for partner revenue attribution ───────────────────────
// After every successful billing deduction, emit an event to credit the referring partner.
async function handleRequestWithPartnerTracking(request: NextRequest, ctx: { params: { route: string[] } }) {
  const response = await handleRequest(request, ctx);
  // Best-effort: emit revenue event asynchronously (non-blocking)
  try {
    const apiKey = request.headers.get('x-api-key') || '';
    if (apiKey && response.status === 200) {
      recordRevenueEvent(apiKey, 'api_call', 0.02, 1); // $0.02 gross per call
    }
  } catch { /* swallow — never fail a request due to analytics */ }
  return response;
}

// Export supported methods (wrapped to attribute partner revenue on billed calls)
export const GET = handleRequestWithPartnerTracking;
export const POST = handleRequestWithPartnerTracking;
export const PUT = handleRequestWithPartnerTracking;
export const DELETE = handleRequestWithPartnerTracking;
