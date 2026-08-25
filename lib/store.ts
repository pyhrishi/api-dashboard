import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface MockKey {
  id: string;
  name: string;
  key: string;
  createdAt: string;
  lastUsed?: string | null;
  expiresAt?: string | null;
  scopes: string[];
  allowedIps?: string[];
  status: 'active' | 'expiring_soon' | 'expired' | 'revoked';
}

export interface User {
  email: string;
  company: string;
  role: 'admin' | 'developer' | 'billing';
}

export interface TeamMember {
  id: string;
  email: string;
  role: 'admin' | 'developer' | 'billing';
  status: 'active' | 'pending';
  joinedAt: string;
}

export interface ActiveSession {
  id: string;
  device: string;
  browser: string;
  location: string;
  ip: string;
  lastActive: string;
  isCurrent: boolean;
}

export interface AuditLog {
  id: string;
  actorEmail: string;
  action: string;
  resource: string;
  timestamp: string;
}

export interface UsageAlert {
  id: string;
  thresholdPercentage: number;
  channels: ('email' | 'webhook')[];
  isActive: boolean;
}

export interface WebhookEndpoint {
  id: string;
  url: string;
  events: string[];
  status: 'active' | 'failing';
  createdAt: string;
}

export interface WebhookLog {
  id: string;
  endpointId: string;
  event: string;
  status: number;
  time: string;
  payload: string;
  attempt?: number;
}

export interface LastRequestDetails {
  endpoint: string;
  method: string;
  statusCode: number;
  responseTime: number;
  response: any;
  timestamp: number;
}

// First-Call Optimization State
export interface FirstCallState {
  // Checklist progress
  completedOnboardingSteps: ('signup' | 'apiKey' | 'firstCall' | 'exploreMore')[];
  
  // First-call tracking
  isFirstCallMade: boolean;
  firstCallTimestamp?: number; // Unix timestamp
  
  // Wizard state
  currentWizardStep: 0 | 1 | 2 | 3;
  selectedEndpointId?: string;
  configuredParameters: Record<string, any>;
  
  // Last request details (for celebration display)
  lastRequestDetails?: LastRequestDetails;
  
  // Actions
  markOnboardingStepComplete: (step: 'signup' | 'apiKey' | 'firstCall' | 'exploreMore') => void;
  markFirstCallMade: (details: {
    endpoint: string;
    method: string;
    statusCode: number;
    responseTime: number;
    response: any;
  }) => void;
  updateWizardStep: (step: 0 | 1 | 2 | 3) => void;
  updateSelectedEndpoint: (endpointId: string) => void;
  updateConfiguredParameters: (params: Record<string, any>) => void;
  resetWizard: () => void;
}

interface AppState extends FirstCallState {
  environment: 'sandbox' | 'live';
  creditBalance: number;
  activeKeys: MockKey[];
  user: User | null;
  isAuthenticated: boolean;
  webhooks: WebhookEndpoint[];
  webhookLogs: WebhookLog[];
  teamMembers: TeamMember[];
  is2faEnabled: boolean;
  activeSessions: ActiveSession[];
  auditLogs: AuditLog[];
  usageAlerts: UsageAlert[];
  ipWhitelist: string[];
  
  toggleEnvironment: () => void;
  deductCredits: (amount: number) => void;
  addKey: (key: MockKey) => void;
  revokeKey: (id: string) => void;
  rollKey: (id: string, newKey: MockKey) => void;
  signup: (email: string, company: string) => void;
  login: (email: string) => void;
  logout: () => void;
  switchRole: (role: 'admin' | 'developer' | 'billing') => void;
  
  addTeamMember: (email: string, role: 'admin' | 'developer' | 'billing') => void;
  removeTeamMember: (id: string) => void;
  updateTeamMemberRole: (id: string, role: 'admin' | 'developer' | 'billing') => void;
  
  enable2fa: () => void;
  disable2fa: () => void;
  revokeSession: (id: string) => void;

  addUsageAlert: (thresholdPercentage: number, channels: ('email' | 'webhook')[]) => void;
  toggleUsageAlert: (id: string) => void;
  deleteUsageAlert: (id: string) => void;
  
  addIpWhitelist: (ip: string) => void;
  removeIpWhitelist: (ip: string) => void;
  
