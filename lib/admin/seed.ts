/**
 * Deterministic seed for the admin prototype — realistic B2B2B customers across the
 * Zintlr products, their keys, 30 days of ledger *metadata*, wallets with top-up
 * history, access requests, sales triggers and audit. Everything derives from a
 * seeded hash so the data reads the same on every load (no `Math.random`).
 */

import { sha256Hex, keyFingerprint } from '@/lib/admin/key-hashing';
import type {
  Customer, ManagedKey, LedgerEntry, Wallet, TopUp, AccessRequest, SalesTrigger, AuditEntry, Region, Plan, FunnelStage, ProductId,
} from './types';

const DAY = 86_400_000;
const HOUR = 3_600_000;

/** Seeded PRNG: xorshift over a sha256-derived state. */
export function rng(seed: string): () => number {
  let s = parseInt(sha256Hex(seed).slice(0, 8), 16) || 1;
  return () => {
    s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
    return s / 0x100000000;
  };
}
const iso = (ms: number) => new Date(ms).toISOString();

export interface EndpointSpec { path: string; method: 'GET' | 'POST'; credits: number; weight: number }
/** Mirrors the customer console's catalog costs for the endpoints that dominate traffic. */
export const ENDPOINTS: EndpointSpec[] = [
  { path: '/v1/people/phone', method: 'GET', credits: 2, weight: 26 },
  { path: '/v1/people/resolve', method: 'POST', credits: 3, weight: 18 },
  { path: '/v1/companies/enrich', method: 'GET', credits: 1, weight: 22 },
  { path: '/v1/companies/employees', method: 'GET', credits: 2, weight: 8 },
  { path: '/v1/email/verify', method: 'GET', credits: 1, weight: 14 },
  { path: '/v1/batch/enrich', method: 'POST', credits: 5, weight: 4 },
  { path: '/v1/intent/signals', method: 'GET', credits: 2, weight: 5 },
  { path: '/v1/ip/company', method: 'GET', credits: 1, weight: 3 },
];

interface CustomerSeed {
  id: string; name: string; domain: string; products: ProductId[]; plan: Plan; region: Region; stage: FunnelStage; owner: string;
  ageDays: number; dailyCalls: number; keys: number; topUps: TopUp[] | 'trial';
  /** Wallet hit 0 two days ago — billed calls since then return 402. */
  exhaust?: boolean;
  /** Wallet is below 10% of its last top-up (sales-trigger candidate). */
  lowWallet?: boolean;
  nearExpiryKey?: boolean;
}

const OWNERS = ['Ananya Iyer', 'Marcus Lee', 'Sofia Reyes', 'Dev Malhotra'];

