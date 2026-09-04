'use client';

import { useStore } from '@/lib/store';
import { motion } from 'framer-motion';
import { Paintbrush, Save, CheckCircle2 } from 'lucide-react';
import { useState } from 'react';
import { useToast } from '@/components/Toast';

export default function BrandingSettingsPage() {
  const { organizations, activeOrganizationId, updateOrganizationBranding } = useStore();
  const activeOrg = organizations?.find(o => o.id === activeOrganizationId);
  const [color, setColor] = useState(activeOrg?.brandColor || '#46BDC6');
  const [isSaving, setIsSaving] = useState(false);
  const toast = useToast();

  const handleSave = () => {
    setIsSaving(true);
    setTimeout(() => {
      updateOrganizationBranding(color);
      toast.success('Branding Updated', 'The workspace theme color has been successfully saved.');
      setIsSaving(false);
    }, 600);
  };

  const PRESET_COLORS = [
    { name: 'Zinbit Teal', hex: '#46BDC6' },
    { name: 'Stripe Blurple', hex: '#635BFF' },
    { name: 'Vercel Black', hex: '#000000' },
    { name: 'Supabase Emerald', hex: '#3ECF8E' },
    { name: 'Linear Indigo', hex: '#5E6AD2' },
    { name: 'Sentry Crimson', hex: '#E1567C' },
    { name: 'Raycast Orange', hex: '#FF6363' },
    { name: 'Neon Pink', hex: '#FF00A0' }
  ];

  return (
    <div className="max-w-3xl space-y-8 animate-in fade-in duration-500">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <h2 className="text-2xl font-display font-bold text-fg flex items-center gap-2">
          <Paintbrush className="w-6 h-6 text-teal" />
          Workspace Branding
        </h2>
        <p className="text-fg-muted mt-1">Customize the visual identity of your workspace.</p>
      </motion.div>

      <div className="bg-glass border border-border rounded-2xl overflow-hidden backdrop-blur-md">
        <div className="p-6">
          <h3 className="text-lg font-bold text-fg mb-4">Primary Accent Color</h3>
          
          <div className="flex gap-6 mb-8">
            <div className="w-24 h-24 rounded-2xl shadow-xl border-4 border-border shrink-0" style={{ backgroundColor: color }} />
            <div className="flex-1 space-y-4">
              <div>
                <label className="block text-xs font-bold text-fg-muted uppercase tracking-widest mb-2">Custom HEX</label>
                <div className="flex gap-3">
                  <input
                    type="text"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    className="flex-1 bg-overlay border border-border rounded-xl px-4 py-2 text-fg font-mono focus:outline-none focus:border-teal/50 transition-colors"
                  />
                  <input 
                    type="color" 
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    className="w-12 h-10 rounded-lg cursor-pointer bg-transparent border-0 p-0"
                  />
                </div>
              </div>
            </div>
          </div>

          <h3 className="text-sm font-bold text-fg mb-3">Or choose a preset:</h3>
          <div className="flex flex-wrap gap-3">
            {PRESET_COLORS.map(preset => (
              <button
                key={preset.hex}
                onClick={() => setColor(preset.hex)}
                className="group flex flex-col items-center gap-2 p-2 rounded-xl hover:bg-glass transition-colors border border-transparent hover:border-border"
              >
                <div 
                  className={`w-12 h-12 rounded-full shadow-lg border-2 ${color === preset.hex ? 'border-white' : 'border-transparent group-hover:border-white/50'}`} 
                  style={{ backgroundColor: preset.hex }} 
                />
                <span className="text-[10px] font-bold text-fg-muted group-hover:text-fg">{preset.name}</span>
              </button>
            ))}
          </div>

        </div>
        <div className="p-4 border-t border-border bg-black/20 flex justify-end">
          <button 
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-2 px-6 py-2.5 bg-teal text-ink font-bold rounded-xl hover:bg-teal-ice transition-colors shadow-[0_0_20px_rgba(70,189,198,0.2)] disabled:opacity-50"
          >
            {isSaving ? <CheckCircle2 className="w-5 h-5 animate-pulse" /> : <Save className="w-5 h-5" />}
            {isSaving ? 'Saved!' : 'Save Branding'}
          </button>
        </div>
      </div>
    </div>
  );
}
