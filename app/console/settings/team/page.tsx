'use client';

import { useStore } from '@/lib/store';
import { CheckCircle2, Clock, Trash2, Mail, Plus, Search, RefreshCw, ShieldCheck, X } from 'lucide-react';
import { track } from '@/lib/telemetry';
import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { useToast } from '@/components/Toast';
import RoleGuard from '@/components/RoleGuard';

export default function TeamSettingsPage() {
  const { teamMembers, addTeamMember, removeTeamMember, updateTeamMemberRole } = useStore();
  
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'developer' | 'billing'>('developer');
  const toast = useToast();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'pending'>('all');
  const [isGovernanceDismissed, setIsGovernanceDismissed] = useState(false);

  const handleInvite = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail) return;
    try {
      addTeamMember(inviteEmail, inviteRole);
      // Prototype: the invitee accepts shortly after, so the invite loop (pending → active) is visible end-to-end.
      const invitedEmail = inviteEmail;
      window.setTimeout(() => {
        const s = useStore.getState();
        const pending = s.teamMembers.find(m => m.email === invitedEmail && m.status === 'pending');
        if (pending) {
          s.acceptTeamInvite(pending.id);
          track('invite_accepted', { role: pending.role });
          toast.success('Invitation accepted', `${invitedEmail} joined the workspace.`);
        }
      }, 8000);
      track('invite_sent', { role: inviteRole });
      setInviteEmail('');
      setInviteRole('developer');
      setIsInviteModalOpen(false);
    } catch (err: unknown) {
      toast.error('Invitation failed', err instanceof Error ? err.message : 'Please try again.');
    }
  };

  const handleResend = (id: string) => {
    toast.success('Invitation resent', `Invitation has been resent to user ${id}.`);
  };

  // Enterprise-expand hook: once a workspace has a real team, surface governance.
  const showGovernance = teamMembers.length >= 3;
  useEffect(() => {
    if (showGovernance) track('upgrade_prompt_shown', { surface: 'team-governance', reason: 'team-size' });
  }, [showGovernance]);

  const filteredMembers = useMemo(() => {
    return teamMembers.filter(m => {
      const matchesSearch = m.email.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === 'all' || m.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [teamMembers, searchQuery, statusFilter]);

  const roleColors = {
    admin: 'bg-semantic-error/10 text-semantic-error border-semantic-error/20',
    developer: 'bg-teal/10 text-teal border-teal/20',
    billing: 'bg-semantic-warning/10 text-semantic-warning border-semantic-warning/20',
  };

  return (
    <RoleGuard allowedRoles={['admin']}>
      <div className="space-y-8 animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h2 className="text-xl font-bold text-fg mb-2">Team Members</h2>
          <p className="text-fg-muted text-sm">Manage who has access to this workspace and their roles.</p>
        </div>
        <button 
          onClick={() => setIsInviteModalOpen(true)}
          className="bg-surface text-fg font-bold px-5 py-2.5 rounded-xl shadow-[0_0_15px_rgba(255,255,255,0.1)] hover:shadow-[0_0_20px_rgba(255,255,255,0.2)] hover:bg-neutral-200 transition-all flex items-center gap-2 flex-shrink-0"
        >
          <Plus className="w-4 h-4" />
          Invite Member
        </button>
      </div>

      {showGovernance && !isGovernanceDismissed && (
        <motion.div
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          className="flex flex-col md:flex-row md:items-center justify-between gap-4 rounded-2xl border border-indigo-500/30 bg-indigo-500/5 p-5"
        >
          <div className="flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-indigo-300 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-fg">Your team is growing — lock down governance</p>
              <p className="text-xs text-fg-muted mt-1">
                With {teamMembers.length} members, enterprise workspaces typically enable SSO, enforce IP allowlists, and review the audit trail weekly.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link
              href="/console/settings/security"
              onClick={() => track('upgrade_prompt_clicked', { surface: 'team-governance', target: 'security' })}
              className="text-xs font-bold px-3 py-2 rounded-lg bg-indigo-500/15 text-indigo-200 border border-indigo-500/30 hover:bg-indigo-500/25 transition-colors"
            >
              Security settings
            </Link>
            <Link
              href="/console/settings/audit"
              onClick={() => track('upgrade_prompt_clicked', { surface: 'team-governance', target: 'audit' })}
              className="text-xs font-bold px-3 py-2 rounded-lg bg-glass text-fg-muted border border-border hover:text-fg transition-colors"
            >
              Audit logs
            </Link>
            <button
              type="button"
              aria-label="Dismiss governance suggestion"
              onClick={() => { setIsGovernanceDismissed(true); track('upgrade_prompt_dismissed', { surface: 'team-governance' }); }}
              className="p-2 rounded-lg text-fg-muted hover:text-fg hover:bg-glass transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </motion.div>
      )}

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-muted" />
          <input 
            type="text" 
            placeholder="Search by email..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-surface border border-border rounded-xl py-2 pl-10 pr-4 text-sm text-fg focus:outline-none focus:border-teal/50 transition-all"
          />
        </div>
        <div className="flex bg-surface p-1 rounded-xl border border-border">
          {(['all', 'active', 'pending'] as const).map(status => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold capitalize transition-all ${
                statusFilter === status ? 'bg-surface/10 text-fg' : 'text-fg-muted hover:text-fg-muted'
              }`}
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      {/* Team Members List */}
      <div className="glass-inner rounded-2xl border border-border shadow-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-surface/80 border-b border-border text-fg-muted font-bold uppercase tracking-wider text-[10px]">
              <tr>
                <th className="px-6 py-4">User</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Role</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-fg">
              {filteredMembers.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-fg-muted">No team members found.</td>
                </tr>
              ) : filteredMembers.map((member) => (
                <tr key={member.id} className="hover:bg-surface/5 transition-colors group">
                  <td className="px-6 py-5">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-surface/10 flex items-center justify-center font-bold text-fg-muted">
                        {member.email.charAt(0).toUpperCase()}
                      </div>
                      <span className="font-semibold text-fg">{member.email}</span>
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    {member.status === 'active' ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-widest bg-semantic-success/10 text-semantic-success border border-semantic-success/20">
                        <CheckCircle2 className="w-3 h-3" /> Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-widest bg-surface/5 text-fg-muted border border-border">
                        <Clock className="w-3 h-3" /> Pending
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-5">
                    <select
                      value={member.role}
                      onChange={(e) => updateTeamMemberRole(member.id, e.target.value as 'admin' | 'developer' | 'billing')}
                      className={`appearance-none bg-transparent outline-none cursor-pointer px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-widest border transition-colors ${roleColors[member.role]}`}
                    >
                      <option value="admin" className="bg-surface text-semantic-error">Admin</option>
                      <option value="developer" className="bg-surface text-teal">Developer</option>
                      <option value="billing" className="bg-surface text-semantic-warning">Billing</option>
                    </select>
                  </td>
                  <td className="px-6 py-5 text-right flex items-center justify-end gap-2">
                    {member.status === 'pending' && (
                      <button 
                        onClick={() => handleResend(member.id)}
                        className="p-2 hover:bg-surface/10 text-fg-muted hover:text-fg rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                        title="Resend Invite"
                      >
                        <RefreshCw className="w-4 h-4" />
                      </button>
                    )}
                    <button 
                      onClick={() => removeTeamMember(member.id)}
                      className="p-2 hover:bg-semantic-error/10 text-fg-muted hover:text-semantic-error rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                      title="Revoke Access"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Invite Modal */}
      <AnimatePresence>
        {isInviteModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-overlay backdrop-blur-sm"
              onClick={() => setIsInviteModalOpen(false)}
            />
            
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-surface border border-border rounded-2xl shadow-2xl overflow-hidden z-10"
            >
              <div className="p-6 border-b border-border">
                <h3 className="text-xl font-bold text-fg mb-1">Invite Team Member</h3>
                <p className="text-sm text-fg-muted">Send an invitation link to collaborate.</p>
              </div>
              
              <form onSubmit={handleInvite} className="p-6 space-y-6">
                <div className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-black text-fg-muted uppercase tracking-widest mb-2">Email Address</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-muted" />
                      <input 
                        type="email" 
                        required
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        placeholder="colleague@company.com" 
                        className="w-full bg-[#111116] border border-border rounded-xl py-3 pl-10 pr-4 text-sm text-fg placeholder-white/20 focus:outline-none focus:border-teal/50 focus:ring-1 focus:ring-teal/50 transition-all"
                      />
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-[10px] font-black text-fg-muted uppercase tracking-widest mb-2">Role Assignment</label>
                    <div className="grid grid-cols-3 gap-3">
                      {(['admin', 'developer', 'billing'] as const).map((r) => (
                        <button
                          key={r}
                          type="button"
                          onClick={() => setInviteRole(r)}
                          className={`py-2 px-3 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all ${
                            inviteRole === r 
                              ? 'bg-teal/10 border-teal/50 text-teal' 
                              : 'bg-surface/5 border-border text-fg-muted hover:bg-surface/10 hover:text-fg'
                          }`}
                        >
                          {r}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                
                <div className="flex gap-3 pt-2">
                  <button 
                    type="button"
                    onClick={() => setIsInviteModalOpen(false)}
                    className="flex-1 py-3 px-4 rounded-xl font-bold text-fg-muted hover:text-fg hover:bg-surface/5 border border-transparent transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 py-3 px-4 rounded-xl font-bold bg-surface text-fg hover:bg-surface/90 transition-colors shadow-[0_0_15px_rgba(255,255,255,0.1)]"
                  >
                    Send Invite
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
    </RoleGuard>
  );
}
