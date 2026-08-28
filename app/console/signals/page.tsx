'use client';

import { useState, useEffect } from 'react';
import { useStore } from '@/lib/store';
import { MessageSquare, ExternalLink, Clock, User, X, ImageIcon, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/lib/supabase';

export default function SignalsDashboardPage() {
  const { signals: localSignals } = useStore();
  const [signals, setSignals] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  useEffect(() => {
    async function fetchSignals() {
      try {
        const { data, error } = await supabase
          .from('signals')
          .select('*')
          .order('created_at', { ascending: false });
        
        if (error) {
          console.error(error);
          setSignals(localSignals);
          return;
        }

        const mappedSignals = (data || []).map(row => ({
          id: row.id,
          timestamp: row.created_at,
          comment: row.comment,
          url: row.url,
          user: row.user_email,
          screenshotUrl: row.screenshot
        }));

        setSignals(mappedSignals.length > 0 ? mappedSignals : localSignals);
      } catch (err) {
        console.error('Error fetching signals:', err);
        setSignals(localSignals);
      } finally {
        setIsLoading(false);
      }
    }
    fetchSignals();
  }, [localSignals]);

  const formatDate = (isoString: string) => {
    return new Date(isoString).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-extrabold text-white tracking-tight flex items-center gap-3">
            <MessageSquare className="w-8 h-8 text-teal" />
            Signals Dashboard
          </h1>
          <p className="text-white/60 mt-2 max-w-2xl">
            Review detailed feedback and bug reports from your team and beta testers. Each signal includes an automatic screenshot of the user's viewport.
          </p>
        </div>
        <div className="bg-white/5 border border-white/10 px-4 py-2 rounded-xl flex items-center gap-3">
          <div className="text-2xl font-bold text-white">{signals.length}</div>
          <div className="text-xs text-white/50 uppercase tracking-widest font-bold">Total<br/>Signals</div>
        </div>
      </div>

      {/* Signals Grid */}
      {isLoading ? (
        <div className="glass-inner rounded-3xl border border-white/10 p-12 text-center flex flex-col items-center justify-center min-h-[400px]">
          <Loader2 className="w-12 h-12 text-teal animate-spin mb-4" />
          <h3 className="text-xl font-bold text-white mb-2">Syncing Signals...</h3>
          <p className="text-white/60 max-w-md">Fetching latest feedback from the database.</p>
        </div>
      ) : signals.length === 0 ? (
        <div className="glass-inner rounded-3xl border border-white/10 p-12 text-center flex flex-col items-center justify-center min-h-[400px]">
          <MessageSquare className="w-12 h-12 text-white/20 mb-4" />
          <h3 className="text-xl font-bold text-white mb-2">No signals yet</h3>
          <p className="text-white/60 max-w-md">
            When users submit feedback using the Signals widget in the bottom right corner, it will appear here.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {signals.map((signal) => (
            <div key={signal.id} className="glass-inner rounded-2xl border border-white/10 overflow-hidden flex flex-col group">
              {/* Image Thumbnail */}
              <div 
                className="relative h-48 bg-black/50 border-b border-white/10 overflow-hidden cursor-pointer"
                onClick={() => setSelectedImage(signal.screenshotUrl)}
              >
                {signal.screenshotUrl ? (
                  <>
                    <img 
                      src={signal.screenshotUrl} 
                      alt="Screenshot" 
                      className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity duration-300"
                    />
                    <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                      <div className="bg-white/10 backdrop-blur-md px-4 py-2 rounded-full text-white text-sm font-bold flex items-center gap-2">
                        <ImageIcon className="w-4 h-4" /> View Full Image
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-white/20">
                    <ImageIcon className="w-8 h-8" />
                  </div>
                )}
              </div>
              
              {/* Content */}
              <div className="p-6 flex-1 flex flex-col">
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div className="flex items-center gap-2 text-xs font-bold text-teal bg-teal/10 px-2 py-1 rounded">
                    <User className="w-3.5 h-3.5" />
                    <span className="truncate max-w-[120px]">{signal.user}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-white/40 font-mono">
                    <Clock className="w-3.5 h-3.5" />
                    {formatDate(signal.timestamp)}
                  </div>
                </div>

                <p className="text-white text-sm leading-relaxed mb-6 flex-1">
                  "{signal.comment}"
                </p>

                <div className="pt-4 border-t border-white/10 flex items-center justify-between">
                  <a 
                    href={signal.url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-xs font-mono text-white/50 hover:text-teal transition-colors truncate max-w-[80%]"
                    title={signal.url}
                  >
                    <ExternalLink className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="truncate">{new URL(signal.url).pathname}</span>
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Full Size Image Modal */}
      <AnimatePresence>
        {selectedImage && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 md:p-12">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/90 backdrop-blur-xl"
              onClick={() => setSelectedImage(null)}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-6xl max-h-[90vh] flex flex-col bg-ink border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
            >
              <div className="p-4 border-b border-white/10 flex items-center justify-between bg-[#09090b]">
                <h3 className="text-white font-bold flex items-center gap-2">
                  <ImageIcon className="w-5 h-5 text-teal" />
                  Screenshot Viewer
                </h3>
                <button 
                  onClick={() => setSelectedImage(null)}
                  className="p-2 bg-white/5 hover:bg-white/10 text-white/60 hover:text-white rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1 overflow-auto p-4 bg-[#111115]">
                <img 
                  src={selectedImage} 
                  alt="Full screenshot" 
                  className="w-full h-auto rounded-lg border border-white/10 shadow-2xl"
                />
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
