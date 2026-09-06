'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Users, Building2, Loader2, CircleAlert, ArrowRight, Network, MapPin, Crown, UserX, Layers, Play,
} from 'lucide-react';
import { useStore } from '@/lib/store';
import { useToast } from '@/components/Toast';
import { track } from '@/lib/telemetry';
import { authHeaderValue } from '@/lib/api-config';
import RoleGuard from '@/components/RoleGuard';
import {
  PageHeader, GlassCard, KpiTile, Skeleton, StatusBadge, Button, EmptyState,
} from '@/components/ui';

interface AccountMember { input: string; email: string | null; name: string; role_hint: string | null }
interface CorporateFamily { ultimate_parent: string; relationship: 'standalone' | 'parent' | 'subsidiary'; family_size: number }
interface AccountGroup {
  account_id: string; domain: string; company: string; industry: string; hq: string; employee_band: string;
  member_count: number; members: AccountMember[]; buying_committee: string[]; corporate_family: CorporateFamily | null; confidence: number;
}
interface UngroupedInput { input: string; reason: string }
interface AccountGroupingResult {
  accounts: AccountGroup[]; ungrouped: UngroupedInput[]; total_inputs: number; account_count: number; grouped_count: number; largest_account: string | null;
}

const SAMPLE = `ceo@stripe.com
jane.doe@stripe.com
sales@stripe.com
legal@stripe.com
a@datadoghq.com
marketing@datadoghq.com
founder@shopify.com
someone@gmail.com`;

