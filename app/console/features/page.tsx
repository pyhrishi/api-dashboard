'use client';

import { useState } from 'react';
import { useStore } from '@/lib/store';
import { Lightbulb, ThumbsUp, Send, Loader2, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

export default function FeaturesPage() {
  const { featureRequests, submitFeatureRequest, toggleFeatureUpvote } = useStore();
  
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'under_review' | 'planned' | 'in_progress' | 'shipped'>('all');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) return;

    setIsSubmitting(true);
    // Simulate network delay
    await new Promise(r => setTimeout(r, 800));
    
    submitFeatureRequest(title, description);
    
    setIsSubmitting(false);
    setTitle('');
    setDescription('');
    setShowSuccess(true);
    
    setTimeout(() => {
      setShowSuccess(false);
    }, 3000);
  };

  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'under_review':
        return { label: 'Under Review', color: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20' };
      case 'planned':
        return { label: 'Planned', color: 'text-blue-400 bg-blue-400/10 border-blue-400/20' };
      case 'in_progress':
        return { label: 'In Progress', color: 'text-purple-400 bg-purple-400/10 border-purple-400/20' };
      case 'shipped':
        return { label: 'Shipped', color: 'text-semantic-success bg-semantic-success/10 border-semantic-success/20' };
      default:
        return { label: 'Unknown', color: 'text-white/60 bg-white/5 border-white/10' };
    }
  };

  const filteredRequests = activeTab === 'all' 
    ? featureRequests 
    : featureRequests.filter(f => f.status === activeTab);

  // Sort by upvotes (descending)
  const sortedRequests = [...filteredRequests].sort((a, b) => b.upvotes - a.upvotes);

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 ease-out">
      
      {/* Header */}
      <div>
        <h1 className="text-3xl font-extrabold text-white tracking-tight mb-2 flex items-center gap-3">
          <Lightbulb className="w-8 h-8 text-teal" />
          Feature Requests
        </h1>
        <p className="text-white/60">Help shape the roadmap. Suggest new features, vote on existing ones, and track progress.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Col: Request List */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Tabs */}
          <div className="flex overflow-x-auto no-scrollbar gap-2 pb-2 border-b border-white/10">
            {[
              { id: 'all', label: 'All Requests' },
              { id: 'under_review', label: 'Under Review' },
              { id: 'planned', label: 'Planned' },
              { id: 'in_progress', label: 'In Progress' },
              { id: 'shipped', label: 'Shipped' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={cn(
                  "px-4 py-2 text-sm font-bold rounded-lg whitespace-nowrap transition-colors",
                  activeTab === tab.id 
                    ? "bg-white/10 text-white" 
                    : "text-white/40 hover:text-white hover:bg-white/5"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* List */}
          <div className="space-y-4">
            {sortedRequests.length === 0 ? (
              <div className="glass-inner rounded-2xl border border-white/10 p-12 text-center">
                <Lightbulb className="w-8 h-8 text-white/20 mx-auto mb-4" />
                <p className="text-white/40 font-medium">No features found in this category.</p>
              </div>
            ) : (
              sortedRequests.map(feat => {
                const status = getStatusConfig(feat.status);
                
                return (
                  <div key={feat.id} className="glass-inner rounded-2xl border border-white/10 p-5 flex gap-5 hover:bg-white/[0.02] transition-colors">
                    
                    {/* Upvote Button */}
                    <div className="flex flex-col items-center gap-1 flex-shrink-0">
                      <button 
                        onClick={() => toggleFeatureUpvote(feat.id)}
                        className={cn(
                          "w-12 h-12 flex flex-col items-center justify-center rounded-xl border transition-all",
                          feat.hasUpvoted 
                            ? "bg-teal/20 border-teal text-teal shadow-[0_0_15px_rgba(70,189,198,0.2)]" 
                            : "bg-white/5 border-white/10 text-white/40 hover:bg-white/10 hover:text-white"
                        )}
                      >
                        <ThumbsUp className={cn("w-4 h-4 mb-0.5", feat.hasUpvoted && "fill-teal")} />
                        <span className="text-xs font-black leading-none">{feat.upvotes}</span>
                      </button>
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                        <h3 className="text-base font-bold text-white truncate pr-4">{feat.title}</h3>
                        <span className={cn("inline-flex items-center justify-center px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest whitespace-nowrap self-start sm:self-auto border", status.color)}>
                          {status.label}
                        </span>
                      </div>
                      <p className="text-sm text-white/60 mb-3 line-clamp-2">
                        {feat.description}
                      </p>
                      <div className="text-[10px] font-mono text-white/30">
                        {new Date(feat.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Col: Suggest Form */}
        <div className="space-y-6">
          <div className="glass-inner rounded-2xl border border-white/10 overflow-hidden shadow-xl sticky top-8">
            <div className="px-6 py-4 border-b border-white/10 bg-white/5">
              <h2 className="font-bold text-white">Suggest a Feature</h2>
            </div>
            <div className="p-6">
              <AnimatePresence mode="wait">
                {showSuccess ? (
                  <motion.div 
                    key="success"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="flex flex-col items-center justify-center py-8 text-center space-y-4"
                  >
                    <div className="w-16 h-16 rounded-full bg-semantic-success/20 text-semantic-success flex items-center justify-center">
                      <CheckCircle2 className="w-8 h-8" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-white mb-2">Suggestion Submitted!</h3>
                      <p className="text-white/60 text-xs">It is now under review and available for others to upvote.</p>
                    </div>
                  </motion.div>
                ) : (
                  <motion.form 
                    key="form"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onSubmit={handleSubmit} 
                    className="space-y-5"
                  >
                    <div>
                      <label className="block text-xs font-bold text-white/60 uppercase tracking-wider mb-2">Title</label>
                      <input 
                        type="text"
                        required
                        value={title}
                        onChange={e => setTitle(e.target.value)}
                        placeholder="e.g. Webhook retries UI"
                        className="w-full bg-[#09090b] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 focus:outline-none focus:border-teal transition-colors"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-white/60 uppercase tracking-wider mb-2">Description</label>
                      <textarea 
                        required
                        value={description}
                        onChange={e => setDescription(e.target.value)}
                        placeholder="What is the use case and how would this help you?"
                        rows={4}
                        className="w-full bg-[#09090b] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 focus:outline-none focus:border-teal transition-colors resize-none"
                      />
                    </div>

                    <button 
                      type="submit" 
                      disabled={isSubmitting || !title.trim() || !description.trim()}
                      className="w-full bg-white text-ink px-6 py-3 rounded-xl font-bold hover:bg-neutral-200 transition-colors flex items-center justify-center gap-2 shadow-lg shadow-white/10 disabled:opacity-50"
                    >
                      {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-4 h-4" />}
                      {isSubmitting ? 'Submitting...' : 'Submit Suggestion'}
                    </button>
                  </motion.form>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