const CUSTOMERS: CustomerSeed[] = [
  { id: 'cus_northwind', name: 'Northwind Traders', domain: 'northwind.io', products: ['zinbit'], plan: 'Growth', region: 'US', stage: 'expanding', owner: OWNERS[1], ageDays: 210, dailyCalls: 2400, keys: 4, topUps: [{ at: '-95d', amount: 250000, kind: 'purchase' }, { at: '-62d', amount: 250000, kind: 'purchase' }, { at: '-31d', amount: 250000, kind: 'purchase' }] },
  { id: 'cus_meridian', name: 'Meridian Labs', domain: 'meridianlabs.in', products: ['zinbit'], plan: 'Trial', region: 'IN', stage: 'activated', owner: OWNERS[0], ageDays: 12, dailyCalls: 380, keys: 1, topUps: 'trial' },
  { id: 'cus_helioz', name: 'Helioz AI', domain: 'helioz.ai', products: ['zinbit', 'zintlr-intent'], plan: 'Growth', region: 'EU', stage: 'paying', owner: OWNERS[2], ageDays: 95, dailyCalls: 3900, keys: 3, topUps: [{ at: '-88d', amount: 150000, kind: 'purchase' }, { at: '-58d', amount: 150000, kind: 'purchase' }, { at: '-28d', amount: 150000, kind: 'purchase' }], nearExpiryKey: true },
  { id: 'cus_bluefin', name: 'Bluefin Payments', domain: 'bluefin-payments.com', products: ['zintlr-context', 'zinbit'], plan: 'Enterprise', region: 'US', stage: 'expanding', owner: OWNERS[1], ageDays: 400, dailyCalls: 9800, keys: 4, topUps: [{ at: '-120d', amount: 2000000, kind: 'plan_renewal' }, { at: '-30d', amount: 2000000, kind: 'plan_renewal' }] },
  { id: 'cus_arkline', name: 'Arkline', domain: 'arkline.dev', products: ['zinbit'], plan: 'Trial', region: 'IN', stage: 'signed_up', owner: OWNERS[3], ageDays: 2, dailyCalls: 0, keys: 1, topUps: 'trial' },
  { id: 'cus_contoso', name: 'Contoso Trading', domain: 'contoso-trading.com', products: ['zinbit'], plan: 'Starter', region: 'EU', stage: 'churned', owner: OWNERS[2], ageDays: 400, dailyCalls: 0, keys: 2, topUps: [{ at: '-200d', amount: 50000, kind: 'purchase' }] },
  { id: 'cus_zerodha', name: 'Zerodha', domain: 'zerodha.com', products: ['zinbit', 'zintlr-context'], plan: 'Enterprise', region: 'IN', stage: 'paying', owner: OWNERS[0], ageDays: 160, dailyCalls: 12500, keys: 3, topUps: [{ at: '-150d', amount: 1500000, kind: 'plan_renewal' }, { at: '-60d', amount: 1500000, kind: 'plan_renewal' }], exhaust: true },
  { id: 'cus_quietharbor', name: 'Quiet Harbor', domain: 'quietharbor.co', products: ['zinbit'], plan: 'Starter', region: 'US', stage: 'integrated', owner: OWNERS[3], ageDays: 45, dailyCalls: 720, keys: 2, topUps: [{ at: '-44d', amount: 50000, kind: 'purchase' }, { at: '-14d', amount: 50000, kind: 'purchase' }] },
  { id: 'cus_saffron', name: 'Saffron Retail', domain: 'saffronretail.in', products: ['zintlr-intent'], plan: 'Growth', region: 'IN', stage: 'paying', owner: OWNERS[0], ageDays: 130, dailyCalls: 1650, keys: 2, topUps: [{ at: '-120d', amount: 120000, kind: 'purchase' }, { at: '-80d', amount: 120000, kind: 'purchase' }, { at: '-40d', amount: 120000, kind: 'purchase' }], lowWallet: true },
  { id: 'cus_kestrel', name: 'Kestrel Logistics', domain: 'kestrel-logistics.com', products: ['zinbit'], plan: 'Starter', region: 'EU', stage: 'activated', owner: OWNERS[2], ageDays: 20, dailyCalls: 210, keys: 1, topUps: [{ at: '-18d', amount: 25000, kind: 'purchase' }], nearExpiryKey: true },
  { id: 'cus_lumen', name: 'Lumen Health', domain: 'lumenhealth.io', products: ['zintlr-context'], plan: 'Growth', region: 'US', stage: 'integrated', owner: OWNERS[1], ageDays: 70, dailyCalls: 1100, keys: 2, topUps: [{ at: '-65d', amount: 100000, kind: 'purchase' }, { at: '-33d', amount: 100000, kind: 'purchase' }, { at: '-2d', amount: 100000, kind: 'purchase' }] },
  { id: 'cus_veloce', name: 'Veloce Mobility', domain: 'veloce-mobility.de', products: ['zinbit'], plan: 'Trial', region: 'EU', stage: 'activated', owner: OWNERS[2], ageDays: 6, dailyCalls: 900, keys: 1, topUps: 'trial' },
  { id: 'cus_pinecrest', name: 'Pinecrest Capital', domain: 'pinecrest.capital', products: ['zintlr-intent', 'zinbit'], plan: 'Enterprise', region: 'US', stage: 'expanding', owner: OWNERS[1], ageDays: 300, dailyCalls: 6200, keys: 3, topUps: [{ at: '-90d', amount: 1000000, kind: 'plan_renewal' }, { at: '-1d', amount: 1000000, kind: 'plan_renewal' }] },
  { id: 'cus_orbit', name: 'Orbit Recruit', domain: 'orbitrecruit.com', products: ['zinbit'], plan: 'Starter', region: 'IN', stage: 'paying', owner: OWNERS[3], ageDays: 55, dailyCalls: 480, keys: 2, topUps: [{ at: '-50d', amount: 40000, kind: 'purchase' }, { at: '-22d', amount: 40000, kind: 'purchase' }] },
];

