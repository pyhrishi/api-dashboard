/**
 * Zinbit Admin — domain types for the B2B2B operations console.
 *
 * The admin app is a separate application from the customer console. It reads
 * customer, key, ledger, wallet and access-request data through the products'
 * admin APIs (mocked in-memory in this prototype) and never stores a response body
 * or a plaintext secret: keys are identified by their SHA-256 fingerprint, and a
 * regenerated secret is returned exactly once.
 */

export type ProductId = 'zinbit' | 'zintlr-intent' | 'zintlr-context';
export type Plan = 'Trial' | 'Starter' | 'Growth' | 'Enterprise';
export type Region = 'IN' | 'US' | 'EU';
export type Environment = 'sandbox' | 'live';

/** Funnel stages. TOFU = signed_up · MOFU = activated, integrated · BOFU = paying, expanding. */
export type FunnelStage = 'signed_up' | 'activated' | 'integrated' | 'paying' | 'expanding' | 'churned';
export const FUNNEL_ORDER: FunnelStage[] = ['signed_up', 'activated', 'integrated', 'paying', 'expanding'];
export const STAGE_LABEL: Record<FunnelStage, string> = {
  signed_up: 'Signed up', activated: 'Activated', integrated: 'Integrated', paying: 'Paying', expanding: 'Expanding', churned: 'Churned',
};
export type FunnelBand = 'TOFU' | 'MOFU' | 'BOFU';
export const STAGE_BAND: Record<FunnelStage, FunnelBand | null> = {
  signed_up: 'TOFU', activated: 'MOFU', integrated: 'MOFU', paying: 'BOFU', expanding: 'BOFU', churned: null,
};

export interface Customer {
  id: string;
  name: string;
  domain: string;
  productIds: ProductId[];
  plan: Plan;
  region: Region;
  stage: FunnelStage;
  /** Account executive who owns the relationship. */
  owner: string;
  contactEmail: string;
  createdAt: string;
  activatedAt: string | null;
  integratedAt: string | null;
  paidAt: string | null;
  /** Monthly plan allowance in credits (Trial = trial grant). */
  planCredits: number;
}

export type KeyStatus = 'active' | 'suspended' | 'revoked';
export type RateTier = 'Starter' | 'Growth' | 'Enterprise';

export interface ManagedKey {
  id: string;
  customerId: string;
  name: string;
  environment: Environment;
  /** `sha256:<16 hex>` — the identity every registry is keyed by. Never the secret. */
  fingerprint: string;
  prefix: 'sk_test_' | 'sk_live_';
  last4: string;
  scopes: string[];
  status: KeyStatus;
  allowedIps: string[];
  creditLimit: number | null;
  rateTier: RateTier;
  expiresAt: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  requests7d: number;
  /** Set when the key was regenerated; the new secret was shown exactly once. */
  regeneratedAt: string | null;
}

export interface LedgerEntry {
  requestId: string;
  customerId: string;
  keyId: string;
  ts: number;
  method: 'GET' | 'POST';
  endpoint: string;
  status: number;
  latencyMs: number;
  credits: number;
  region: Region;
  cache: 'HIT' | 'MISS' | null;
  idempotent: boolean;
}

export interface TopUp { at: string; amount: number; kind: 'purchase' | 'plan_renewal' | 'trial_grant' | 'manual_credit' }

export interface Wallet {
  customerId: string;
  balance: number;
  topUps: TopUp[];
}

export type WalletLabel = 'early' | 'on_track' | 'delayed' | 'exhausted' | 'idle';

export interface WalletSnapshot {
  customerId: string;
  balance: number;
  lastTopUpAmount: number;
  lastTopUpAt: string | null;
  burn7d: number;
  burn30d: number;
  /** Credits per day at the trailing-7-day burn. */
  dailyBurn: number;
  /** Median days between top-ups (null with fewer than two). */
  topUpCadenceDays: number | null;
  nextExpectedTopUpAt: string | null;
  projectedExhaustAt: string | null;
  daysToExhaust: number | null;
  label: WalletLabel;
  belowTenPct: boolean;
  atZero: boolean;
  /** Hours the wallet has been at 0 (from the last ledger entry that hit 0). */
  hoursAtZero: number | null;
  /** Share of the last top-up remaining, 0..1. */
  remainingOfLastTopUp: number | null;
}