  addWebhook: (url: string, events: string[]) => void;
  deleteWebhook: (id: string) => void;
  logWebhookEvent: (endpointId: string, event: string, status: number, payload: string, attempt?: number) => void;
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      // App State
      environment: 'sandbox',
      creditBalance: 5000,
      activeKeys: [{
        id: 'key_default',
        name: 'Default Sandbox Key',
        key: 'sk_test_demo_key',
        createdAt: new Date().toISOString(),
        scopes: ['all'],
        status: 'active'
      }],
      user: { email: 'demo@example.com', company: 'Acme Corp', role: 'admin' },
      isAuthenticated: true,
      webhooks: [],
      webhookLogs: [],
      teamMembers: [
        { id: 'usr_1', email: 'demo@example.com', role: 'admin', status: 'active', joinedAt: new Date().toISOString() },
        { id: 'usr_2', email: 'developer@example.com', role: 'developer', status: 'active', joinedAt: new Date().toISOString() },
        { id: 'usr_3', email: 'finance@example.com', role: 'billing', status: 'pending', joinedAt: new Date().toISOString() }
      ],
      is2faEnabled: false,
      activeSessions: [
        { id: 'sess_1', device: 'MacBook Pro', browser: 'Chrome', location: 'New York, US', ip: '192.168.1.1', lastActive: new Date().toISOString(), isCurrent: true },
        { id: 'sess_2', device: 'iPhone 14 Pro', browser: 'Safari', location: 'New York, US', ip: '172.16.254.1', lastActive: new Date(Date.now() - 3600000).toISOString(), isCurrent: false },
        { id: 'sess_3', device: 'Windows Desktop', browser: 'Firefox', location: 'London, UK', ip: '10.0.0.5', lastActive: new Date(Date.now() - 86400000).toISOString(), isCurrent: false }
      ],
      auditLogs: [
        { id: 'aud_1', actorEmail: 'admin@example.com', action: 'Created API Key', resource: 'Production Key', timestamp: new Date(Date.now() - 3600000).toISOString() },
        { id: 'aud_2', actorEmail: 'developer@example.com', action: 'Created Webhook', resource: 'https://api.acme.com/hooks', timestamp: new Date(Date.now() - 86400000).toISOString() }
      ],
      usageAlerts: [
        { id: 'alert_1', thresholdPercentage: 80, channels: ['email'], isActive: true },
        { id: 'alert_2', thresholdPercentage: 100, channels: ['email', 'webhook'], isActive: true }
      ],
      ipWhitelist: ['192.168.1.1', '10.0.0.0/24'],


      // First-Call State
      completedOnboardingSteps: ['signup', 'apiKey'],
      isFirstCallMade: false,
      firstCallTimestamp: undefined,
      currentWizardStep: 0,
      selectedEndpointId: undefined,
      configuredParameters: {},
      lastRequestDetails: undefined,

      // App Actions
      toggleEnvironment: () => set((state) => ({ 
        environment: state.environment === 'sandbox' ? 'live' : 'sandbox' 
      })),
      
      deductCredits: (amount) => set((state) => ({ 
        creditBalance: Math.max(0, state.creditBalance - amount) 
      })),
      
      addKey: (key) => set((state) => {
        if (state.user?.role !== 'admin') throw new Error('Unauthorized');
        const log: AuditLog = { id: `aud_${Date.now()}`, actorEmail: state.user?.email || 'System', action: 'Created API Key', resource: key.name, timestamp: new Date().toISOString() };
        return { activeKeys: [key, ...state.activeKeys], auditLogs: [log, ...state.auditLogs] };
      }),
      
      revokeKey: (id) => set((state) => {
        if (state.user?.role !== 'admin') throw new Error('Unauthorized');
        const key = state.activeKeys.find(k => k.id === id);
        const log: AuditLog = { id: `aud_${Date.now()}`, actorEmail: state.user?.email || 'System', action: 'Revoked API Key', resource: key?.name || id, timestamp: new Date().toISOString() };
        return { activeKeys: state.activeKeys.map(k => k.id === id ? { ...k, status: 'revoked' as const } : k), auditLogs: [log, ...state.auditLogs] };
      }),

      rollKey: (id, newKey) => set((state) => {
        if (state.user?.role !== 'admin') throw new Error('Unauthorized');
        const key = state.activeKeys.find(k => k.id === id);
        const log: AuditLog = { id: `aud_${Date.now()}`, actorEmail: state.user?.email || 'System', action: 'Rotated API Key', resource: key?.name || id, timestamp: new Date().toISOString() };
        const updatedKeys = state.activeKeys.map(k => k.id === id ? { ...k, status: 'expiring_soon' as const } : k);
        return { activeKeys: [newKey, ...updatedKeys], auditLogs: [log, ...state.auditLogs] };
      }),

