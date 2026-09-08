'use client';

import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { KeyRound, Plus, RotateCw, Pause, Play, Ban, Trash2, Pencil, Copy, Check, AlertTriangle, Clock, X } from 'lucide-react';
import { api, fmt } from '@/lib/admin/api';
import { useStore, CAN } from '@/lib/admin/store';
import { track } from '@/lib/admin/telemetry';
import { useToast } from '@/components/admin/Toast';
import { Button, DataTable, Drawer, EmptyState, Input, Select, StatusBadge, Textarea, type Column } from '@/components/admin/ui';
import { ReasonModal } from '@/components/admin/ReasonModal';
import { KeyIdentity, KEY_STATUS_TONE, CustomerLink } from '@/components/admin/shared';
import type { ManagedKey, Customer, KeyStatus, RateTier } from '@/lib/admin/types';

const SCOPES = ['identity:read', 'corporate:read', 'search:execute', 'email:verify', 'intent:read', 'bulk:write'];
const isValidIp = (s: string) => /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/.test(s.trim());

interface Props {
  keys: ManagedKey[];
  customers: Customer[];
  /** When set, the panel is scoped to one customer and offers "Create key". */
  customerId?: string;
  onChanged: () => void;
}

type Action = { kind: 'status'; key: ManagedKey; status: KeyStatus } | { kind: 'regenerate'; key: ManagedKey } | { kind: 'delete'; key: ManagedKey } | null;

interface Draft { name: string; environment: 'sandbox' | 'live'; scopes: string[]; allowedIps: string[]; ipDraft: string; creditLimit: string; rateTier: RateTier; expiresAt: string; reason: string }
const emptyDraft = (): Draft => ({ name: '', environment: 'live', scopes: ['identity:read', 'corporate:read'], allowedIps: [], ipDraft: '', creditLimit: '', rateTier: 'Growth', expiresAt: '', reason: '' });
const draftFrom = (k: ManagedKey): Draft => ({ name: k.name, environment: k.environment, scopes: k.scopes, allowedIps: k.allowedIps, ipDraft: '', creditLimit: k.creditLimit === null ? '' : String(k.creditLimit), rateTier: k.rateTier, expiresAt: k.expiresAt ? k.expiresAt.slice(0, 10) : '', reason: '' });

