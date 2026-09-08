import type { ReactNode } from 'react';
import {
  LayoutDashboard, Key, KeyRound, Fingerprint, LineChart, UserCheck, Siren,
  Compass, Braces, Cable, FlaskConical, Sparkles, GitMerge, Route, Waypoints, Network, Users,
  ListChecks, Download, Boxes, Webhook, Radio, Repeat2, Merge, ListFilter, Filter, Archive,
  Activity, Timer, Gauge, Rocket, RotateCw, Target, Radar, SlidersHorizontal, ScrollText,
  Award, RefreshCw, AlarmClock, MessageSquareWarning, Combine, History, Globe, Navigation,
  TrendingUp, Zap, Server, FileText, Bug, ShieldCheck, ShieldAlert, Ruler, LockKeyhole, Lock,
  EyeOff, MonitorSmartphone, CreditCard, Handshake, Database, Lightbulb, BookOpen, GitBranch,
  Map, LifeBuoy, Scale, Funnel,
} from 'lucide-react';

/**
 * Console navigation — the single source of truth for the left-nav information architecture.
 *
 * The nav is grouped into collapsible modules (see `NAV_SECTIONS`), with `Overview` pinned
 * above them. `layout.tsx` renders these and derives a flat `allNavItems` from them
 * (`navPinnedTop` + every section's items), so the Omnibar, the active-item lookup, and
 * `ProtectedRoute` role-gating keep working unchanged.
 *
 * ─── To add a feature to the nav ─────────────────────────────────────────────
 * Add ONE `{ name, href, icon, roles }` entry to the `items` array of the section it
 * belongs to below. Don't edit `layout.tsx` — this file is the only place nav items live.
 */

export type ConsoleRole = 'admin' | 'developer' | 'billing';

export interface NavItem {
  name: string;
  href: string;
  icon: ReactNode;
  roles: ConsoleRole[];
}

export interface NavSection {
  /** Stable id — used as the localStorage key for the collapse state. */
  id: string;
  label: string;
  /** Representative icon, shown on the section header when expanded. */
  icon: ReactNode;
  items: NavItem[];
}

const cls = 'w-5 h-5';

/** Pinned above every module — no group, always visible. */
export const navPinnedTop: NavItem[] = [
  { name: 'Overview', href: '/console/overview', icon: <LayoutDashboard className={cls} />, roles: ['admin', 'developer', 'billing'] },
];

