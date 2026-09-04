'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Building2, Globe, Image as ImageIcon, KeyRound, Users, CalendarDays, Copy, Check, AlertTriangle, ArrowRightLeft, Trash2, ShieldCheck } from 'lucide-react';
import RoleGuard from '@/components/RoleGuard';
import { useStore } from '@/lib/store';
import { useToast } from '@/components/Toast';
import { track } from '@/lib/telemetry';
import { GlassCard, Field, Input, Select, Button, ConfirmAction, SegmentedControl, StatusBadge, Skeleton, SkeletonLines } from '@/components/ui';

const DOMAIN_REGEX = /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.[a-z0-9-]{1,63})+$/i;
const URL_REGEX = /^https?:\/\/.+\..+/i;

type EnvChoice = 'sandbox' | 'live';

export default function OrganizationSettingsPage() {
  const router = useRouter();
  const toast = useToast();
  const {
    organizations, activeOrganizationId, user, teamMembers, activeKeys,
    updateOrganization, deleteOrganization, transferOwnership,
  } = useStore();

  const org = useMemo(
    () => organizations.find(o => o.id === activeOrganizationId) ?? organizations[0],
    [organizations, activeOrganizationId]
  );

  // ─── Form state (kept separate from the store until Save) ───────────────────
  const [name, setName] = useState('');
  const [domain, setDomain] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [defaultEnv, setDefaultEnv] = useState<EnvChoice>('sandbox');
  const [isSaving, setIsSaving] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [copied, setCopied] = useState(false);
  const [transferTarget, setTransferTarget] = useState('');
  const [logoBroken, setLogoBroken] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  // Re-seed the form whenever the active org changes (tenant switch).
  useEffect(() => {
    if (!org) return;
    setName(org.name);
    setDomain(org.domain ?? '');
    setLogoUrl(org.logoUrl ?? '');
    setDefaultEnv(org.defaultEnvironment ?? 'sandbox');
    setLogoBroken(false);
  }, [org?.id, org?.name, org?.domain, org?.logoUrl, org?.defaultEnvironment, org]);

  const errors = {
    name: name.trim().length === 0 ? 'Organization name is required' : name.trim().length > 60 ? 'Keep it under 60 characters' : undefined,
    domain: domain && !DOMAIN_REGEX.test(domain.trim()) ? 'Enter a bare domain like acme.com' : undefined,
    logoUrl: logoUrl && !URL_REGEX.test(logoUrl.trim()) ? 'Enter a full https:// URL' : undefined,
  };
  const hasErrors = Boolean(errors.name || errors.domain || errors.logoUrl);
  const isDirty = !!org && (
    name.trim() !== org.name ||
    domain.trim() !== (org.domain ?? '') ||
    logoUrl.trim() !== (org.logoUrl ?? '') ||
    defaultEnv !== (org.defaultEnvironment ?? 'sandbox')
  );

  const activeMembers = teamMembers.filter(m => m.status === 'active' && m.email !== user?.email);
  const canDelete = organizations.length > 1;
  const createdAt = org?.createdAt ? new Date(org.createdAt) : null;

  const handleSave = async () => {
    if (!org || hasErrors || !isDirty) return;
    setIsSaving(true);
    await new Promise(r => setTimeout(r, 600));
    const changed: string[] = [];
    if (name.trim() !== org.name) changed.push('name');
    if (domain.trim() !== (org.domain ?? '')) changed.push('domain');
    if (logoUrl.trim() !== (org.logoUrl ?? '')) changed.push('logoUrl');
    if (defaultEnv !== (org.defaultEnvironment ?? 'sandbox')) changed.push('defaultEnvironment');
    try {
      updateOrganization({
        name: name.trim(),
        domain: domain.trim() || undefined,
        logoUrl: logoUrl.trim() || undefined,
        defaultEnvironment: defaultEnv,
      });
      track('org_updated', { fields: changed.join(','), count: changed.length });
      toast.success('Organization updated', `${changed.length} setting${changed.length === 1 ? '' : 's'} saved.`);
    } catch (err: unknown) {
      toast.error('Could not save', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopyId = async () => {
    if (!org) return;
    try {
      await navigator.clipboard.writeText(org.id);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Copy failed', 'Your browser blocked clipboard access.');
    }
  };

  const handleTransfer = () => {
    const target = activeMembers.find(m => m.id === transferTarget);
    if (!target) return;
    try {
      transferOwnership(target.id);
      track('ownership_transferred', { toRole: 'admin' });
      toast.success('Ownership transferred', `${target.email} is now the admin. Your role is now Developer.`);
      router.push('/console/settings/profile');
    } catch (err: unknown) {
      toast.error('Transfer failed', err instanceof Error ? err.message : 'Please try again.');
    }
  };

  const handleDelete = () => {
    if (!org || !canDelete) return;
    const deletedName = org.name;
    try {
      deleteOrganization(org.id);
      track('org_deleted', { remaining: organizations.length - 1 });
      toast.success('Organization deleted', `${deletedName} and its workspace data were removed.`);
      router.push('/console');
    } catch (err: unknown) {
      toast.error('Delete failed', err instanceof Error ? err.message : 'Please try again.');
    }
  };

  if (!mounted || !org) {
    return (
      <div className="space-y-6" aria-busy="true" aria-label="Loading organization settings">
        <div className="space-y-2"><Skeleton className="h-7 w-48" /><Skeleton className="h-4 w-72" /></div>
        <GlassCard><SkeletonLines lines={5} /></GlassCard>
        <GlassCard><SkeletonLines lines={2} /></GlassCard>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">{[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-16 rounded-2xl" />)}</div>
        <GlassCard><SkeletonLines lines={4} /></GlassCard>
      </div>
    );
  }

  return (
    <RoleGuard
      allowedRoles={['admin']}
      fallback={
        <GlassCard className="text-center py-12">
          <ShieldCheck className="w-10 h-10 text-fg-muted mx-auto mb-3" />
          <h2 className="text-lg font-bold text-fg">Admins only</h2>
          <p className="text-sm text-fg-muted mt-1">Organization settings can only be changed by a workspace admin.</p>
        </GlassCard>
      }
    >
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-fg mb-1 flex items-center gap-2">
              <Building2 className="w-5 h-5 text-teal" /> Organization
            </h2>
            <p className="text-fg-muted text-sm">Identity, defaults, and lifecycle for <span className="text-fg font-semibold">{org.name}</span>.</p>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge tone="teal" dot>{organizations.length} workspace{organizations.length === 1 ? '' : 's'}</StatusBadge>
            <StatusBadge tone="neutral">{org.role}</StatusBadge>
          </div>
        </div>

        {/* General */}
        <GlassCard>
          <div className="flex items-start justify-between gap-4 mb-6">
            <div>
              <h3 className="text-base font-bold text-fg">General</h3>
              <p className="text-xs text-fg-muted mt-0.5">Shown on invoices, invites, and your white-label status page.</p>
            </div>
            <Button onClick={handleSave} disabled={!isDirty || hasErrors} loading={isSaving} size="sm">
              {isDirty ? 'Save changes' : 'Saved'}
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Field label="Organization name" required error={errors.name} htmlFor="org-name">
              <Input id="org-name" value={name} onChange={e => setName(e.target.value)} invalid={!!errors.name} placeholder="Acme Corp" maxLength={60} />
            </Field>
            <Field label="Primary domain" hint="Teammates with this email domain can be auto-approved to join." error={errors.domain} htmlFor="org-domain">
              <div className="relative">
                <Globe className="w-4 h-4 text-fg-muted absolute left-3 top-1/2 -translate-y-1/2" />
                <Input id="org-domain" className="pl-9" value={domain} onChange={e => setDomain(e.target.value.toLowerCase())} invalid={!!errors.domain} placeholder="acme.com" mono />
              </div>
            </Field>
            <Field label="Logo URL" hint="Square PNG or SVG, at least 128×128." error={errors.logoUrl} htmlFor="org-logo" className="md:col-span-2">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-xl bg-glass border border-border flex items-center justify-center overflow-hidden flex-shrink-0">
                  {logoUrl && !errors.logoUrl && !logoBroken ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={logoUrl} alt={`${name || 'Organization'} logo`} className="w-full h-full object-contain" onError={() => setLogoBroken(true)} />
                  ) : (
                    <ImageIcon className="w-5 h-5 text-fg-subtle" />
                  )}
                </div>
                <div className="flex-1">
                  <Input id="org-logo" value={logoUrl} onChange={e => { setLogoUrl(e.target.value); setLogoBroken(false); }} invalid={!!errors.logoUrl || logoBroken} placeholder="https://cdn.acme.com/logo.svg" mono />
                  {logoBroken && <p className="text-xs text-semantic-error mt-1.5">That image could not be loaded. Check the URL is public.</p>}
                </div>
              </div>
            </Field>
          </div>
        </GlassCard>

        {/* Defaults */}
        <GlassCard>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-bold text-fg">Default environment</h3>
              <p className="text-xs text-fg-muted mt-0.5">The console opens in this environment when you switch to this workspace. Live keys are masked; sandbox returns full synthetic data.</p>
            </div>
            <SegmentedControl<EnvChoice>
              layoutId="org-default-env"
              value={defaultEnv}
              onChange={setDefaultEnv}
              options={[
                { value: 'sandbox', label: 'Sandbox' },
                { value: 'live', label: 'Live' },
              ]}
            />
          </div>
        </GlassCard>

        {/* Workspace facts */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <GlassCard padding="sm" className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-teal/10 text-teal"><Users className="w-4 h-4" /></div>
            <div>
              <div className="text-lg font-black text-fg leading-none">{teamMembers.length}</div>
              <div className="text-[11px] uppercase tracking-widest text-fg-muted font-bold mt-1">Members</div>
            </div>
          </GlassCard>
          <GlassCard padding="sm" className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-teal/10 text-teal"><KeyRound className="w-4 h-4" /></div>
            <div>
              <div className="text-lg font-black text-fg leading-none">{activeKeys.filter(k => k.status === 'active').length}</div>
              <div className="text-[11px] uppercase tracking-widest text-fg-muted font-bold mt-1">Active keys</div>
            </div>
          </GlassCard>
          <GlassCard padding="sm" className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-teal/10 text-teal"><CalendarDays className="w-4 h-4" /></div>
            <div>
              <div className="text-lg font-black text-fg leading-none">{createdAt ? createdAt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</div>
              <div className="text-[11px] uppercase tracking-widest text-fg-muted font-bold mt-1">Created</div>
            </div>
          </GlassCard>
          <GlassCard padding="sm" className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs font-mono text-fg truncate">{org.id}</div>
              <div className="text-[11px] uppercase tracking-widest text-fg-muted font-bold mt-1">Organization ID</div>
            </div>
            <button onClick={handleCopyId} aria-label="Copy organization ID" className="p-2 rounded-lg text-fg-muted hover:text-fg hover:bg-glass transition-colors flex-shrink-0">
              {copied ? <Check className="w-4 h-4 text-teal" /> : <Copy className="w-4 h-4" />}
            </button>
          </GlassCard>
        </div>

        {/* Danger zone */}
        <GlassCard className="border-semantic-error/30">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="w-4 h-4 text-semantic-error" />
            <h3 className="text-base font-bold text-fg">Danger zone</h3>
          </div>
          <p className="text-xs text-fg-muted mb-6">These actions are recorded in the audit log and cannot be undone from the console.</p>

          <div className="divide-y divide-border-subtle">
            {/* Transfer ownership */}
            <div className="py-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="max-w-md">
                <div className="text-sm font-bold text-fg flex items-center gap-2"><ArrowRightLeft className="w-4 h-4 text-fg-muted" /> Transfer ownership</div>
                <p className="text-xs text-fg-muted mt-1">Make another active member the admin of this workspace. Your role becomes Developer.</p>
              </div>
              {activeMembers.length === 0 ? (
                <p className="text-xs text-fg-muted italic">Invite and activate a teammate first.</p>
              ) : (
                <div className="flex items-center gap-2">
                  <Select value={transferTarget} onChange={e => setTransferTarget(e.target.value)} className="min-w-[220px]" aria-label="Member to transfer ownership to">
                    <option value="">Select a member…</option>
                    {activeMembers.map(m => <option key={m.id} value={m.id}>{m.email} · {m.role}</option>)}
                  </Select>
                  <ConfirmAction variant="danger" size="sm" disabled={!transferTarget} onConfirm={handleTransfer} confirmLabel="Confirm transfer">
                    Transfer
                  </ConfirmAction>
                </div>
              )}
            </div>

            {/* Delete */}
            <div className="py-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="max-w-md">
                <div className="text-sm font-bold text-fg flex items-center gap-2"><Trash2 className="w-4 h-4 text-fg-muted" /> Delete organization</div>
                <p className="text-xs text-fg-muted mt-1">
                  {canDelete
                    ? 'Removes this workspace, its keys, logs, webhooks, and team. You will land in your next workspace.'
                    : 'You can’t delete your only workspace. Create another organization first.'}
                </p>
              </div>
              <ConfirmAction variant="danger" size="sm" disabled={!canDelete} onConfirm={handleDelete} confirmLabel="Click again to delete forever">
                Delete {org.name}
              </ConfirmAction>
            </div>
          </div>
        </GlassCard>
      </motion.div>
    </RoleGuard>
  );
}
