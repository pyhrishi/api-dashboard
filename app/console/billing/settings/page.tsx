'use client';

import { useState } from 'react';
import { useStore, POCContact } from '@/lib/store';
import { ArrowLeft, Building2, Save, Trash2, Plus, Mail, User, Briefcase, Shield, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { useToast } from '@/components/Toast';

export default function BillingSettingsPage() {
  const { billingDetails, updateBillingDetails, pocContacts, addPOCContact, removePOCContact, updatePOCContact } = useStore();
  const { success, info } = useToast();
  
  // Local state for company details form
  const [details, setDetails] = useState(billingDetails);
  const [isSavingDetails, setIsSavingDetails] = useState(false);

  // Local state for new POC form
  const [isAddingPOC, setIsAddingPOC] = useState(false);
  const [newPOC, setNewPOC] = useState({ name: '', email: '', role: 'Billing' as POCContact['role'] });

  const handleSaveDetails = async () => {
    setIsSavingDetails(true);
    await new Promise(r => setTimeout(r, 600));
    updateBillingDetails(details);
    setIsSavingDetails(false);
    success('Company details updated successfully');
  };

  const handleAddPOC = () => {
    if (!newPOC.name || !newPOC.email) return;
    addPOCContact(newPOC);
    setNewPOC({ name: '', email: '', role: 'Billing' });
    setIsAddingPOC(false);
    success(`${newPOC.name} added as ${newPOC.role} POC`);
  };

  const handleRemovePOC = (id: string, name: string) => {
    removePOCContact(id);
    info(`${name} has been removed.`);
  };

  const roleIcons = {
    'Billing': <Briefcase className="w-4 h-4 text-teal" />,
    'Technical': <Building2 className="w-4 h-4 text-blue-400" />,
    'Security': <Shield className="w-4 h-4 text-purple-400" />,
    'Testing': <CheckCircle2 className="w-4 h-4 text-[#C47B0A]" />
  };

  const roleColors = {
    'Billing': 'bg-teal/10 text-teal border-teal/20',
    'Technical': 'bg-blue-400/10 text-blue-400 border-blue-400/20',
    'Security': 'bg-purple-400/10 text-purple-400 border-purple-400/20',
    'Testing': 'bg-[#C47B0A]/10 text-[#C47B0A] border-[#C47B0A]/20'
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12 animate-in fade-in duration-500">
      
      {/* Header */}
      <div>
        <Link href="/console/billing" className="inline-flex items-center gap-2 text-sm font-bold text-white/40 hover:text-white transition-colors mb-4">
          <ArrowLeft className="w-4 h-4" /> Back to Billing
        </Link>
        <h1 className="text-3xl font-display font-extrabold text-white mb-2 tracking-tight">Billing Settings & Contacts</h1>
        <p className="text-white/60 font-medium">Manage your company legal information and assign roles for notifications.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Company Details Section */}
        <div className="glass-panel p-6 sm:p-8 rounded-2xl border border-white/10 space-y-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Building2 className="w-5 h-5 text-teal" />
              Company Details
            </h2>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-white/40 uppercase tracking-wider mb-1.5">Legal Company Name</label>
              <input 
                type="text" 
                value={details.companyName}
                onChange={e => setDetails({...details, companyName: e.target.value})}
                className="w-full bg-[#111115] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-teal/50 transition-colors"
                placeholder="e.g. Acme Corporation"
              />
            </div>
            
            <div>
              <label className="block text-xs font-bold text-white/40 uppercase tracking-wider mb-1.5">Tax ID / VAT Number</label>
              <input 
                type="text" 
                value={details.taxId}
                onChange={e => setDetails({...details, taxId: e.target.value})}
                className="w-full bg-[#111115] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-teal/50 transition-colors font-mono"
                placeholder="e.g. US123456789"
              />
            </div>
            
            <div>
              <label className="block text-xs font-bold text-white/40 uppercase tracking-wider mb-1.5">Billing Address</label>
              <textarea 
                value={details.address}
                onChange={e => setDetails({...details, address: e.target.value})}
                className="w-full bg-[#111115] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-teal/50 transition-colors h-24 resize-none"
                placeholder="123 Developer Way..."
              />
            </div>
          </div>

          <div className="pt-4 border-t border-white/5 flex justify-end">
            <button 
              onClick={handleSaveDetails}
              disabled={isSavingDetails}
              className="px-6 py-2.5 bg-white text-ink font-bold rounded-xl hover:bg-neutral-200 transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              {isSavingDetails ? 'Saving...' : <><Save className="w-4 h-4" /> Save Details</>}
            </button>
          </div>
        </div>

        {/* POC Manager Section */}
        <div className="glass-panel p-6 sm:p-8 rounded-2xl border border-white/10 flex flex-col h-full">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2 mb-1">
                <User className="w-5 h-5 text-teal" />
                Points of Contact
              </h2>
              <p className="text-xs text-white/40 font-medium">Route alerts to the right teams.</p>
            </div>
            {!isAddingPOC && (
              <button 
                onClick={() => setIsAddingPOC(true)}
                className="p-2 bg-teal/10 text-teal hover:bg-teal/20 rounded-lg transition-colors border border-teal/20"
                title="Add POC"
              >
                <Plus className="w-5 h-5" />
              </button>
            )}
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto">
            {isAddingPOC && (
              <div className="p-4 bg-[#111115] border border-teal/30 rounded-xl space-y-3 mb-4 shadow-[0_0_15px_rgba(70,189,198,0.1)]">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-bold text-teal uppercase tracking-wider">New Contact</span>
                  <button onClick={() => setIsAddingPOC(false)} className="text-white/40 hover:text-white text-xs">Cancel</button>
                </div>
                
                <input 
                  type="text" 
                  placeholder="Full Name" 
                  value={newPOC.name}
                  onChange={e => setNewPOC({...newPOC, name: e.target.value})}
                  className="w-full bg-[#09090b] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-teal/50"
                />
                <input 
                  type="email" 
                  placeholder="Email Address" 
                  value={newPOC.email}
                  onChange={e => setNewPOC({...newPOC, email: e.target.value})}
                  className="w-full bg-[#09090b] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-teal/50"
                />
                
                <select 
                  value={newPOC.role}
                  onChange={e => setNewPOC({...newPOC, role: e.target.value as any})}
                  className="w-full bg-[#09090b] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-teal/50"
                >
                  <option value="Billing">Billing POC (Invoices, Receipts)</option>
                  <option value="Technical">Technical POC (Deprecations, Outages)</option>
                  <option value="Security">Security POC (Key Rotations, Auth)</option>
                  <option value="Testing">Testing POC (Webhooks, Sandbox)</option>
                </select>

                <button 
                  onClick={handleAddPOC}
                  disabled={!newPOC.name || !newPOC.email}
                  className="w-full py-2 bg-teal text-ink font-bold rounded-lg hover:bg-teal-ice transition-colors disabled:opacity-50 text-sm mt-2"
                >
                  Save Contact
                </button>
              </div>
            )}

            {pocContacts.map((contact) => (
              <div key={contact.id} className="p-4 bg-[#111115] border border-white/5 rounded-xl group hover:border-white/10 transition-colors flex flex-col gap-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center font-bold text-white border border-white/10">
                      {contact.name.charAt(0)}
                    </div>
                    <div>
                      <h4 className="text-white font-bold text-sm leading-none mb-1">{contact.name}</h4>
                      <div className="flex items-center gap-1.5 text-white/40 text-xs">
                        <Mail className="w-3 h-3" /> {contact.email}
                      </div>
                    </div>
                  </div>
                  
                  <button 
                    onClick={() => handleRemovePOC(contact.id, contact.name)}
                    className="p-1.5 text-white/20 hover:text-semantic-error hover:bg-semantic-error/10 rounded-md transition-all opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                
                <div className={`self-start inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider border ${roleColors[contact.role]}`}>
                  {roleIcons[contact.role]} {contact.role}
                </div>
              </div>
            ))}
            
            {pocContacts.length === 0 && !isAddingPOC && (
              <div className="text-center py-8 text-white/40 border border-dashed border-white/10 rounded-xl">
                <User className="w-8 h-8 mx-auto mb-2 opacity-20" />
                <p className="text-sm font-medium">No contacts configured.</p>
              </div>
            )}
          </div>
        </div>
      </div>
      
    </div>
  );
}
