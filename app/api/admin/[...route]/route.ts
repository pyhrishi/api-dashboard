import { NextRequest, NextResponse } from 'next/server';
import {
  AdminError, listCustomers, getCustomer, listKeys, getKey, keyInsights, walletSnapshots, walletDetail, funnel, ledger, ledgerCsv, overview,
  customerMetricsFor, startPreview, endPreview, listSessions, createKey, updateKey, setKeyStatus, regenerateKey, deleteKey,
  listAccessRequests, getAccessRequest, decideAccessRequest, commentAccessRequest, listTriggers, updateTrigger, runTriggers, listHandoffs,
  updateHandoff, listAudit, activeSessions,
  alertsOverview, evaluateAlertsNow, ackAlert, resolveAlert, snoozeAlert, updateAlertRule,
  abuse, dismissAbuseSignal,
  health, createFollowup,
  approvalsOverview, submitChange, decideChange,
  messagingOverview, sendCustomerMessage,
  type Actor,
} from '@/lib/admin/service';
import type { AdminRole, KeyStatus, HandoffState } from '@/lib/admin/types';
import type { ChangeKind } from '@/lib/admin/approvals';
import type { MessageTemplateId, MessageChannel } from '@/lib/admin/messaging';
import type { TimeframeKey } from '@/lib/admin/insights';

/**
 * Mock admin API. In production these calls are served by the products' admin
 * services behind Zintlr internal SSO; the operator identity arrives as a verified
 * JWT. Here the identity comes from `x-admin-actor` / `x-admin-role` headers set by
 * the admin app's own (mock) session — enough to exercise RBAC end to end.
 */
export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };
const ok = (data: unknown, status = 200) => NextResponse.json({ success: true, data, metadata: { timestamp: Date.now() } }, { status, headers });
const fail = (status: number, code: string, message: string) => NextResponse.json({ success: false, error: { code, message } }, { status, headers });
const actorOf = (req: NextRequest): Actor => {
  const role = req.headers.get('x-admin-role');
  const email = req.headers.get('x-admin-actor') || 'unknown@zintlr.com';
  const r: AdminRole = role === 'superadmin' || role === 'ops' || role === 'sales' || role === 'finance' ? role : 'ops';
  return { email, role: r };
};
async function body(req: NextRequest): Promise<Record<string, unknown>> {
  try { const b = await req.json(); return b && typeof b === 'object' ? (b as Record<string, unknown>) : {}; } catch { return {}; }
}
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const frameOf = (v: string | null): TimeframeKey => (v === '1h' || v === '24h' || v === '7d' || v === '30d' ? v : '7d');

function handle(fn: () => NextResponse | Promise<NextResponse>): Promise<NextResponse> {
  return Promise.resolve().then(fn).catch((e: unknown) => {
    if (e instanceof AdminError) return fail(e.status, e.code, e.message);
    return fail(500, 'INTERNAL', e instanceof Error ? e.message : 'Unexpected error.');
  });
}