      signup: (email, company) => set((state) => {
        // Auto-provision a sandbox key on signup
        const randomHash = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        const autoKey: MockKey = {
          id: `key_${Date.now()}`,
          name: 'Default Sandbox Key',
          key: `sk_test_${randomHash}`,
          createdAt: new Date().toISOString(),
          scopes: ['people:read', 'company:read', 'webhooks:write'],
          status: 'active',
          lastUsed: new Date().toISOString()
        };
        
        return {
          user: { email, company, role: 'admin' as const },
          isAuthenticated: true,
          activeKeys: [autoKey],
          environment: 'sandbox',
          // Mark first 2 onboarding steps complete
          completedOnboardingSteps: ['signup', 'apiKey'],
        };
      }),

      login: (email) => set((state) => ({
        user: state.user ? { ...state.user, email } : { email, company: 'Acme Corp', role: 'admin' },
        isAuthenticated: true,
      })),

      switchRole: (role) => set((state) => ({
        user: state.user ? { ...state.user, role } : null
      })),

      addTeamMember: (email, role) => set((state) => {
        if (state.user?.role !== 'admin') throw new Error('Unauthorized');
        const newMember: TeamMember = {
          id: `usr_${Date.now()}`,
          email,
          role,
          status: 'pending',
          joinedAt: new Date().toISOString()
        };
        const log: AuditLog = { id: `aud_${Date.now()}`, actorEmail: state.user?.email || 'System', action: 'Invited Team Member', resource: email, timestamp: new Date().toISOString() };
        return { teamMembers: [...state.teamMembers, newMember], auditLogs: [log, ...state.auditLogs] };
      }),

      removeTeamMember: (id) => set((state) => {
        if (state.user?.role !== 'admin') throw new Error('Unauthorized');
        const member = state.teamMembers.find(m => m.id === id);
        const log: AuditLog = { id: `aud_${Date.now()}`, actorEmail: state.user?.email || 'System', action: 'Removed Team Member', resource: member?.email || id, timestamp: new Date().toISOString() };
        return { teamMembers: state.teamMembers.filter(m => m.id !== id), auditLogs: [log, ...state.auditLogs] };
      }),

      updateTeamMemberRole: (id, role) => set((state) => {
        if (state.user?.role !== 'admin') throw new Error('Unauthorized');
        const member = state.teamMembers.find(m => m.id === id);
        const log: AuditLog = { id: `aud_${Date.now()}`, actorEmail: state.user?.email || 'System', action: 'Changed Role', resource: `${member?.email || id} to ${role}`, timestamp: new Date().toISOString() };
        return { teamMembers: state.teamMembers.map(m => m.id === id ? { ...m, role } : m), auditLogs: [log, ...state.auditLogs] };
      }),

      enable2fa: () => set({ is2faEnabled: true }),
      disable2fa: () => set({ is2faEnabled: false }),
      revokeSession: (id) => set((state) => ({
        activeSessions: state.activeSessions.filter(s => s.id !== id)
      })),

      addUsageAlert: (thresholdPercentage, channels) => set((state) => {
        if (state.user?.role !== 'admin' && state.user?.role !== 'billing') throw new Error('Unauthorized');
        const newAlert: UsageAlert = {
          id: `alert_${Date.now()}`,
          thresholdPercentage,
          channels,
          isActive: true
        };
        const log: AuditLog = { id: `aud_${Date.now()}`, actorEmail: state.user?.email || 'System', action: 'Created Usage Alert', resource: `${thresholdPercentage}%`, timestamp: new Date().toISOString() };
        return { usageAlerts: [...state.usageAlerts, newAlert], auditLogs: [log, ...state.auditLogs] };
      }),

      toggleUsageAlert: (id) => set((state) => {
        if (state.user?.role !== 'admin' && state.user?.role !== 'billing') throw new Error('Unauthorized');
        return { usageAlerts: state.usageAlerts.map(a => a.id === id ? { ...a, isActive: !a.isActive } : a) };
      }),

      deleteUsageAlert: (id) => set((state) => {
        if (state.user?.role !== 'admin' && state.user?.role !== 'billing') throw new Error('Unauthorized');
        const log: AuditLog = { id: `aud_${Date.now()}`, actorEmail: state.user?.email || 'System', action: 'Deleted Usage Alert', resource: id, timestamp: new Date().toISOString() };
        return { usageAlerts: state.usageAlerts.filter(a => a.id !== id), auditLogs: [log, ...state.auditLogs] };
      }),
      
