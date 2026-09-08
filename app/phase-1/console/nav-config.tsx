import type { ReactNode } from 'react';
import {
  LayoutDashboard, Key, Siren, Compass, Sparkles, FlaskConical,
  GitMerge, Network, Users, ListChecks, Download, Webhook, Boxes, Timer, Rocket, Gauge,
  Target, Radar, MessageSquareWarning, Award, ShieldCheck, EyeOff, Navigation,
  MonitorSmartphone, Activity, FileText, Bug, Server, CreditCard, Calculator, BookOpen,
  GitBranch, LifeBuoy,
} from 'lucide-react';

/**
 * Phase-1 SCOPED console navigation.
 *
 * Same shape and SSOT contract as `app/console/nav-config.tsx`, but restricted to the
 * Phase-1 launch surface — ~36 of the 95 console pages (≈38%), grouped into the launch
 * modules. Hrefs point at `/phase-1/console/*` (each re-exports the real production page),
 * so the cloned Phase-1 layout renders the exact same chrome — Omnibar, sidebar,
 * active-item lookup, RBAC — against this subset.
 */

export type ConsoleRole = 'admin' | 'developer' | 'billing';

export interface NavItem {
  name: string;
  href: string;
  icon: ReactNode;
  roles: ConsoleRole[];
  badge?: 'open-alerts';
}

export interface NavSection {
  id: string;
  label: string;
  icon: ReactNode;
  items: NavItem[];
}

const cls = 'w-5 h-5';
const ALL: ConsoleRole[] = ['admin', 'developer', 'billing'];
const DEV: ConsoleRole[] = ['admin', 'developer'];

export const navPinnedTop: NavItem[] = [
  { name: 'Overview', href: '/phase-1/console/overview', icon: <LayoutDashboard className={cls} />, roles: ALL },
];