export type AccessRequestType = 'live_key' | 'limit_increase' | 'region' | 'enterprise_feature' | 'trial_gate_override';
export type AccessRequestStatus = 'open' | 'needs_info' | 'approved' | 'denied';

export interface AccessRequestLogEntry {
  at: string;
  actor: string;
  action: 'created' | 'comment' | 'needs_info' | 'approved' | 'denied' | 'reopened';
  note: string;
}

export interface AccessRequest {
  id: string;
  customerId: string;
  requesterEmail: string;
  type: AccessRequestType;
  /** What exactly is requested — shown verbatim on the one-pager. */
  payload: Record<string, string | number>;
  justification: string;
  /** Risk context at request time (trial-gate style). */
  riskContext: { tripped: string[]; walletBalance: number; calls7d: number; keysActive: number };
  status: AccessRequestStatus;
  decision: { action: 'approved' | 'denied'; actor: string; reason: string; at: string } | null;
  createdAt: string;
  log: AccessRequestLogEntry[];
}

export type TriggerMetric = 'calls7d' | 'trialUsagePct' | 'walletPct' | 'credits7d';
export type TriggerOp = '>=' | '<=' ;
export type TriggerChannel = 'slack' | 'crm' | 'email';

export interface SalesTrigger {
  id: string;
  name: string;
  kind: 'stage' | 'metric';
  /** kind = stage: fires when the account reaches this stage. */
  stage?: FunnelStage;
  /** kind = metric. */
  metric?: TriggerMetric;
  op?: TriggerOp;
  value?: number;
  channel: TriggerChannel;
  owner: string;
  enabled: boolean;
  cooldownDays: number;
}

export type HandoffState = 'new' | 'contacted' | 'converted' | 'closed';

export interface Handoff {
  id: string;
  customerId: string;
  triggerId: string;
  triggerName: string;
  firedAt: string;
  evidence: string;
  state: HandoffState;
  ownerId: string;
  notes: { at: string; actor: string; note: string }[];
}

export interface AuditEntry {
  id: string;
  at: string;
  actor: string;
  actorRole: AdminRole;
  customerId: string | null;
  action: string;
  target: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  reason: string;
}

export type AdminRole = 'superadmin' | 'ops' | 'sales' | 'finance';

export interface ImpersonationSession {
  id: string;
  operator: string;
  customerId: string;
  environment: 'sandbox';
  /** Fingerprint of the minted token — the token itself is returned once. */
  keyFingerprint: string;
  startedAt: string;
  expiresAt: string;
  endedAt: string | null;
}

export interface KeyInsight {
  key: ManagedKey;
  customerName: string;
  daysLeft: number;
  requests7d: number;
  severity: 'critical' | 'warning';
}

export interface StatusBreakdown { code: number; count: number; share: number }
export interface EndpointCost { endpoint: string; calls: number; credits: number; successes: number; errors: number }
export interface KeyCost { keyId: string; keyName: string; fingerprint: string; calls: number; credits: number }

export interface LedgerSummary {
  from: number;
  to: number;
  calls: number;
  credits: number;
  successes: number;
  errorRate: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  byStatus: StatusBreakdown[];
  byClass: { '2xx': number; '4xx': number; '5xx': number };
  byEndpoint: EndpointCost[];
  byKey: KeyCost[];
  /** Cost per successful call at the plan rate (credits). */
  costPerSuccess: number | null;
  /** Calls per day for the frame (sparkline). */
  daily: { day: string; calls: number; credits: number }[];
}

export interface FunnelStageCount { stage: FunnelStage; band: FunnelBand; count: number; dropOffPct: number | null }
export interface FunnelSummary {
  total: number;
  stages: FunnelStageCount[];
  churned: number;
  timeToActivateMinutes: { median: number | null; p90: number | null; underTenMinPct: number | null; sample: number };
  timeToPayDays: { median: number | null; sample: number };
  byPlan: Record<Plan, number>;
  byRegion: Record<Region, number>;
  byProduct: Record<ProductId, number>;
}

export interface Timeframe { from: number; to: number; label: string }