const PLAN_CREDITS: Record<Plan, number> = { Trial: 10000, Starter: 50000, Growth: 250000, Enterprise: 2000000 };
const SCOPES = ['identity:read', 'corporate:read', 'search:execute', 'email:verify', 'intent:read'];

function relIso(now: number, rel: string): string {
  const m = /^-(\d+)d$/.exec(rel);
  return iso(now - (m ? Number(m[1]) : 0) * DAY);
}

export interface SeedData {
  customers: Customer[];
  keys: ManagedKey[];
  ledger: LedgerEntry[];
  wallets: Wallet[];
  accessRequests: AccessRequest[];
  triggers: SalesTrigger[];
  audit: AuditEntry[];
}

export function seedAll(now: number = Date.now()): SeedData {
  const customers: Customer[] = [];
  const keys: ManagedKey[] = [];
  const ledger: LedgerEntry[] = [];
  const wallets: Wallet[] = [];

  CUSTOMERS.forEach((c) => {
    const r = rng(`cust:${c.id}`);
    const createdAt = now - c.ageDays * DAY - Math.floor(r() * 10) * HOUR;
    const activated = c.stage !== 'signed_up';
    const activatedAt = activated ? createdAt + Math.floor(3 + r() * 40) * 60_000 : null; // 3–43 minutes to first call
    const integrated = ['integrated', 'paying', 'expanding', 'churned'].includes(c.stage);
    const paying = ['paying', 'expanding', 'churned'].includes(c.stage);
    customers.push({
      id: c.id, name: c.name, domain: c.domain, productIds: c.products, plan: c.plan, region: c.region, stage: c.stage, owner: c.owner,
      contactEmail: `${['ops', 'platform', 'data', 'dev'][Math.floor(r() * 4)]}@${c.domain}`,
      createdAt: iso(createdAt), activatedAt: activatedAt ? iso(activatedAt) : null,
      integratedAt: integrated && activatedAt ? iso(activatedAt + Math.floor(1 + r() * 6) * DAY) : null,
      paidAt: paying && activatedAt ? iso(activatedAt + Math.floor(7 + r() * 20) * DAY) : null,
      planCredits: PLAN_CREDITS[c.plan],
    });

    // Keys
    const custKeys: ManagedKey[] = [];
    for (let i = 0; i < c.keys; i++) {
      const env = i === 0 ? 'sandbox' : 'live';
      const secret = `${env === 'live' ? 'sk_live_' : 'sk_test_'}${sha256Hex(`key:${c.id}:${i}`).slice(0, 20)}`;
      const kr = rng(`k:${c.id}:${i}`);
      const status = c.stage === 'churned' ? 'revoked' : kr() < 0.08 ? 'suspended' : 'active';
      const nearExpiry = c.nearExpiryKey && i === c.keys - 1;
      const expiresAt = nearExpiry ? iso(now + (3 + Math.floor(kr() * 8)) * DAY) : kr() < 0.4 ? iso(now + (60 + Math.floor(kr() * 300)) * DAY) : null;
      const inUse = c.dailyCalls > 0 && status === 'active';
      custKeys.push({
        id: `key_${sha256Hex(`kid:${c.id}:${i}`).slice(0, 10)}`, customerId: c.id,
        name: i === 0 ? 'Sandbox key' : ['Production', 'CRM sync', 'Lead scoring', 'Data pipeline'][i % 4],
        environment: env, fingerprint: keyFingerprint(secret), prefix: env === 'live' ? 'sk_live_' : 'sk_test_', last4: secret.slice(-4),
        scopes: SCOPES.slice(0, 2 + Math.floor(kr() * 3)), status,
        allowedIps: kr() < 0.5 ? [`203.0.113.${Math.floor(kr() * 200)}`] : [],
        creditLimit: kr() < 0.4 ? [10000, 50000, 100000][Math.floor(kr() * 3)] : null,
        rateTier: c.plan === 'Trial' ? 'Starter' : (c.plan as 'Starter' | 'Growth' | 'Enterprise'),
        expiresAt, createdAt: iso(createdAt + i * DAY),
        lastUsedAt: inUse ? iso(now - Math.floor(kr() * 6) * HOUR) : status === 'revoked' ? iso(now - 100 * DAY) : null,
        requests7d: 0, regeneratedAt: null,
      });
    }
    keys.push(...custKeys);

    // Wallet top-ups
    const topUps: TopUp[] = c.topUps === 'trial'
      ? [{ at: customers[customers.length - 1].activatedAt ?? iso(createdAt), amount: 10000, kind: 'trial_grant' }]
      : c.topUps.map((t) => ({ ...t, at: relIso(now, t.at) }));
    const funded = topUps.reduce((s, t) => s + t.amount, 0);

    // Ledger metadata — 30 days, weighted by stage; exhaust customers overshoot their funding.
    const liveKeys = custKeys.filter((k) => k.environment === 'live' && k.status !== 'revoked');
    const usable = liveKeys.length ? liveKeys : custKeys;
    const days = Math.min(30, c.ageDays);
    let consumed = 0;
    const target = days ? c.dailyCalls : 0;
    for (let d = days - 1; d >= 0 && target > 0; d--) {
      const dayStart = now - d * DAY;
      const dr = rng(`day:${c.id}:${d}`);
      // Growth curve: expanding customers ramp; trials taper.
      const ramp = c.stage === 'expanding' ? 0.7 + (days - d) / days * 0.6 : c.stage === 'activated' ? 1.3 - (days - d) / days * 0.5 : 1;
      const volume = Math.round(target * ramp * (0.8 + dr() * 0.4));
      // Sample the day (cap entries per day to keep memory sane; scale credits by the sample ratio).
      const sample = Math.min(volume, 40);
      const scale = sample ? volume / sample : 1;
      for (let i = 0; i < sample; i++) {
        const er = rng(`e:${c.id}:${d}:${i}`);
        const ep = weightedEndpoint(er());
        const key = usable[Math.floor(er() * usable.length)];
        const exhausted = Boolean(c.exhaust) && d <= 1; // last two days at zero
        let status = 200;
        const roll = er();
        if (exhausted) status = 402;
        else if (roll < 0.04) status = 404;
        else if (roll < 0.06) status = 429;
        else if (roll < 0.065) status = 500;
        else if (roll < 0.07) status = 400;
        const credits = status === 200 ? ep.credits * scale : 0;
        consumed += credits;
        ledger.push({
          requestId: `req_${sha256Hex(`r:${c.id}:${d}:${i}`).slice(0, 12)}`, customerId: c.id, keyId: key.id,
          ts: dayStart + Math.floor(er() * DAY), method: ep.method, endpoint: ep.path, status,
          latencyMs: Math.round(60 + er() * (status >= 500 ? 2400 : 320)), credits: Math.round(credits), region: c.region,
          cache: ep.method === 'GET' ? (er() < 0.22 ? 'HIT' : 'MISS') : null, idempotent: ep.method === 'POST' && er() < 0.5,
        });
        if (dayStart + DAY > now - 7 * DAY) key.requests7d += Math.round(scale);
      }
    }
    // Exhausted wallets sit at 0; low wallets at 6% of the last top-up; everyone else keeps a realistic share of funding.
    const lastTop = topUps[topUps.length - 1]?.amount ?? 0;
    const balance = c.exhaust ? 0 : c.lowWallet ? Math.round(lastTop * 0.06) : Math.max(Math.round(lastTop * 0.2), Math.round(funded - consumed) % Math.max(1, lastTop || 1) + Math.round(lastTop * 0.25));
    wallets.push({ customerId: c.id, balance, topUps });
  });

  // ── Injected abuse patterns (deep feature 2) — deterministic, in the last 24h ──
  // These are the only anomalies in the data; everything above is normal traffic.
  injectAbuse(now, keys, ledger);

  ledger.sort((a, b) => b.ts - a.ts);

  const accessRequests: AccessRequest[] = [
    mkReq(now, 'cus_meridian', 'rahul@meridianlabs.in', 'live_key', { environment: 'live', scopes: 'identity:read, corporate:read' }, 'Moving our CRM enrichment to production next week; trial results matched 91% of our sample.', ['small_company'], 6200, 380 * 7, 1, 'open', 2 * DAY),
    mkReq(now, 'cus_veloce', 'platform@veloce-mobility.de', 'limit_increase', { rateTier: 'Growth', requestsPerMinute: 600 }, 'Batch backfill of 400k records planned for the 15th; current tier throttles us at 120 rpm.', ['duplicate_ip'], 3100, 900 * 7, 1, 'needs_info', 1 * DAY, 'Which endpoints will the backfill hit? A batch endpoint plan may be cheaper than a tier bump.'),
    mkReq(now, 'cus_saffron', 'data@saffronretail.in', 'limit_increase', { creditLimit: 250000 }, 'Wallet keeps hitting zero mid-month; we want a higher monthly cap with overage.', [], 0, 1650 * 7, 2, 'open', 6 * HOUR),
    mkReq(now, 'cus_lumen', 'dev@lumenhealth.io', 'region', { region: 'EU', residency: 'eu-west-1' }, 'GDPR review requires EU-only processing for our patient-facing product.', [], 98000, 1100 * 7, 2, 'approved', 9 * DAY, undefined, { action: 'approved', actor: 'sofia.reyes@zintlr.com', reason: 'DPA addendum signed; residency pinned to eu-west-1.', at: iso(now - 8 * DAY) }),
    mkReq(now, 'cus_arkline', 'dev@arkline.dev', 'trial_gate_override', { challenge: 'phone_otp', conditions: 'small_company, duplicate_ip' }, 'Shared coworking IP; our team is 6 people. Can you waive the phone check?', ['small_company', 'duplicate_ip'], 10000, 0, 1, 'denied', 1.5 * DAY, undefined, { action: 'denied', actor: 'dev.malhotra@zintlr.com', reason: 'Phone check is a 60-second step; waivers are for verified customers only.', at: iso(now - 1.2 * DAY) }),
    mkReq(now, 'cus_kestrel', 'ops@kestrel-logistics.com', 'enterprise_feature', { feature: 'SSO (SAML)', idp: 'Okta' }, 'Security team requires SSO before we can roll the console out to 40 analysts.', [], 21000, 210 * 7, 1, 'open', 3 * DAY),
    mkReq(now, 'cus_orbit', 'dev@orbitrecruit.com', 'live_key', { environment: 'live', scopes: 'identity:read' }, 'Second live key for a separate staging environment.', [], 33000, 480 * 7, 2, 'approved', 20 * DAY, undefined, { action: 'approved', actor: 'ananya.iyer@zintlr.com', reason: 'Existing paying customer; standard request.', at: iso(now - 19.5 * DAY) }),
  ];

  const triggers: SalesTrigger[] = [
    { id: 'trg_activated_volume', name: 'Activated with real volume', kind: 'metric', metric: 'calls7d', op: '>=', value: 5000, channel: 'slack', owner: 'Sales · AE pod', enabled: true, cooldownDays: 30 },
    { id: 'trg_trial_80', name: 'Trial 80% consumed', kind: 'metric', metric: 'trialUsagePct', op: '>=', value: 80, channel: 'crm', owner: 'Sales · AE pod', enabled: true, cooldownDays: 30 },
    { id: 'trg_wallet_10', name: 'Wallet below 10%', kind: 'metric', metric: 'walletPct', op: '<=', value: 10, channel: 'crm', owner: 'Account management', enabled: true, cooldownDays: 30 },
    { id: 'trg_paying', name: 'Reached paying', kind: 'stage', stage: 'paying', channel: 'slack', owner: 'Account management', enabled: true, cooldownDays: 90 },
    { id: 'trg_expanding', name: 'Reached expanding', kind: 'stage', stage: 'expanding', channel: 'email', owner: 'Leadership digest', enabled: false, cooldownDays: 90 },
  ];

  const audit: AuditEntry[] = [
    { id: 'aud_seed_1', at: iso(now - 8 * DAY), actor: 'sofia.reyes@zintlr.com', actorRole: 'ops', customerId: 'cus_lumen', action: 'access_request.approved', target: 'areq_lumen_region', before: { status: 'open' }, after: { status: 'approved' }, reason: 'DPA addendum signed; residency pinned to eu-west-1.' },
    { id: 'aud_seed_2', at: iso(now - 3 * DAY), actor: 'marcus.lee@zintlr.com', actorRole: 'ops', customerId: 'cus_helioz', action: 'key.updated', target: keys.find((k) => k.customerId === 'cus_helioz')?.id ?? 'key', before: { allowedIps: [] }, after: { allowedIps: ['203.0.113.44'] }, reason: 'Customer moved to a static egress IP (ticket #4790).' },
    { id: 'aud_seed_3', at: iso(now - 1.2 * DAY), actor: 'dev.malhotra@zintlr.com', actorRole: 'ops', customerId: 'cus_arkline', action: 'access_request.denied', target: 'areq_arkline_override', before: { status: 'open' }, after: { status: 'denied' }, reason: 'Phone check is a 60-second step; waivers are for verified customers only.' },
  ];

  return { customers, keys, ledger, wallets, accessRequests, triggers, audit };
}