export const NAV_SECTIONS: NavSection[] = [
  {
    id: 'credentials', label: 'Credentials & Keys', icon: <Key className={cls} />,
    items: [
      { name: 'API Keys', href: '/console/keys', icon: <Key className={cls} />, roles: ['admin', 'developer'] },
      { name: 'Key Scopes', href: '/console/scopes', icon: <KeyRound className={cls} />, roles: ['admin', 'developer'] },
      { name: 'Key Pairs', href: '/console/key-pairs', icon: <Fingerprint className={cls} />, roles: ['admin', 'developer', 'billing'] },
      { name: 'Key Usage', href: '/console/key-usage', icon: <LineChart className={cls} />, roles: ['admin', 'developer', 'billing'] },
      { name: 'Key Ownership', href: '/console/key-ownership', icon: <UserCheck className={cls} />, roles: ['admin', 'developer', 'billing'] },
      { name: 'Kill Switch', href: '/console/kill-switch', icon: <Siren className={cls} />, roles: ['admin', 'developer'] },
    ],
  },
  {
    id: 'explore', label: 'Explore & Build', icon: <Compass className={cls} />,
    items: [
      { name: 'Endpoint Explorer', href: '/console/explorer', icon: <Compass className={cls} />, roles: ['admin', 'developer'] },
      { name: 'GraphQL', href: '/console/graphql', icon: <Braces className={cls} />, roles: ['admin', 'developer'] },
      { name: 'gRPC Channel', href: '/console/grpc', icon: <Cable className={cls} />, roles: ['admin', 'developer'] },
      { name: 'Preview Program', href: '/console/preview', icon: <FlaskConical className={cls} />, roles: ['admin', 'developer', 'billing'] },
    ],
  },
  {
    id: 'enrichment', label: 'Enrichment & Identity', icon: <Sparkles className={cls} />,
    items: [
      { name: 'Enrichment Studio', href: '/console/studio', icon: <Sparkles className={cls} />, roles: ['admin', 'developer'] },
      { name: 'Identity Resolution', href: '/console/identity', icon: <GitMerge className={cls} />, roles: ['admin', 'developer', 'billing'] },
      { name: 'Identity History', href: '/console/identity-history', icon: <Route className={cls} />, roles: ['admin', 'developer', 'billing'] },
      { name: 'ID Map', href: '/console/xref', icon: <Waypoints className={cls} />, roles: ['admin', 'developer'] },
      { name: 'Company Hierarchy', href: '/console/hierarchy', icon: <Network className={cls} />, roles: ['admin', 'developer', 'billing'] },
      { name: 'Account Grouping', href: '/console/accounts', icon: <Users className={cls} />, roles: ['admin', 'developer', 'billing'] },
      { name: 'Signals', href: '/console/signals', icon: <Radar className={cls} />, roles: ['admin'] },
    ],
  },
  {
    id: 'jobs', label: 'Jobs & Delivery', icon: <Boxes className={cls} />,
    items: [
      { name: 'Bulk Jobs', href: '/console/jobs', icon: <ListChecks className={cls} />, roles: ['admin', 'developer', 'billing'] },
      { name: 'Bulk Export', href: '/console/export', icon: <Download className={cls} />, roles: ['admin', 'developer'] },
      { name: 'Async Jobs', href: '/console/async-jobs', icon: <Boxes className={cls} />, roles: ['admin', 'developer'] },
      { name: 'Result Delivery', href: '/console/webhook-deliveries', icon: <Webhook className={cls} />, roles: ['admin', 'developer'] },
      { name: 'Streaming', href: '/console/stream', icon: <Radio className={cls} />, roles: ['admin', 'developer'] },
      { name: 'Webhooks', href: '/console/webhooks', icon: <Webhook className={cls} />, roles: ['admin', 'developer'] },
    ],
  },
  {
    id: 'optimization', label: 'Request Optimization', icon: <SlidersHorizontal className={cls} />,
    items: [
      { name: 'Idempotency', href: '/console/idempotency', icon: <Repeat2 className={cls} />, roles: ['admin', 'developer'] },
      { name: 'Request Coalescing', href: '/console/coalescing', icon: <Merge className={cls} />, roles: ['admin', 'developer'] },
      { name: 'Field Selection', href: '/console/field-selection', icon: <ListFilter className={cls} />, roles: ['admin', 'developer'] },
      { name: 'Query Builder', href: '/console/query', icon: <Filter className={cls} />, roles: ['admin', 'developer'] },
      { name: 'Compression', href: '/console/compression', icon: <Archive className={cls} />, roles: ['admin', 'developer'] },
    ],
  },
  {
    id: 'traffic', label: 'Traffic & Rate Limits', icon: <Gauge className={cls} />,
    items: [
      { name: 'Rate Limits', href: '/console/rate-limits', icon: <Timer className={cls} />, roles: ['admin', 'developer', 'billing'] },
      { name: 'Rate-Limit Headers', href: '/console/rate-limit-headers', icon: <Gauge className={cls} />, roles: ['admin', 'developer'] },
      { name: 'Throughput Tiers', href: '/console/throughput-tiers', icon: <Rocket className={cls} />, roles: ['admin', 'developer', 'billing'] },
      { name: 'Retry Strategy', href: '/console/retry-strategy', icon: <RotateCw className={cls} />, roles: ['admin', 'developer', 'billing'] },
    ],
  },
  {
    id: 'match', label: 'Match & Coverage', icon: <Target className={cls} />,
    items: [
      { name: 'Match Rate', href: '/console/coverage', icon: <Target className={cls} />, roles: ['admin', 'developer', 'billing'] },
      { name: 'Coverage Gaps', href: '/console/coverage-gaps', icon: <Radar className={cls} />, roles: ['admin', 'developer', 'billing'] },
      { name: 'Match Thresholds', href: '/console/thresholds', icon: <SlidersHorizontal className={cls} />, roles: ['admin', 'developer', 'billing'] },
      { name: 'Match Audit Trail', href: '/console/match-audit', icon: <ScrollText className={cls} />, roles: ['admin', 'developer', 'billing'] },
      { name: 'Regional Coverage', href: '/console/regions', icon: <Globe className={cls} />, roles: ['admin', 'developer', 'billing'] },
    ],
  },
  {
    id: 'quality', label: 'Data Quality', icon: <Award className={cls} />,
    items: [
      { name: 'Quality SLA', href: '/console/quality-sla', icon: <Gauge className={cls} />, roles: ['admin', 'developer', 'billing'] },
      { name: 'Accuracy Benchmarks', href: '/console/benchmarks', icon: <Award className={cls} />, roles: ['admin', 'developer', 'billing'] },
      { name: 'Re-verification', href: '/console/re-verification', icon: <RefreshCw className={cls} />, roles: ['admin', 'developer', 'billing'] },
      { name: 'Data Decay', href: '/console/data-decay', icon: <AlarmClock className={cls} />, roles: ['admin', 'developer', 'billing'] },
      { name: 'Corrections', href: '/console/corrections', icon: <MessageSquareWarning className={cls} />, roles: ['admin', 'developer'] },
      { name: 'Reconciliation', href: '/console/reconciliation', icon: <Combine className={cls} />, roles: ['admin', 'developer'] },
      { name: 'Golden Records', href: '/console/golden-records', icon: <History className={cls} />, roles: ['admin', 'developer', 'billing'] },
    ],
  },
  {
    id: 'security', label: 'Security & Compliance', icon: <ShieldCheck className={cls} />,
    items: [
      { name: 'Security Hub', href: '/console/security', icon: <ShieldCheck className={cls} />, roles: ['admin', 'developer'] },
      { name: 'Firewall (WAF)', href: '/console/waf', icon: <ShieldAlert className={cls} />, roles: ['admin', 'developer'] },
      { name: 'Payload Limits', href: '/console/payload-limits', icon: <Ruler className={cls} />, roles: ['admin', 'developer'] },
      { name: 'Login Security', href: '/console/login-security', icon: <LockKeyhole className={cls} />, roles: ['admin'] },
      { name: 'MFA Enforcement', href: '/console/mfa', icon: <ShieldCheck className={cls} />, roles: ['admin', 'developer', 'billing'] },
      { name: 'Encryption', href: '/console/encryption', icon: <Lock className={cls} />, roles: ['admin', 'developer', 'billing'] },
      { name: 'PII Masking', href: '/console/pii-masking', icon: <EyeOff className={cls} />, roles: ['admin', 'developer', 'billing'] },
      { name: 'Sessions', href: '/console/sessions', icon: <MonitorSmartphone className={cls} />, roles: ['admin', 'developer', 'billing'] },
      { name: 'CORS Policy', href: '/console/cors', icon: <Globe className={cls} />, roles: ['admin', 'developer', 'billing'] },
      { name: 'API Regions', href: '/console/api-regions', icon: <Navigation className={cls} />, roles: ['admin', 'developer', 'billing'] },
    ],
  },
  {
    id: 'operations', label: 'Operations & Monitoring', icon: <Activity className={cls} />,
    items: [
      { name: 'Usage & Analytics', href: '/console/analytics', icon: <Activity className={cls} />, roles: ['admin', 'developer', 'billing'] },
      { name: 'Growth', href: '/console/growth', icon: <TrendingUp className={cls} />, roles: ['admin', 'billing'] },
      { name: 'Funnel', href: '/console/funnel', icon: <Funnel className={cls} />, roles: ['admin', 'billing'] },
      { name: 'Logs', href: '/console/logs', icon: <FileText className={cls} />, roles: ['admin', 'developer'] },
      { name: 'Request Inspector', href: '/console/debug', icon: <Bug className={cls} />, roles: ['admin', 'developer'] },
      { name: 'Circuit Breakers', href: '/console/circuits', icon: <Zap className={cls} />, roles: ['admin', 'developer'] },
      { name: 'Infrastructure', href: '/console/infrastructure', icon: <Server className={cls} />, roles: ['admin', 'developer'] },
    ],
  },
  {
    id: 'business', label: 'Business & Billing', icon: <CreditCard className={cls} />,
    items: [
      { name: 'Billing', href: '/console/billing', icon: <CreditCard className={cls} />, roles: ['admin', 'billing'] },
      { name: 'Partners', href: '/console/partners', icon: <Handshake className={cls} />, roles: ['admin'] },
      { name: 'Data Sharing', href: '/console/data-sharing', icon: <Database className={cls} />, roles: ['admin'] },
    ],
  },
  {
    id: 'resources', label: 'Resources & Account', icon: <BookOpen className={cls} />,
    items: [
      { name: 'Features', href: '/console/features', icon: <Lightbulb className={cls} />, roles: ['admin', 'developer', 'billing'] },
      { name: 'Docs', href: '/docs', icon: <BookOpen className={cls} />, roles: ['admin', 'developer', 'billing'] },
      { name: 'Changelog', href: '/console/changelog', icon: <GitBranch className={cls} />, roles: ['admin', 'developer', 'billing'] },
      { name: 'Roadmap', href: '/console/roadmap', icon: <Map className={cls} />, roles: ['admin', 'developer', 'billing'] },
      { name: 'Support', href: '/console/support', icon: <LifeBuoy className={cls} />, roles: ['admin', 'developer', 'billing'] },
      { name: 'Legal', href: '/console/legal', icon: <Scale className={cls} />, roles: ['admin', 'developer', 'billing'] },
      { name: 'Settings', href: '/console/settings', icon: <Users className={cls} />, roles: ['admin', 'developer', 'billing'] },
    ],
  },
];

/** Flat list of every nav item (pinned + all sections) — for the Omnibar, active-item lookup, and role-gating. */
export const allNavItems: NavItem[] = [
  ...navPinnedTop,
  ...NAV_SECTIONS.flatMap((s) => s.items),
];