      addIpWhitelist: (ip) => set((state) => {
        if (state.user?.role !== 'admin') throw new Error('Unauthorized');
        const log: AuditLog = { id: `aud_${Date.now()}`, actorEmail: state.user?.email || 'System', action: 'Added IP to Whitelist', resource: ip, timestamp: new Date().toISOString() };
        return { ipWhitelist: [...state.ipWhitelist, ip], auditLogs: [log, ...state.auditLogs] };
      }),
      removeIpWhitelist: (ip) => set((state) => {
        if (state.user?.role !== 'admin') throw new Error('Unauthorized');
        const log: AuditLog = { id: `aud_${Date.now()}`, actorEmail: state.user?.email || 'System', action: 'Removed IP from Whitelist', resource: ip, timestamp: new Date().toISOString() };
        return { ipWhitelist: state.ipWhitelist.filter(i => i !== ip), auditLogs: [log, ...state.auditLogs] };
      }),

      logout: () => set({
        user: null,
        isAuthenticated: false,
        activeKeys: [],
        creditBalance: 5000,
        webhooks: [],
        webhookLogs: [],
        // Reset first-call state
        completedOnboardingSteps: [],
        isFirstCallMade: false,
        firstCallTimestamp: undefined,
        currentWizardStep: 0,
        selectedEndpointId: undefined,
        configuredParameters: {},
        lastRequestDetails: undefined,
      }),
      
      addWebhook: (url, events) => set((state) => {
        if (state.user?.role === 'billing') throw new Error('Unauthorized');
        const newEndpoint: WebhookEndpoint = {
          id: `wh_${Date.now()}`,
          url,
          events,
          status: 'active',
          createdAt: new Date().toISOString()
        };
        const log: AuditLog = { id: `aud_${Date.now()}`, actorEmail: state.user?.email || 'System', action: 'Created Webhook', resource: url, timestamp: new Date().toISOString() };
        return { webhooks: [newEndpoint, ...state.webhooks], auditLogs: [log, ...state.auditLogs] };
      }),

      deleteWebhook: (id) => set((state) => {
        if (state.user?.role === 'billing') throw new Error('Unauthorized');
        const endpoint = state.webhooks.find(w => w.id === id);
        const log: AuditLog = { id: `aud_${Date.now()}`, actorEmail: state.user?.email || 'System', action: 'Deleted Webhook', resource: endpoint?.url || id, timestamp: new Date().toISOString() };
        return { webhooks: state.webhooks.filter(w => w.id !== id), auditLogs: [log, ...state.auditLogs] };
      }),

      logWebhookEvent: (endpointId, event, status, payload, attempt = 1) => set((state) => {
        const newLog: WebhookLog = {
          id: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
          endpointId,
          event,
          status,
          time: new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' }),
          payload,
          attempt
        };
        return { webhookLogs: [newLog, ...state.webhookLogs] };
      }),

      // First-Call Actions
      markOnboardingStepComplete: (step) => set((state) => {
        const steps = new Set(state.completedOnboardingSteps);
        steps.add(step);
        return { completedOnboardingSteps: Array.from(steps) };
      }),

      markFirstCallMade: (details) => set((state) => ({
        isFirstCallMade: true,
        firstCallTimestamp: Date.now(),
        completedOnboardingSteps: Array.from(new Set([...state.completedOnboardingSteps, 'firstCall'])) as ('signup' | 'apiKey' | 'firstCall' | 'exploreMore')[],
        lastRequestDetails: {
          endpoint: details.endpoint,
          method: details.method,
          statusCode: details.statusCode,
          responseTime: details.responseTime,
          response: details.response,
          timestamp: Date.now(),
        },
      })),

      updateWizardStep: (step) => set({ currentWizardStep: step }),

      updateSelectedEndpoint: (endpointId) => set({ selectedEndpointId: endpointId }),

      updateConfiguredParameters: (params) => set((state) => ({
        configuredParameters: { ...state.configuredParameters, ...params },
      })),

      resetWizard: () => set({
        currentWizardStep: 0,
        selectedEndpointId: undefined,
        configuredParameters: {},
      }),
    }),
    {
      name: 'zintlr-store-v2', // localStorage key
      partialize: (state) => ({
        // Persist both app and first-call state
        environment: state.environment,
        creditBalance: state.creditBalance,
        activeKeys: state.activeKeys,
        user: state.user,
        isAuthenticated: state.isAuthenticated,
        webhooks: state.webhooks,
        teamMembers: state.teamMembers,
        is2faEnabled: state.is2faEnabled,
        activeSessions: state.activeSessions,
        auditLogs: state.auditLogs,
        usageAlerts: state.usageAlerts,
        // First-call state persistence
        completedOnboardingSteps: state.completedOnboardingSteps,
        isFirstCallMade: state.isFirstCallMade,
        firstCallTimestamp: state.firstCallTimestamp,
        lastRequestDetails: state.lastRequestDetails,
      }),
    }
  )
);