function weightedEndpoint(u: number): EndpointSpec {
  const total = ENDPOINTS.reduce((s, e) => s + e.weight, 0);
  let acc = 0;
  for (const e of ENDPOINTS) { acc += e.weight / total; if (u <= acc) return e; }
  return ENDPOINTS[0];
}

/**
 * Seed a handful of deterministic abuse patterns for the anomaly detectors (deep
 * feature 2): a key shared across regions with an impossible-travel flip, a call
 * burst, and 404 enumeration. Each is attributed to a real live key so the detectors
 * and the "suspend key" action have something concrete to work on.
 */
function injectAbuse(now: number, keys: ManagedKey[], ledger: LedgerEntry[]): void {
  const HR = HOUR;
  const liveKey = (cid: string) => keys.find((k) => k.customerId === cid && k.environment === 'live' && k.status === 'active');
  const add = (key: ManagedKey, ts: number, region: Region, over: Partial<LedgerEntry> = {}) => {
    ledger.push({
      requestId: `req_ab_${sha256Hex(`ab:${key.id}:${ts}:${region}:${ledger.length}`).slice(0, 12)}`,
      customerId: key.customerId, keyId: key.id, ts, method: 'GET', endpoint: '/v1/people/phone', status: 200,
      latencyMs: 120, credits: 2, region, cache: null, idempotent: false, ...over,
    });
    if (ts > now - 7 * DAY) key.requests7d += 1;
  };

  // 1) Credential sharing + impossible travel — one Enterprise key hitting 3 regions.
  const shared = liveKey('cus_bluefin');
  if (shared) {
    const regions: Region[] = ['US', 'EU', 'IN'];
    for (let i = 0; i < 36; i++) add(shared, now - Math.floor((i / 36) * 22 * HR) - 5 * 60_000, regions[i % 3]);
    // an implausible US→EU flip four minutes apart
    add(shared, now - 3 * HR, 'US');
    add(shared, now - 3 * HR + 4 * 60_000, 'EU');
  }

  // 2) Call burst — 70 requests inside a 4-minute window ~90 minutes ago.
  const burst = liveKey('cus_pinecrest');
  if (burst) {
    const start = now - 90 * 60_000;
    for (let i = 0; i < 70; i++) add(burst, start + Math.floor((i / 70) * 4 * 60_000), 'US', { endpoint: '/v1/companies/enrich', credits: 1 });
  }

  // 3) Enumeration — 26 lookups returning 404 in the last 6h (probing for records).
  const enum404 = liveKey('cus_helioz');
  if (enum404) {
    for (let i = 0; i < 26; i++) add(enum404, now - Math.floor((i / 26) * 6 * HR), 'EU', { endpoint: '/v1/people/resolve', method: 'POST', status: 404, credits: 0 });
  }
}

function mkReq(
  now: number, customerId: string, requesterEmail: string, type: AccessRequest['type'], payload: AccessRequest['payload'], justification: string,
  tripped: string[], walletBalance: number, calls7d: number, keysActive: number, status: AccessRequest['status'], ageMs: number,
  infoNote?: string, decision?: AccessRequest['decision'],
): AccessRequest {
  const createdAt = iso(now - ageMs);
  const id = `areq_${customerId.replace('cus_', '')}_${type === 'trial_gate_override' ? 'override' : type.replace('_', '')}`.replace('limitincrease', 'limit').replace('enterprisefeature', 'feature').replace('livekey', 'live');
  const log: AccessRequest['log'] = [{ at: createdAt, actor: requesterEmail, action: 'created', note: justification }];
  if (status === 'needs_info' && infoNote) log.push({ at: iso(now - ageMs + 5 * HOUR), actor: 'ananya.iyer@zintlr.com', action: 'needs_info', note: infoNote });
  if (decision) log.push({ at: decision.at, actor: decision.actor, action: decision.action, note: decision.reason });
  return { id, customerId, requesterEmail, type, payload, justification, riskContext: { tripped, walletBalance, calls7d, keysActive }, status, decision: decision ?? null, createdAt, log };
}