function AccountsInner() {
  const activeKeys = useStore((s) => s.activeKeys);
  const environment = useStore((s) => s.environment);
  const toast = useToast();
  const apiKey = activeKeys[0]?.key ?? '';

  const [raw, setRaw] = useState(SAMPLE);
  const [phase, setPhase] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [error, setError] = useState('');
  const [result, setResult] = useState<AccountGroupingResult | null>(null);

  useEffect(() => { track('accounts_viewed', {}); }, []);

  const contacts = useMemo(() => raw.split(/[\n,]/).map((s) => s.trim()).filter(Boolean), [raw]);

  const group = useCallback(async () => {
    if (!apiKey) { toast.error('No API key', 'Generate a key first.'); return; }
    if (contacts.length === 0) { toast.error('Add some contacts', 'One email or domain per line.'); return; }
    setPhase('loading'); setError(''); setResult(null);
    try {
      const res = await fetch('/api/v1/accounts/group', {
        method: 'POST',
        headers: { Authorization: authHeaderValue(apiKey), 'Content-Type': 'application/json' },
        body: JSON.stringify({ contacts }),
      });
      const body = (await res.json()) as { success?: boolean; data?: AccountGroupingResult; error?: { message?: string } };
      if (!res.ok || body.success === false || !body.data) throw new Error(body.error?.message || `Gateway returned ${res.status}`);
      setResult(body.data);
      setPhase('ready');
      track('accounts_grouped', { inputs: body.data.total_inputs, accounts: body.data.account_count, ungrouped: body.data.ungrouped.length });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to reach the gateway.');
      setPhase('error');
    }
  }, [apiKey, contacts, toast]);

  return (
    <div className="max-w-[1100px] mx-auto">
      <PageHeader
        title="Account Grouping"
        description="Paste a list of contacts and Zinbit clusters them into buying accounts — grouped by company, rolled up to the corporate family, with the buying committee surfaced."
        icon={<Users />}
        actions={<StatusBadge tone="neutral">{environment}</StatusBadge>}
      />

      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-4 mt-6">
        {/* Input */}
        <GlassCard className="p-5 lg:sticky lg:top-4 h-fit">
          <div className="text-[10px] font-black uppercase tracking-widest text-fg-subtle mb-2">Contacts</div>
          <textarea
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            rows={12}
            className="w-full bg-surface-2 border border-border rounded-xl px-3 py-2.5 text-xs text-fg font-mono focus:border-teal outline-none resize-none"
            placeholder="jane@acme.com&#10;ceo@acme.com&#10;acme.com"
          />
          <div className="flex items-center justify-between mt-3">
            <span className="text-[11px] text-fg-subtle">{contacts.length} contact{contacts.length === 1 ? '' : 's'}</span>
            <Button onClick={group} disabled={phase === 'loading'}>
              {phase === 'loading' ? <><Loader2 className="w-4 h-4 animate-spin" /> Grouping…</> : <><Play className="w-4 h-4" /> Group accounts</>}
            </Button>
          </div>
          <p className="text-[11px] text-fg-subtle mt-2">Emails and domains, one per line. Personal mailboxes are set aside.</p>
        </GlassCard>

        {/* Output */}
        <div>
          {phase === 'idle' && (
            <GlassCard>
              <EmptyState icon={<Layers className="w-7 h-7" />} title="Organize contacts into accounts" description="Paste emails and domains, then group them into buying accounts with their corporate family and buying committee." />
            </GlassCard>
          )}

          {phase === 'loading' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}</div>
              {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-2xl" />)}
            </div>
          )}

          {phase === 'error' && (
            <GlassCard className="p-4 border-semantic-error/30 bg-semantic-error/5 flex items-center gap-3">
              <CircleAlert className="w-5 h-5 text-semantic-error shrink-0" />
              <div className="text-sm text-fg flex-1">{error}</div>
              <Button onClick={group} variant="ghost" size="sm">Retry</Button>
            </GlassCard>
          )}

          {phase === 'ready' && result && (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <KpiTile label="Accounts" value={String(result.account_count)} icon={<Building2 />} hint="Buying accounts" />
                <KpiTile label="Grouped" value={String(result.grouped_count)} icon={<Users />} hint="Contacts placed" />
                <KpiTile label="Set aside" value={String(result.ungrouped.length)} icon={<UserX />} hint="Personal / invalid" lowerIsBetter />
                <KpiTile label="Largest" value={result.largest_account ?? '—'} icon={<Crown />} hint="Top account" />
              </div>

              <div className="space-y-3 mt-4">
                {result.accounts.map((a, i) => (
                  <motion.div key={a.account_id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.03, 0.2) }}>
                    <GlassCard className="p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="w-10 h-10 rounded-xl bg-teal/10 border border-teal/30 flex items-center justify-center shrink-0 text-teal font-black text-sm">
                            {a.company.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase()}
                          </span>
                          <div className="min-w-0">
                            <div className="text-sm font-black text-fg truncate">{a.company}</div>
                            <div className="text-[11px] text-fg-subtle font-mono">{a.domain} · {a.industry}</div>
                          </div>
                        </div>
                        <StatusBadge tone="teal">{a.member_count} contact{a.member_count === 1 ? '' : 's'}</StatusBadge>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-[12px] text-fg-muted">
                        <span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3" /> {a.hq}</span>
                        <span className="inline-flex items-center gap-1"><Users className="w-3 h-3" /> {a.employee_band} employees</span>
                        {a.corporate_family && (
                          <span className="inline-flex items-center gap-1">
                            <Network className="w-3 h-3" />
                            {a.corporate_family.relationship === 'subsidiary'
                              ? `Part of ${a.corporate_family.ultimate_parent} (${a.corporate_family.family_size} entities)`
                              : a.corporate_family.relationship === 'parent'
                                ? `Parent of ${a.corporate_family.family_size - 1} subsidiaries`
                                : 'Standalone company'}
                          </span>
                        )}
                      </div>

                      {a.buying_committee.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5 mt-3">
                          <span className="text-[10px] font-black uppercase tracking-wider text-fg-subtle mr-1">Buying committee</span>
                          {a.buying_committee.map((r) => (
                            <span key={r} className="text-[11px] font-bold text-teal bg-teal/10 border border-teal/20 rounded-full px-2 py-0.5">{r}</span>
                          ))}
                        </div>
                      )}

                      <ul className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                        {a.members.map((m) => (
                          <li key={m.input} className="flex items-center gap-2 bg-surface-2 border border-border rounded-lg px-2.5 py-1.5">
                            <span className="w-6 h-6 rounded-full bg-surface border border-border flex items-center justify-center shrink-0 text-[10px] font-bold text-fg-muted">
                              {m.name.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase()}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="text-xs font-bold text-fg truncate">{m.name}</div>
                              <div className="text-[10px] text-fg-subtle font-mono truncate">{m.email ?? m.input}</div>
                            </div>
                            {m.role_hint && <span className="text-[10px] text-fg-subtle shrink-0">{m.role_hint}</span>}
                          </li>
                        ))}
                      </ul>
                    </GlassCard>
                  </motion.div>
                ))}
              </div>

              {result.ungrouped.length > 0 && (
                <GlassCard className="p-5 mt-4">
                  <div className="flex items-center gap-2 mb-3">
                    <UserX className="w-4 h-4 text-fg-subtle" />
                    <div className="text-sm font-bold text-fg">Set aside ({result.ungrouped.length})</div>
                  </div>
                  <ul className="space-y-1.5">
                    {result.ungrouped.map((u) => (
                      <li key={u.input} className="flex items-center justify-between gap-3 text-xs">
                        <span className="font-mono text-fg-muted truncate">{u.input}</span>
                        <span className="text-[11px] text-fg-subtle shrink-0">{u.reason}</span>
                      </li>
                    ))}
                  </ul>
                </GlassCard>
              )}

              <GlassCard className="p-5 mt-4 border-teal/20">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-teal/10 border border-teal/30 flex items-center justify-center shrink-0"><Network className="w-4 h-4 text-teal" /></div>
                  <div>
                    <div className="text-sm font-bold text-fg">Rolled up to the corporate family</div>
                    <p className="text-[13px] text-fg-muted mt-1 leading-relaxed">
                      Each account carries its corporate-family context from the same resolver behind <Link href="/console/hierarchy" className="text-teal font-semibold hover:text-fg transition-colors">Company Hierarchy <ArrowRight className="w-3 h-3 inline" /></Link>, so a subsidiary reads as part of its parent. Grouping runs over <code className="text-teal">POST /v1/accounts/group</code>; personal mailboxes are set aside rather than forced into an account.
                    </p>
                  </div>
                </div>
              </GlassCard>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AccountsPage() {
  return (
    <RoleGuard allowedRoles={['admin', 'developer', 'billing']}>
      <AccountsInner />
    </RoleGuard>
  );
}
