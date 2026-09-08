/**
 * Customer communication loop (deep feature 5) — templates, rendering and suggestions.
 *
 * The panel already spots the problems (a key about to expire on live traffic, a wallet
 * running dry). This closes the loop: an operator sends the customer a message about it
 * — email or in-app — from a small catalog of deterministic templates, and the panel
 * *suggests* the right message from the current signals. Pure and deterministic.
 */

import type { Customer, WalletSnapshot, KeyInsight } from './types';

export type MessageChannel = 'email' | 'in_app';
export type MessageTemplateId = 'key_expiry' | 'wallet_low' | 'wallet_zero' | 'limit_available' | 'trial_nudge' | 'incident_notice';
export type MessageCategory = 'lifecycle' | 'billing' | 'ops';

export interface MessageVars {
  customerName: string;
  days?: number;
  keyLast4?: string;
  balance?: number;
  lastTopUp?: number;
  usedPct?: number;
}

export interface RenderedMessage { subject: string; body: string }

export interface MessageTemplate {
  id: MessageTemplateId;
  label: string;
  description: string;
  category: MessageCategory;
  channelDefault: MessageChannel;
  render: (v: MessageVars) => RenderedMessage;
}

const cr = (n: number | undefined) => (n ?? 0).toLocaleString();

export const MESSAGE_TEMPLATES: MessageTemplate[] = [
  {
    id: 'key_expiry', label: 'Key expiring soon', description: 'A live key is close to expiry while still serving traffic.', category: 'ops', channelDefault: 'email',
    render: (v) => ({ subject: `Action needed: your Zinbit API key expires in ${v.days ?? 0} days`, body: `Hi ${v.customerName} team,\n\nYour API key ending ••••${v.keyLast4 ?? '----'} expires in ${v.days ?? 0} day${v.days === 1 ? '' : 's'} and is still handling live requests. To avoid an outage, roll it before then (Settings → API keys → Regenerate) and update the secret in your environment.\n\nWe can extend it by 90 days if you need more time — just reply.\n\n— Zintlr` }),
  },
  {
    id: 'wallet_low', label: 'Credits running low', description: 'Wallet is below 10% of the last top-up.', category: 'billing', channelDefault: 'email',
    render: (v) => ({ subject: 'Your Zinbit credits are running low', body: `Hi ${v.customerName} team,\n\nYou have ${cr(v.balance)} credits left${v.lastTopUp ? ` of your last ${cr(v.lastTopUp)} top-up` : ''}. At your current usage that runs out soon, and billed calls will start to fail once it hits zero.\n\nTop up from Billing to keep things running, or reply and we'll set up auto-recharge.\n\n— Zintlr` }),
  },
  {
    id: 'wallet_zero', label: 'Credits exhausted', description: 'Wallet has hit zero — calls are being rejected.', category: 'billing', channelDefault: 'email',
    render: (v) => ({ subject: 'Your Zinbit credits are exhausted — calls are failing', body: `Hi ${v.customerName} team,\n\nYour credit balance has reached zero, so billed API calls are now returning 402. Add credits from Billing to restore service immediately.\n\nIf this is a surprise, reply and we'll help you get back up and set a low-balance alert.\n\n— Zintlr` }),
  },
  {
    id: 'limit_available', label: 'We can raise your limit', description: 'Offer a rate/limit increase to a growing account.', category: 'lifecycle', channelDefault: 'email',
    render: (v) => ({ subject: 'Ready to raise your Zinbit throughput', body: `Hi ${v.customerName} team,\n\nYour usage has been climbing and you're close to your current limits. We can raise your rate limit and per-key credit cap so you don't get throttled during peaks.\n\nReply and we'll get it set up.\n\n— Zintlr` }),
  },
  {
    id: 'trial_nudge', label: 'Trial converting', description: 'A trial has burned most of its grant — nudge to a plan.', category: 'lifecycle', channelDefault: 'in_app',
    render: (v) => ({ subject: 'You’re getting real value from Zinbit', body: `Hi ${v.customerName} team,\n\nYou've used ${v.usedPct ?? 0}% of your trial credits — nice. To keep going without interruption, pick a plan and we'll carry over your setup and keys.\n\nWant a quick walkthrough of the right plan for your volume? Reply and we'll set up 15 minutes.\n\n— Zintlr` }),
  },
  {
    id: 'incident_notice', label: 'Incident / heads-up', description: 'A general operational heads-up.', category: 'ops', channelDefault: 'in_app',
    render: (v) => ({ subject: 'A quick heads-up from Zintlr', body: `Hi ${v.customerName} team,\n\nWe wanted to flag something on your account and make sure you have what you need. We're here if you have questions — just reply.\n\n— Zintlr` }),
  },
];

const BY_ID = MESSAGE_TEMPLATES.reduce((acc, t) => { acc[t.id] = t; return acc; }, {} as Record<MessageTemplateId, MessageTemplate>);
export function messageTemplate(id: MessageTemplateId): MessageTemplate | null { return BY_ID[id] ?? null; }
export function renderMessage(id: MessageTemplateId, vars: MessageVars): RenderedMessage | null { return BY_ID[id] ? BY_ID[id].render(vars) : null; }

export interface CustomerMessage {
  id: string;
  customerId: string;
  customerName: string;
  to: string;
  channel: MessageChannel;
  templateId: MessageTemplateId;
  subject: string;
  body: string;
  sentBy: string;
  sentAt: string;
  /** Optional link back to the signal that prompted it. */
  relatedTo: string | null;
}

export interface MessageSuggestion {
  templateId: MessageTemplateId;
  customerId: string;
  customerName: string;
  channel: MessageChannel;
  reason: string;
  vars: MessageVars;
  priority: number;
}

/** Derive the messages worth sending a customer right now from its live signals. */
export function deriveSuggestions(customer: Customer, wallet: WalletSnapshot, keyInsights: KeyInsight[]): MessageSuggestion[] {
  const out: MessageSuggestion[] = [];
  const base = { customerId: customer.id, customerName: customer.name };
  const worstKey = keyInsights.filter((k) => k.key.customerId === customer.id).sort((a, b) => a.daysLeft - b.daysLeft)[0];
  if (worstKey) out.push({ ...base, templateId: 'key_expiry', channel: 'email', reason: `Key ••••${worstKey.key.last4} expires in ${worstKey.daysLeft}d, still in use`, vars: { customerName: customer.name, days: worstKey.daysLeft, keyLast4: worstKey.key.last4 }, priority: worstKey.daysLeft <= 7 ? 0 : 2 });
  if (wallet.atZero) out.push({ ...base, templateId: 'wallet_zero', channel: 'email', reason: `Wallet at zero for ${wallet.hoursAtZero ?? 0}h`, vars: { customerName: customer.name, balance: 0 }, priority: 0 });
  else if (wallet.belowTenPct) out.push({ ...base, templateId: 'wallet_low', channel: 'email', reason: `Balance below 10% of last top-up`, vars: { customerName: customer.name, balance: wallet.balance, lastTopUp: wallet.lastTopUpAmount }, priority: 1 });
  if (customer.plan === 'Trial' && wallet.remainingOfLastTopUp !== null && !wallet.atZero) {
    const used = Math.round((1 - wallet.remainingOfLastTopUp) * 100);
    if (used >= 60) out.push({ ...base, templateId: 'trial_nudge', channel: 'in_app', reason: `Trial ${used}% used`, vars: { customerName: customer.name, usedPct: used }, priority: 2 });
  }
  return out.sort((a, b) => a.priority - b.priority);
}