export async function GET(request: NextRequest, { params }: { params: { route: string[] } }) {
  const [a, b, c] = params.route;
  const q = request.nextUrl.searchParams;
  return handle(() => {
    if (a === 'overview') return ok(overview());
    if (a === 'funnel') return ok(funnel({ product: (q.get('product') as never) || 'all', plan: (q.get('plan') as never) || 'all', region: (q.get('region') as never) || 'all', sinceDays: Number(q.get('sinceDays')) || undefined }));
    if (a === 'customers' && !b) return ok(listCustomers());
    if (a === 'customers' && b && !c) {
      const cust = getCustomer(b);
      if (!cust) return fail(404, 'CUSTOMER_NOT_FOUND', 'Unknown customer.');
      return ok({ customer: cust, keys: listKeys(b), wallet: walletDetail(b), metrics: customerMetricsFor(b), accessRequests: listAccessRequests().filter((r) => r.customerId === b), audit: listAudit({ customerId: b }).slice(0, 50), sessions: activeSessions(b) });
    }
    if (a === 'customers' && b && c === 'ledger') {
      const status = q.get('status');
      return ok(ledger({ customerId: b, frame: frameOf(q.get('frame')), status: status ? (/^\d+$/.test(status) ? Number(status) : (status as '2xx' | '4xx' | '5xx')) : undefined, endpoint: q.get('endpoint') || undefined, keyId: q.get('key') || undefined, cursor: Number(q.get('cursor')) || 0, limit: Number(q.get('limit')) || 50 }));
    }
    if (a === 'keys' && !b) return ok(listKeys(q.get('customer') || undefined));
    if (a === 'keys' && b) { const k = getKey(b); return k ? ok(k) : fail(404, 'KEY_NOT_FOUND', 'Unknown key.'); }
    if (a === 'insights' && b === 'keys') return ok(keyInsights());
    if (a === 'insights' && b === 'wallets') return ok(walletSnapshots().map((s) => ({ ...s, customerName: getCustomer(s.customerId)?.name ?? s.customerId })));
    if (a === 'wallets' && b) return ok(walletDetail(b));
    if (a === 'ledger') {
      const status = q.get('status');
      if (q.get('format') === 'csv') return new NextResponse(ledgerCsv({ customerId: q.get('customer') || undefined, frame: frameOf(q.get('frame')), status: status ? (/^\d+$/.test(status) ? Number(status) : (status as '2xx' | '4xx' | '5xx')) : undefined, endpoint: q.get('endpoint') || undefined }), { status: 200, headers: { ...headers, 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="ledger-metadata.csv"' } });
      return ok(ledger({ customerId: q.get('customer') || undefined, frame: frameOf(q.get('frame')), status: status ? (/^\d+$/.test(status) ? Number(status) : (status as '2xx' | '4xx' | '5xx')) : undefined, endpoint: q.get('endpoint') || undefined, cursor: Number(q.get('cursor')) || 0, limit: Number(q.get('limit')) || 50 }));
    }
    if (a === 'access-requests' && !b) return ok(listAccessRequests());
    if (a === 'access-requests' && b) { const r = getAccessRequest(b); return r ? ok({ request: r, customer: getCustomer(r.customerId), audit: listAudit({ customerId: r.customerId }).filter((x) => x.target === r.id) }) : fail(404, 'REQUEST_NOT_FOUND', 'Unknown access request.'); }
    if (a === 'triggers') return ok({ triggers: listTriggers(), handoffs: listHandoffs() });
    if (a === 'audit') return ok(listAudit({ customerId: q.get('customer') || undefined, actor: q.get('actor') || undefined }).slice(0, Number(q.get('limit')) || 200));
    if (a === 'preview' && b === 'sessions') return ok(listSessions());
    if (a === 'alerts') return ok(alertsOverview());
    if (a === 'abuse') return ok(abuse());
    if (a === 'health') return ok(health());
    if (a === 'approvals') return ok(approvalsOverview());
    if (a === 'messages') return ok(messagingOverview());
    return fail(404, 'NOT_FOUND', 'Unknown admin route.');
  });
}

export async function POST(request: NextRequest, { params }: { params: { route: string[] } }) {
  const [a, b, c] = params.route;
  const actor = actorOf(request);
  return handle(async () => {
    const rec = await body(request);
    if (a === 'preview' && b === 'start') return ok(startPreview(actor, str(rec.customerId), str(rec.reason)), 201);
    if (a === 'preview' && b === 'end') return ok(endPreview(actor, str(rec.sessionId)));
    if (a === 'customers' && b && c === 'keys') return ok(createKey(actor, b, { ...(rec as object), environment: rec.environment === 'live' ? 'live' : 'sandbox' }, str(rec.reason)), 201);
    if (a === 'keys' && b && c === 'status') {
      const s = str(rec.status) as KeyStatus;
      if (s !== 'active' && s !== 'suspended' && s !== 'revoked') return fail(400, 'VALIDATION_ERROR', "status must be active | suspended | revoked.");
      return ok(setKeyStatus(actor, b, s, str(rec.reason)));
    }
    if (a === 'keys' && b && c === 'regenerate') return ok(regenerateKey(actor, b, str(rec.reason)));
    if (a === 'access-requests' && b && c === 'decision') {
      const action = str(rec.action);
      if (action !== 'approved' && action !== 'denied' && action !== 'needs_info') return fail(400, 'VALIDATION_ERROR', 'action must be approved | denied | needs_info.');
      return ok(decideAccessRequest(actor, b, action, str(rec.reason)));
    }
    if (a === 'access-requests' && b && c === 'comments') return ok(commentAccessRequest(actor, b, str(rec.note)), 201);
    if (a === 'alerts' && b === 'evaluate') return ok(evaluateAlertsNow(actor));
    if (a === 'abuse' && b === 'dismiss') return ok(dismissAbuseSignal(actor, str(rec.signalId), str(rec.reason)));
    if (a === 'health' && b === 'followup') { const kind = str(rec.kind); if (kind !== 'churn' && kind !== 'expansion') return fail(400, 'VALIDATION_ERROR', 'kind must be churn | expansion.'); return ok(createFollowup(actor, str(rec.customerId), kind, str(rec.note)), 201); }
    if (a === 'approvals' && b === 'submit') { const kind = str(rec.kind) as ChangeKind; if (kind !== 'grant_credits' && kind !== 'raise_limit' && kind !== 'delete_key') return fail(400, 'VALIDATION_ERROR', 'Unknown change kind.'); return ok(submitChange(actor, kind, { customerId: str(rec.customerId), keyId: rec.keyId ? str(rec.keyId) : null, payload: (rec.payload && typeof rec.payload === 'object' ? rec.payload : {}) as never }, str(rec.reason)), 201); }
    if (a === 'approvals' && b && c === 'decision') { const decision = str(rec.decision); if (decision !== 'approve' && decision !== 'reject') return fail(400, 'VALIDATION_ERROR', 'decision must be approve | reject.'); return ok(decideChange(actor, b, decision, str(rec.reason))); }
    if (a === 'messages' && b === 'send') return ok(sendCustomerMessage(actor, { customerId: str(rec.customerId), templateId: str(rec.templateId) as MessageTemplateId, channel: (str(rec.channel) || undefined) as MessageChannel | undefined, vars: (rec.vars && typeof rec.vars === 'object' ? rec.vars : {}) as never, relatedTo: rec.relatedTo ? str(rec.relatedTo) : null }), 201);
    if (a === 'alerts' && b && c === 'ack') return ok(ackAlert(actor, b, str(rec.reason)));
    if (a === 'alerts' && b && c === 'resolve') return ok(resolveAlert(actor, b, str(rec.reason)));
    if (a === 'alerts' && b && c === 'snooze') return ok(snoozeAlert(actor, b, Number(rec.hours) || 4, str(rec.reason)));
    if (a === 'triggers' && b === 'run') return ok(runTriggers(actor));
    if (a === 'handoffs' && b) {
      const s = str(rec.state) as HandoffState;
      if (!['new', 'contacted', 'converted', 'closed'].includes(s)) return fail(400, 'VALIDATION_ERROR', 'state must be new | contacted | converted | closed.');
      return ok(updateHandoff(actor, b, s, str(rec.note)));
    }
    return fail(404, 'NOT_FOUND', 'Unknown admin route.');
  });
}

export async function PATCH(request: NextRequest, { params }: { params: { route: string[] } }) {
  const [a, b] = params.route;
  const actor = actorOf(request);
  return handle(async () => {
    const rec = await body(request);
    if (a === 'keys' && b) return ok(updateKey(actor, b, rec.patch ?? rec, str(rec.reason)));
    if (a === 'triggers' && b) return ok(updateTrigger(actor, b, rec as never, str(rec.reason)));
    if (a === 'alert-rules' && b) return ok(updateAlertRule(actor, b, rec.patch ?? rec, str(rec.reason)));
    return fail(404, 'NOT_FOUND', 'Unknown admin route.');
  });
}

export async function DELETE(request: NextRequest, { params }: { params: { route: string[] } }) {
  const [a, b] = params.route;
  const actor = actorOf(request);
  return handle(async () => {
    const rec = await body(request);
    if (a === 'keys' && b) return ok(deleteKey(actor, b, str(rec.reason) || str(request.nextUrl.searchParams.get('reason'))));
    return fail(404, 'NOT_FOUND', 'Unknown admin route.');
  });
}
