'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Eye, ShieldCheck, AlertTriangle, ArrowRight, Compass, Clock, Loader2 } from 'lucide-react';
import { useStore } from '@/lib/store';
import { keyFingerprint, isWellFormedApiKey } from '@/lib/key-hashing';
import { track } from '@/lib/telemetry';
import { PageHeader, GlassCard, Button, StatusBadge, EmptyState } from '@/components/ui';

/**
 * Preview-as-customer landing (consumer of the Admin Panel's impersonation session).
 * The admin app mints a real, short-lived `sk_test_` token and deep-links here. We
 * validate the token *shape* (never a masked display string), add it as a sandbox key
 * named "Preview · <customer>" with the session's expiry, switch to sandbox, and hand
 * off to the Explorer — so a sandbox call from preview actually authenticates.
 */
export default function PreviewSessionPage() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params?.get('token') ?? '';
  const customer = params?.get('customer') ?? 'customer';
  const operator = params?.get('operator') ?? 'an operator';
  const expires = Number(params?.get('expires') ?? 0);
  const { activeKeys, addKey, environment, toggleEnvironment, user } = useStore();
  const [state, setState] = useState<'checking' | 'ready' | 'invalid' | 'expired' | 'forbidden'>('checking');
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 15_000); return () => clearInterval(t); }, []);

  const problem = useMemo(() => {
    if (!token) return 'missing';
    if (!isWellFormedApiKey(token) || !token.startsWith('sk_test_')) return 'invalid';
    if (/[^ -ÿ]/.test(token)) return 'masked';
    if (expires && expires < Date.now()) return 'expired';
    return null;
  }, [token, expires]);

  useEffect(() => {
    if (problem === 'expired') { setState('expired'); return; }
    if (problem) { setState('invalid'); return; }
    if (user?.role !== 'admin') { setState('forbidden'); return; }
    const existing = activeKeys.find((k) => k.key === token);
    if (!existing) {
      if (environment !== 'sandbox') toggleEnvironment();
      addKey({
        id: `key_preview_${keyFingerprint(token).slice(7, 15)}`, name: `Preview · ${customer}`, key: token, createdAt: new Date().toISOString(),
        scopes: ['identity:read', 'corporate:read', 'search:execute'], status: 'active', environment: 'sandbox',
        expiresAt: new Date(expires || Date.now() + 30 * 60_000).toISOString(), lastUsed: null,
      });
      track('feature_viewed', { feature: 'preview_session', customer });
    }
    setState('ready');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per token
  }, [token, problem]);

  const fingerprint = token && !problem ? keyFingerprint(token) : null;
  const minutes = expires ? Math.max(0, Math.round((expires - now) / 60_000)) : 30;

  return (
    <div className="max-w-[760px] mx-auto pb-16">
      <PageHeader icon={<Eye />} title="Operator preview" description="You are opening this console as a customer from Zinbit Admin. The session uses a real sandbox token minted for it, so calls succeed; it expires on its own and every action is attributed to the operator." />
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <GlassCard className="p-6 mt-6">
          {state === 'checking' && <p className="text-sm text-fg-muted inline-flex items-center gap-2" aria-busy="true"><Loader2 className="w-4 h-4 animate-spin text-teal" /> Checking the session token…</p>}
          {state === 'invalid' && <EmptyState tone="error" icon={<AlertTriangle className="w-8 h-8" />} title="This preview link isn’t usable" description={problem === 'masked' ? 'The token is a masked display string (••••), not a real key — the old admin panel bug. Start the preview again from Zinbit Admin; it mints a real sk_test_ token.' : 'The link is missing a valid sk_test_ token. Start the preview again from Zinbit Admin.'} />}
          {state === 'expired' && <EmptyState icon={<Clock className="w-8 h-8" />} title="This preview session has expired" description="Preview tokens live for 30 minutes. Start a new preview from Zinbit Admin." />}
          {state === 'forbidden' && <EmptyState tone="error" icon={<ShieldCheck className="w-8 h-8" />} title="Only an admin session can host a preview" description="Switch this console to an admin role and reopen the link." />}
          {state === 'ready' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 flex-wrap"><StatusBadge tone="teal" dot pulse>viewing as {customer}</StatusBadge><StatusBadge tone="neutral">sandbox</StatusBadge><StatusBadge tone="neutral"><Clock className="w-3 h-3" /> expires in {minutes} min</StatusBadge></div>
              <div className="rounded-xl border border-border bg-surface p-4 text-[12px]">
                <div className="text-[10px] font-black uppercase tracking-widest text-fg-muted">Session key</div>
                <div className="font-mono text-fg mt-1">sk_test_••••{token.slice(-4)} <span className="text-fg-muted">· {fingerprint}</span></div>
                <div className="text-fg-muted mt-1">Added to API Keys as <span className="font-bold text-fg">Preview · {customer}</span> by {operator}. It is a real, header-safe token — the gateway provisions it on first use — and it is revoked when you exit or when it expires.</div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Button onClick={() => router.push('/console/explorer')} icon={<Compass className="w-4 h-4" />}>Open the Explorer and run a sandbox call</Button>
                <Button variant="secondary" onClick={() => router.push('/console/keys')} icon={<ArrowRight className="w-4 h-4" />}>See the key</Button>
              </div>
              <p className="text-[11px] text-fg-muted inline-flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5" /> The banner at the top of every console page shows this preview until it ends.</p>
            </div>
          )}
        </GlassCard>
      </motion.div>
    </div>
  );
}