export const NAV_SECTIONS: NavSection[] = [
  {
    // Credentials consolidated: the four key-management surfaces (API Keys, Key Scopes,
    // Key Usage, Kill Switch) are now tabs inside the single /phase-1/console/keys hub,
    // so this module carries one destination. Their re-export routes still resolve.
    id: 'credentials', label: 'API Keys', icon: <Key className={cls} />,
    items: [
      { name: 'API Keys', href: '/phase-1/console/keys', icon: <Key className={cls} />, roles: DEV },
    ],
  },
  {
    id: 'explore', label: 'Explore & Build', icon: <Compass className={cls} />,
    items: [
      { name: 'Endpoint Explorer', href: '/phase-1/console/explorer', icon: <Compass className={cls} />, roles: DEV },
      { name: 'Enrichment Studio', href: '/phase-1/console/studio', icon: <Sparkles className={cls} />, roles: DEV },
      { name: 'Preview Program', href: '/phase-1/console/preview', icon: <FlaskConical className={cls} />, roles: ALL },
    ],
  },
  {
    id: 'enrichment', label: 'Enrichment & Identity', icon: <Sparkles className={cls} />,
    items: [
      { name: 'Identity Resolution', href: '/phase-1/console/identity', icon: <GitMerge className={cls} />, roles: ALL },
      { name: 'Company Hierarchy', href: '/phase-1/console/hierarchy', icon: <Network className={cls} />, roles: ALL },
      { name: 'Account Grouping', href: '/phase-1/console/accounts', icon: <Users className={cls} />, roles: ALL },
    ],
  },
  {
    id: 'jobs', label: 'Jobs & Delivery', icon: <Boxes className={cls} />,
    items: [
      { name: 'Bulk Jobs', href: '/phase-1/console/jobs', icon: <ListChecks className={cls} />, roles: ALL },
      { name: 'Bulk Export', href: '/phase-1/console/export', icon: <Download className={cls} />, roles: DEV },
      { name: 'Webhooks', href: '/phase-1/console/webhooks', icon: <Webhook className={cls} />, roles: DEV },
    ],
  },
  {
    id: 'traffic', label: 'Traffic & Rate Limits', icon: <Gauge className={cls} />,
    items: [
      { name: 'Rate Limits', href: '/phase-1/console/rate-limits', icon: <Timer className={cls} />, roles: ALL },
      { name: 'Throughput Tiers', href: '/phase-1/console/throughput-tiers', icon: <Rocket className={cls} />, roles: ALL },
    ],
  },
  {
    id: 'match', label: 'Match & Coverage', icon: <Target className={cls} />,
    items: [
      { name: 'Match Rate', href: '/phase-1/console/coverage', icon: <Target className={cls} />, roles: ALL },
      { name: 'Coverage Gaps', href: '/phase-1/console/coverage-gaps', icon: <Radar className={cls} />, roles: ALL },
    ],
  },
  {
    id: 'quality', label: 'Data Quality', icon: <Award className={cls} />,
    items: [
      { name: 'Quality SLA', href: '/phase-1/console/quality-sla', icon: <Gauge className={cls} />, roles: ALL },
      { name: 'Corrections', href: '/phase-1/console/corrections', icon: <MessageSquareWarning className={cls} />, roles: DEV },
    ],
  },
  {
    id: 'security', label: 'Security & Compliance', icon: <ShieldCheck className={cls} />,
    items: [
      { name: 'Security Hub', href: '/phase-1/console/security', icon: <ShieldCheck className={cls} />, roles: DEV },
      { name: 'PII Masking', href: '/phase-1/console/pii-masking', icon: <EyeOff className={cls} />, roles: ALL },
      { name: 'MFA Enforcement', href: '/phase-1/console/mfa', icon: <ShieldCheck className={cls} />, roles: ALL },
      { name: 'API Regions', href: '/phase-1/console/api-regions', icon: <Navigation className={cls} />, roles: ALL },
      { name: 'Sessions', href: '/phase-1/console/sessions', icon: <MonitorSmartphone className={cls} />, roles: ALL },
    ],
  },
  {
    id: 'operations', label: 'Operations & Monitoring', icon: <Activity className={cls} />,
    items: [
      { name: 'Usage & Analytics', href: '/phase-1/console/analytics', icon: <Activity className={cls} />, roles: ALL },
      { name: 'Logs', href: '/phase-1/console/logs', icon: <FileText className={cls} />, roles: DEV },
      { name: 'Request Inspector', href: '/phase-1/console/debug', icon: <Bug className={cls} />, roles: DEV },
      { name: 'Alert Center', href: '/phase-1/console/alerts', icon: <Siren className={cls} />, roles: ALL, badge: 'open-alerts' },
      { name: 'Infrastructure', href: '/phase-1/console/infrastructure', icon: <Server className={cls} />, roles: DEV },
    ],
  },
  {
    id: 'business', label: 'Business & Billing', icon: <CreditCard className={cls} />,
    items: [
      { name: 'Billing', href: '/phase-1/console/billing', icon: <CreditCard className={cls} />, roles: ['admin', 'billing'] },
      { name: 'Cost Calculator', href: '/phase-1/console/pricing', icon: <Calculator className={cls} />, roles: ALL },
    ],
  },
  {
    id: 'resources', label: 'Resources & Account', icon: <BookOpen className={cls} />,
    items: [
      { name: 'Docs', href: '/phase-1/console/docs', icon: <BookOpen className={cls} />, roles: ALL },
      { name: 'Changelog', href: '/phase-1/console/changelog', icon: <GitBranch className={cls} />, roles: ALL },
      { name: 'Support', href: '/phase-1/console/support', icon: <LifeBuoy className={cls} />, roles: ALL },
      { name: 'Settings', href: '/phase-1/console/settings', icon: <Users className={cls} />, roles: ALL },
    ],
  },
];

/** Flat list derived from the sections + pinned — mirrors the real nav-config contract. */
export const allNavItems: NavItem[] = [
  ...navPinnedTop,
  ...NAV_SECTIONS.flatMap((s) => s.items),
];