export function TokensPanel({ keys, customers, customerId, onChanged }: Props) {
  const role = useStore((s) => s.operator?.role ?? 'ops');
  const toast = useToast();
  const names = useMemo(() => new Map(customers.map((c) => [c.id, c.name])), [customers]);
  const [statusFilter, setStatusFilter] = useState<'all' | KeyStatus>('all');
  const [envFilter, setEnvFilter] = useState<'all' | 'sandbox' | 'live'>('all');
  const [search, setSearch] = useState('');
  const [action, setAction] = useState<Action>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ mode: 'create' } | { mode: 'edit'; key: ManagedKey } | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [reveal, setReveal] = useState<{ secret: string; key: ManagedKey; verb: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const rows = useMemo(() => keys.filter((k) =>
    (statusFilter === 'all' || k.status === statusFilter) && (envFilter === 'all' || k.environment === envFilter) &&
    (!search.trim() || `${k.name} ${k.fingerprint} ${k.last4} ${names.get(k.customerId) ?? ''}`.toLowerCase().includes(search.toLowerCase())),
  ), [keys, statusFilter, envFilter, search, names]);

  const daysLeft = (k: ManagedKey) => (k.expiresAt ? Math.ceil((Date.parse(k.expiresAt) - Date.now()) / 86_400_000) : null);

  const run = async (reason: string) => {
    if (!action) return;
    setBusy(true); setErr(null);
    let res;
    if (action.kind === 'status') res = await api.post<ManagedKey>(`keys/${action.key.id}/status`, { status: action.status, reason });
    else if (action.kind === 'regenerate') res = await api.post<{ key: ManagedKey; secret: string }>(`keys/${action.key.id}/regenerate`, { reason });
    else res = await api.delete<ManagedKey>(`keys/${action.key.id}`, { reason });
    setBusy(false);
    if (!res.ok) { setErr(res.error.message); return; }
    if (action.kind === 'status') { track('key_status_changed', { status: action.status }); toast.success(`Key ${action.status}`, `${action.key.name} · ${action.key.fingerprint}`); }
    if (action.kind === 'regenerate') { const d = res.data as { key: ManagedKey; secret: string }; track('key_regenerated', {}); setReveal({ secret: d.secret, key: d.key, verb: 'regenerated' }); }
    if (action.kind === 'delete') { track('key_deleted', {}); toast.success('Key deleted', `${action.key.name} removed from every registry.`); }
    setAction(null);
    onChanged();
  };

  const save = async () => {
    if (!editing) return;
    setBusy(true); setErr(null);
    const body = {
      name: draft.name.trim(), scopes: draft.scopes, allowedIps: draft.allowedIps, rateTier: draft.rateTier,
      creditLimit: draft.creditLimit.trim() === '' ? null : Number(draft.creditLimit), expiresAt: draft.expiresAt ? new Date(draft.expiresAt).toISOString() : null, reason: draft.reason.trim(),
    };
    const res = editing.mode === 'create'
      ? await api.post<{ key: ManagedKey; secret: string }>(`customers/${customerId}/keys`, { ...body, environment: draft.environment })
      : await api.patch<ManagedKey>(`keys/${editing.key.id}`, { patch: body, reason: body.reason });
    setBusy(false);
    if (!res.ok) { setErr(res.error.message); return; }
    if (editing.mode === 'create') { const d = res.data as { key: ManagedKey; secret: string }; track('key_created', { environment: draft.environment }); setReveal({ secret: d.secret, key: d.key, verb: 'created' }); }
    else { track('key_updated', {}); toast.success('Key updated', `${draft.name} · changes audit-logged.`); }
    setEditing(null);
    onChanged();
  };

  const canManage = CAN.manageKeys(role);
  const columns: Column<ManagedKey>[] = [
    { key: 'key', header: 'Key', render: (k) => <KeyIdentity name={k.name} prefix={k.prefix} last4={k.last4} fingerprint={k.fingerprint} /> },
    ...(customerId ? [] : [{ key: 'customer', header: 'Customer', render: (k: ManagedKey) => <CustomerLink id={k.customerId} name={names.get(k.customerId) ?? k.customerId} /> } as Column<ManagedKey>]),
    { key: 'env', header: 'Env', className: 'hidden md:table-cell', render: (k) => <StatusBadge tone={k.environment === 'live' ? 'teal' : 'neutral'}>{k.environment}</StatusBadge> },
    { key: 'limits', header: 'Limits', className: 'hidden lg:table-cell', render: (k) => <div className="text-[11px] text-fg-muted">{k.rateTier} tier{k.creditLimit !== null ? ` · cap ${fmt.n(k.creditLimit)}` : ''}{k.allowedIps.length ? ` · ${k.allowedIps.length} IP${k.allowedIps.length === 1 ? '' : 's'}` : ''}</div> },
    { key: 'usage', header: 'Used (7d)', align: 'right', sortValue: (k) => k.requests7d, render: (k) => <span className="font-mono text-[11px] text-fg">{fmt.n(k.requests7d)}</span> },
    { key: 'expires', header: 'Expires', align: 'right', sortValue: (k) => (k.expiresAt ? Date.parse(k.expiresAt) : Number.MAX_SAFE_INTEGER), render: (k) => { const d = daysLeft(k); return d === null ? <span className="text-[11px] text-fg-muted">never</span> : <span className={`text-[11px] font-bold inline-flex items-center gap-1 ${d <= 7 && k.requests7d > 0 ? 'text-semantic-error' : d <= 14 && k.requests7d > 0 ? 'text-semantic-warning' : 'text-fg-muted'}`}>{d <= 14 && k.requests7d > 0 && <AlertTriangle className="w-3 h-3" />}{fmt.inDays(k.expiresAt)}</span>; } },
    { key: 'status', header: 'Status', align: 'right', render: (k) => <StatusBadge tone={KEY_STATUS_TONE[k.status]}>{k.status}</StatusBadge> },
    {
      key: 'actions', header: '', align: 'right', render: (k) => canManage ? (
        <div className="flex items-center justify-end gap-0.5">
          <button type="button" title="Edit" aria-label={`Edit ${k.name}`} onClick={() => { setEditing({ mode: 'edit', key: k }); setDraft(draftFrom(k)); setErr(null); }} className="rounded-md p-1.5 text-fg-muted hover:text-teal hover:bg-glass focus:outline-none focus-visible:ring-2 focus-visible:ring-teal/50"><Pencil className="w-3.5 h-3.5" /></button>
          {k.status === 'active' && <button type="button" title="Suspend" aria-label={`Suspend ${k.name}`} onClick={() => setAction({ kind: 'status', key: k, status: 'suspended' })} className="rounded-md p-1.5 text-fg-muted hover:text-semantic-warning hover:bg-glass focus:outline-none focus-visible:ring-2 focus-visible:ring-teal/50"><Pause className="w-3.5 h-3.5" /></button>}
          {k.status === 'suspended' && <button type="button" title="Re-activate" aria-label={`Re-activate ${k.name}`} onClick={() => setAction({ kind: 'status', key: k, status: 'active' })} className="rounded-md p-1.5 text-fg-muted hover:text-semantic-success hover:bg-glass focus:outline-none focus-visible:ring-2 focus-visible:ring-teal/50"><Play className="w-3.5 h-3.5" /></button>}
          <button type="button" title="Regenerate secret" aria-label={`Regenerate ${k.name}`} onClick={() => setAction({ kind: 'regenerate', key: k })} className="rounded-md p-1.5 text-fg-muted hover:text-teal hover:bg-glass focus:outline-none focus-visible:ring-2 focus-visible:ring-teal/50"><RotateCw className="w-3.5 h-3.5" /></button>
          {k.status !== 'revoked' && <button type="button" title="Revoke" aria-label={`Revoke ${k.name}`} onClick={() => setAction({ kind: 'status', key: k, status: 'revoked' })} className="rounded-md p-1.5 text-fg-muted hover:text-semantic-error hover:bg-glass focus:outline-none focus-visible:ring-2 focus-visible:ring-teal/50"><Ban className="w-3.5 h-3.5" /></button>}
          {CAN.deleteKeys(role) && <button type="button" title="Delete" aria-label={`Delete ${k.name}`} onClick={() => setAction({ kind: 'delete', key: k })} className="rounded-md p-1.5 text-fg-muted hover:text-semantic-error hover:bg-glass focus:outline-none focus-visible:ring-2 focus-visible:ring-teal/50"><Trash2 className="w-3.5 h-3.5" /></button>}
        </div>
      ) : <span className="text-[10px] text-fg-subtle">read-only</span>,
    },
  ];

  const actionCopy = action?.kind === 'delete' ? { title: `Delete ${action.key.name}?`, confirm: 'Delete key', desc: 'Removes the key from billing, scopes, kill switch and rate-limit registries. Requests with it fail immediately. This cannot be undone.', danger: true }
    : action?.kind === 'regenerate' ? { title: `Regenerate ${action.key.name}?`, confirm: 'Regenerate', desc: 'Issues a new secret and invalidates the old one. The new secret is shown once — hand it to the customer over a secure channel.', danger: false }
      : action?.kind === 'status' ? { title: `${action.status === 'suspended' ? 'Suspend' : action.status === 'revoked' ? 'Revoke' : 'Re-activate'} ${action.key.name}?`, confirm: action.status === 'suspended' ? 'Suspend' : action.status === 'revoked' ? 'Revoke' : 'Re-activate', desc: action.status === 'revoked' ? 'Revoked keys cannot be re-activated; regenerate or create a new key later.' : action.status === 'suspended' ? 'Requests with this key return 403 until it is re-activated.' : 'Requests with this key start succeeding again.', danger: action.status !== 'active' } : null;

  return (
    <div>
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <Input aria-label="Search keys" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, fingerprint, last 4, customer" className="text-[12px] w-64" />
        <Select aria-label="Status filter" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as 'all' | KeyStatus)} className="text-[12px] w-36"><option value="all">All statuses</option><option value="active">Active</option><option value="suspended">Suspended</option><option value="revoked">Revoked</option></Select>
        <Select aria-label="Environment filter" value={envFilter} onChange={(e) => setEnvFilter(e.target.value as 'all' | 'sandbox' | 'live')} className="text-[12px] w-32"><option value="all">All envs</option><option value="live">Live</option><option value="sandbox">Sandbox</option></Select>
        <span className="text-[11px] text-fg-muted ml-auto">{rows.length} of {keys.length}</span>
        {customerId && canManage && <Button size="sm" onClick={() => { setEditing({ mode: 'create' }); setDraft(emptyDraft()); setErr(null); }} icon={<Plus className="w-4 h-4" />}>Create key</Button>}
      </div>
      {keys.length === 0 ? <EmptyState icon={<KeyRound className="w-8 h-8" />} title="No keys yet" description={customerId ? 'Create the customer’s first key — the secret is shown once.' : 'No customer has a key yet.'} action={customerId && canManage ? <Button size="sm" onClick={() => { setEditing({ mode: 'create' }); setDraft(emptyDraft()); setErr(null); }}>Create key</Button> : undefined} />
        : rows.length === 0 ? <EmptyState icon={<KeyRound className="w-8 h-8" />} title="No keys match these filters" description="Clear the search or widen the status / environment filter." action={<Button size="sm" variant="secondary" onClick={() => { setSearch(''); setStatusFilter('all'); setEnvFilter('all'); }}>Clear filters</Button>} />
          : <DataTable columns={columns} rows={rows} rowKey={(k) => k.id} pageSize={10} />}

      <ReasonModal open={action !== null} title={actionCopy?.title ?? ''} description={actionCopy?.desc} confirmLabel={actionCopy?.confirm ?? 'Confirm'} danger={actionCopy?.danger} busy={busy} error={err} onClose={() => { setAction(null); setErr(null); }} onConfirm={run} />

      <Drawer open={editing !== null} onClose={() => setEditing(null)} title={editing?.mode === 'create' ? 'Create key' : `Edit ${editing?.mode === 'edit' ? editing.key.name : ''}`} description={editing?.mode === 'create' ? 'A real token is minted and shown once. Limits and IPs apply at the gateway immediately.' : 'Changes sync to the gateway registries and are audit-logged.'} footer={
        <div className="flex items-center justify-end gap-2"><Button variant="ghost" size="sm" onClick={() => setEditing(null)} disabled={busy}>Cancel</Button><Button size="sm" onClick={save} loading={busy} disabled={draft.reason.trim().length < 4 || (editing?.mode === 'create' && !draft.name.trim())}>{editing?.mode === 'create' ? 'Create & reveal secret' : 'Save changes'}</Button></div>
      }>
        <div className="space-y-4">
          <label className="block"><span className="block text-[10px] font-black uppercase tracking-widest text-fg-muted mb-1">Name</span><Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Production · CRM sync" className="text-[12px]" /></label>
          {editing?.mode === 'create' && (
            <div><span id="key-env-label" className="block text-[10px] font-black uppercase tracking-widest text-fg-muted mb-1">Environment</span><Select aria-labelledby="key-env-label" value={draft.environment} onChange={(e) => setDraft({ ...draft, environment: e.target.value as 'sandbox' | 'live' })} className="text-[12px]"><option value="live">Live (billed, PII masked)</option><option value="sandbox">Sandbox (free, synthetic data)</option></Select></div>
          )}
          <div>
            <span id="key-scopes-label" className="block text-[10px] font-black uppercase tracking-widest text-fg-muted mb-1">Scopes</span>
            <div role="group" aria-labelledby="key-scopes-label" className="flex flex-wrap gap-1.5">{SCOPES.map((s) => { const on = draft.scopes.includes(s); return <button key={s} type="button" aria-pressed={on} onClick={() => setDraft({ ...draft, scopes: on ? draft.scopes.filter((x) => x !== s) : [...draft.scopes, s] })} className={`rounded-md border px-2 py-1 font-mono text-[10px] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal/50 ${on ? 'border-teal/40 bg-teal/10 text-teal' : 'border-border bg-surface text-fg-muted hover:text-fg'}`}>{s}</button>; })}</div>
          </div>
          <div>
            <span id="key-ips-label" className="block text-[10px] font-black uppercase tracking-widest text-fg-muted mb-1">IP allow-list</span>
            <div className="flex flex-wrap gap-1.5 mb-1.5">{draft.allowedIps.map((ip) => <span key={ip} className="inline-flex items-center gap-1 rounded-md border border-border bg-glass px-2 py-0.5 font-mono text-[10px] text-fg">{ip}<button type="button" aria-label={`Remove ${ip}`} onClick={() => setDraft({ ...draft, allowedIps: draft.allowedIps.filter((x) => x !== ip) })} className="text-fg-muted hover:text-semantic-error"><X className="w-3 h-3" /></button></span>)}{draft.allowedIps.length === 0 && <span className="text-[11px] text-fg-subtle">Any IP</span>}</div>
            <form className="flex gap-1.5" onSubmit={(e) => { e.preventDefault(); if (isValidIp(draft.ipDraft) && !draft.allowedIps.includes(draft.ipDraft.trim())) setDraft({ ...draft, allowedIps: [...draft.allowedIps, draft.ipDraft.trim()], ipDraft: '' }); }}>
              <Input aria-labelledby="key-ips-label" value={draft.ipDraft} onChange={(e) => setDraft({ ...draft, ipDraft: e.target.value })} placeholder="203.0.113.44 or 10.0.0.0/24" mono invalid={Boolean(draft.ipDraft) && !isValidIp(draft.ipDraft)} className="text-[12px]" />
              <Button type="submit" size="sm" variant="secondary" disabled={!isValidIp(draft.ipDraft)} icon={<Plus className="w-3.5 h-3.5" />}>Add</Button>
            </form>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block"><span className="block text-[10px] font-black uppercase tracking-widest text-fg-muted mb-1">Rate tier</span><Select value={draft.rateTier} onChange={(e) => setDraft({ ...draft, rateTier: e.target.value as RateTier })} className="text-[12px]"><option>Starter</option><option>Growth</option><option>Enterprise</option></Select></label>
            <label className="block"><span className="block text-[10px] font-black uppercase tracking-widest text-fg-muted mb-1">Credit cap (blank = none)</span><Input type="number" min={0} value={draft.creditLimit} onChange={(e) => setDraft({ ...draft, creditLimit: e.target.value })} placeholder="50000" mono className="text-[12px]" /></label>
          </div>
          <label className="block"><span className="block text-[10px] font-black uppercase tracking-widest text-fg-muted mb-1 inline-flex items-center gap-1"><Clock className="w-3 h-3" /> Expires (blank = never)</span><Input type="date" value={draft.expiresAt} onChange={(e) => setDraft({ ...draft, expiresAt: e.target.value })} className="text-[12px]" /></label>
          <label className="block"><span className="block text-[10px] font-black uppercase tracking-widest text-fg-muted mb-1">Reason (audit log)</span><Textarea rows={2} value={draft.reason} onChange={(e) => setDraft({ ...draft, reason: e.target.value })} placeholder="Ticket #, customer request, incident…" className="text-[12px]" /></label>
          {err && <p role="alert" className="text-[12px] text-semantic-error inline-flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> {err}</p>}
        </div>
      </Drawer>

      <Drawer open={reveal !== null} onClose={() => setReveal(null)} title={`Secret ${reveal?.verb ?? ''} — shown once`} description="Copy it now and hand it to the customer over a secure channel. It is not stored anywhere and cannot be shown again." footer={<div className="flex justify-end"><Button size="sm" onClick={() => setReveal(null)} icon={<Check className="w-4 h-4" />}>I’ve copied it</Button></div>}>
            {reveal && <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
              <div className="rounded-xl border border-teal/30 bg-teal/5 p-3">
                <div className="text-[10px] font-black uppercase tracking-widest text-fg-muted mb-1">{reveal.key.name} · {reveal.key.environment}</div>
                <div className="flex items-center gap-2"><code className="font-mono text-[12px] text-fg break-all flex-1">{reveal.secret}</code><Button size="sm" variant="secondary" onClick={() => { navigator.clipboard?.writeText(reveal.secret).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1400); }).catch(() => {}); }} icon={copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}>{copied ? 'Copied' : 'Copy'}</Button></div>
              </div>
              <p className="text-[11px] text-fg-muted">From now on the console shows only <span className="font-mono">{reveal.key.prefix}••••{reveal.key.last4}</span> and <span className="font-mono">{reveal.key.fingerprint}</span>.</p>
            </motion.div>}
          </Drawer>
    </div>
  );
}
