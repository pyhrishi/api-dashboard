/**
 * Admin session store. The prototype signs operators in through a mock Zintlr SSO
 * screen (role picked at sign-in); production gets the identity and role from the
 * verified SSO token. Persisted per browser so a reload keeps the session.
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { AdminRole } from '@/lib/admin/types';

export interface Operator { email: string; name: string; role: AdminRole; signedInAt: string }

export const ROLE_LABEL: Record<AdminRole, string> = { superadmin: 'Super admin', ops: 'Ops / Support', sales: 'Sales', finance: 'Finance' };
export const ROLE_BLURB: Record<AdminRole, string> = {
  superadmin: 'Everything, including deleting keys and editing triggers.',
  ops: 'Tokens, preview mode, access requests, ledger.',
  sales: 'Funnel, triggers and handoffs; read-only elsewhere.',
  finance: 'Wallets, costs and trends; read-only elsewhere.',
};

/** What each role may do — mirrored by the API. */
export const CAN = {
  manageKeys: (r: AdminRole) => r === 'superadmin' || r === 'ops',
  deleteKeys: (r: AdminRole) => r === 'superadmin',
  preview: (r: AdminRole) => r === 'superadmin' || r === 'ops',
  decideAccess: (r: AdminRole) => r === 'superadmin' || r === 'ops',
  editTriggers: (r: AdminRole) => r === 'superadmin' || r === 'sales',
  updateHandoffs: (r: AdminRole) => r === 'superadmin' || r === 'sales',
};

export interface AdminState {
  operator: Operator | null;
  themeMode: 'light' | 'dark';
  signIn: (email: string, name: string, role: AdminRole) => void;
  signOut: () => void;
  setThemeMode: (mode: 'light' | 'dark') => void;
}

export const useStore = create<AdminState>()(
  persist(
    (set) => ({
      // Open demo: land signed-in as a super admin so anyone opening /admin sees the panel.
      operator: { email: 'demo@zintlr.com', name: 'Demo Operator', role: 'superadmin', signedInAt: '' },
      themeMode: 'dark',
      signIn: (email, name, role) => set({ operator: { email, name, role, signedInAt: new Date().toISOString() } }),
      signOut: () => set({ operator: null }),
      setThemeMode: (mode) => set({ themeMode: mode }),
    }),
    { name: 'zinbit-admin-session', storage: createJSONStorage(() => localStorage) },
  ),
);
