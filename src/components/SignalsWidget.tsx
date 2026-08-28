'use client';

import { useState } from 'react';
import { useStore } from '@/lib/store';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquarePlus, X, Send, Camera, CheckCircle2, Loader2 } from 'lucide-react';
import html2canvas from 'html2canvas';
import { supabase } from '@/lib/supabase';

export function SignalsWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const { user, addSignal } = useStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!comment.trim() || isSubmitting) return;

    setIsSubmitting(true);

    try {
      // Hide the widget itself before taking the screenshot
      const widgetElement = document.getElementById('signals-widget');
      if (widgetElement) {
        widgetElement.style.opacity = '0';
      }

      // Capture screenshot
      const canvas = await html2canvas(document.body, {
        useCORS: true,
        scale: 1,
        ignoreElements: (element) => element.id === 'signals-widget'
      });
      const screenshotUrl = canvas.toDataURL('image/jpeg', 0.6);

      if (widgetElement) {
        widgetElement.style.opacity = '1';
      }

      addSignal({
        comment: comment.trim(),
        screenshotUrl,
        url: window.location.href,
        user: user?.email || 'Anonymous',
      });

      // Push to Supabase database
      try {
        await supabase.from('signals').insert([
          {
            comment: comment.trim(),
            url: window.location.href,
            user_email: user?.email || 'Anonymous',
            screenshot: screenshotUrl
          }
        ]);
      } catch (dbError) {
        console.error('Supabase error:', dbError);
      }

      setIsSuccess(true);
      setTimeout(() => {
        setIsOpen(false);
        setIsSuccess(false);
        setComment('');
      }, 2000);
    } catch (error) {
      console.error('Failed to submit signal:', error);
      alert('Failed to capture screenshot. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div id="signals-widget" className="fixed bottom-6 right-6 z-[100] font-sans">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="absolute bottom-16 right-0 w-80 bg-ink border border-white/10 rounded-2xl shadow-2xl overflow-hidden mb-4"
          >
            <div className="bg-white/5 border-b border-white/10 p-4 flex items-center justify-between">
              <h3 className="text-white font-bold flex items-center gap-2 text-sm">
                <MessageSquarePlus className="w-4 h-4 text-teal" />
                Submit Feedback
              </h3>
              <button 
                onClick={() => !isSubmitting && setIsOpen(false)}
                className="text-white/50 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 bg-[#09090b]">
              {isSuccess ? (
                <div className="flex flex-col items-center justify-center py-8 text-center space-y-3">
                  <div className="w-12 h-12 rounded-full bg-teal/20 flex items-center justify-center">
                    <CheckCircle2 className="w-6 h-6 text-teal" />
                  </div>
                  <div>
                    <h4 className="text-white font-bold text-sm">Feedback Sent!</h4>
                    <p className="text-white/60 text-xs mt-1">Screenshot captured automatically.</p>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-3">
                  <textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="What's on your mind? (Screenshot will be captured automatically)"
                    className="w-full h-28 bg-white/5 border border-white/10 rounded-xl p-3 text-sm text-white placeholder-white/30 focus:outline-none focus:border-teal focus:ring-1 focus:ring-teal resize-none"
                    required
                  />
                  
                  <div className="flex items-center justify-between pt-2">
                    <div className="flex items-center gap-1.5 text-xs text-white/40">
                      <Camera className="w-3.5 h-3.5" />
                      Captures current screen
                    </div>
                    <button
                      type="submit"
                      disabled={!comment.trim() || isSubmitting}
                      className="bg-teal text-ink font-bold px-4 py-2 rounded-lg text-sm flex items-center gap-2 hover:bg-teal-ice transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isSubmitting ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4" />
                      )}
                      Submit
                    </button>
                  </div>
                </form>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-12 h-12 rounded-full bg-teal text-ink shadow-[0_0_20px_rgba(70,189,198,0.4)] flex items-center justify-center hover:scale-105 active:scale-95 transition-all"
      >
        {isOpen ? <X className="w-5 h-5" /> : <MessageSquarePlus className="w-5 h-5 fill-ink/20" />}
      </button>
    </div>
  );
}
