'use client';

import { useStore } from '@/lib/store';
import { CheckCircle2, Clock, Trash2, Mail, Plus, Search, RefreshCw, Activity } from 'lucide-react';
import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useToast } from '@/components/Toast';

export default function TeamSettingsPage() {
  const { teamMembers, addTeamMember, removeTeamMember, updateTeamMemberRole } = useStore();
  
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'developer' | 'billing'>('developer');
  const toast = useToast();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'pending'>('all');

  const handleInvite = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail) return;
    try {
      addTeamMember(inviteEmail, inviteRole);
      setInviteEmail('');
      setInviteRole('developer');
      setIsInviteModalOpen(false);
    } catch (err: any) {
      toast.error('Invitation failed', err.message);
    }
  };

  const handleResend = (id: string) => {
    toast.success('Invitation resent', `Invitation has been resent to user ${id}.`);
  };

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
    <div className="space-y-8 animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h2 className="text-xl font-bold text-white mb-2">Team Members</h2>
          <p className="text-white/50 text-sm">Manage who has access to this workspace and their roles.</p>
        </div>
        <button 
          onClick={() => setIsInviteModalOpen(true)}
          className="bg-[#09090b] text-white font-bold px-5 py-2.5 rounded-xl shadow-[0_0_15px_rgba(255,255,255,0.1)] hover:shadow-[0_0_20px_rgba(255,255,255,0.2)] hover:bg-neutral-200 transition-all flex items-center gap-2 flex-shrink-0"
        >
          <Plus className="w-4 h-4" />
          Invite Member
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
          <input 
            type="text" 
            placeholder="Search by email..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#09090b] border border-white/10 rounded-xl py-2 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-teal/50 transition-all"
          />
        </div>
        <div className="flex bg-[#09090b] p-1 rounded-xl border border-white/10">
          {(['all', 'active', 'pending'] as const).map(status => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold capitalize transition-all ${
                statusFilter === status ? 'bg-[#09090b]/10 text-white' : 'text-white/40 hover:text-white/70'
              }`}
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      {/* Team Members List */}
      <div className="glass-inner rounded-2xl border border-white/10 shadow-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-[#09090b]/80 border-b border-white/10 text-white/50 font-bold uppercase tracking-wider text-[10px]">
              <tr>
                <th className="px-6 py-4">User</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Role</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-white/80">
              {filteredMembers.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-white/40">No team members found.</td>
                </tr>
              ) : filteredMembers.map((member) => (
                <tr key={member.id} className="hover:bg-[#09090b]/5 transition-colors group">
                  <td className="px-6 py-5">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-[#09090b]/10 flex items-center justify-center font-bold text-white/70">
                        {member.email.charAt(0).toUpperCase()}
                      </div>
                      <span className="font-semibold text-white">{member.email}</span>
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    {member.status === 'active' ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-widest bg-semantic-success/10 text-semantic-success border border-semantic-success/20">
                        <CheckCircle2 className="w-3 h-3" /> Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-widest bg-[#09090b]/5 text-white/50 border border-white/10">
                        <Clock className="w-3 h-3" /> Pending
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-5">
                    <select
                      value={member.role}
                      onChange={(e) => updateTeamMemberRole(member.id, e.target.value as any)}
                      className={`appearance-none bg-transparent outline-none cursor-pointer px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-widest border transition-colors ${roleColors[member.role]}`}
                    >
                      <option value="admin" className="bg-ink text-semantic-error">Admin</option>
                      <option value="developer" className="bg-ink text-teal">Developer</option>
                      <option value="billing" className="bg-ink text-semantic-warning">Billing</option>
                    </select>
                  </td>
                  <td className="px-6 py-5 text-right flex items-center justify-end gap-2">
                    {member.status === 'pending' && (
                      <button 
                        onClick={() => handleResend(member.id)}
                        className="p-2 hover:bg-[#09090b]/10 text-white/40 hover:text-white rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                        title="Resend Invite"
                      >
                        <RefreshCw className="w-4 h-4" />
                      </button>
                    )}
                    <button 
                      onClick={() => removeTeamMember(member.id)}
                      className="p-2 hover:bg-semantic-error/10 text-white/40 hover:text-semantic-error rounded-lg transition-colors opacity-0 group-hover:opacity-100"
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
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setIsInviteModalOpen(false)}
            />
            
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-[#09090b] border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-10"
            >
              <div className="p-6 border-b border-white/10">
                <h3 className="text-xl font-bold text-white mb-1">Invite Team Member</h3>
                <p className="text-sm text-white/50">Send an invitation link to collaborate.</p>
              </div>
              
              <form onSubmit={handleInvite} className="p-6 space-y-6">
                <div className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-black text-white/40 uppercase tracking-widest mb-2">Email Address</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                      <input 
                        type="email" 
                        required
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        placeholder="colleague@company.com" 
                        className="w-full bg-[#111116] border border-white/10 rounded-xl py-3 pl-10 pr-4 text-sm text-white placeholder-white/20 focus:outline-none focus:border-teal/50 focus:ring-1 focus:ring-teal/50 transition-all"
                      />
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-[10px] font-black text-white/40 uppercase tracking-widest mb-2">Role Assignment</label>
                    <div className="grid grid-cols-3 gap-3">
                      {(['admin', 'developer', 'billing'] as const).map((r) => (
                        <button
                          key={r}
                          type="button"
                          onClick={() => setInviteRole(r)}
                          className={`py-2 px-3 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all ${
                            inviteRole === r 
                              ? 'bg-teal/10 border-teal/50 text-teal' 
                              : 'bg-[#09090b]/5 border-white/10 text-white/50 hover:bg-[#09090b]/10 hover:text-white'
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
                    className="flex-1 py-3 px-4 rounded-xl font-bold text-white/70 hover:text-white hover:bg-[#09090b]/5 border border-transparent transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 py-3 px-4 rounded-xl font-bold bg-[#09090b] text-white hover:bg-[#09090b]/90 transition-colors shadow-[0_0_15px_rgba(255,255,255,0.1)]"
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
  );
}
