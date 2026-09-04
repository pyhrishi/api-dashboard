'use client';
import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, CheckCircle2, Clock, X, Plus, ChevronUp, MoreHorizontal, Sparkles, FileTerminal, LayoutDashboard, Globe, BarChart2, Kanban, Bell, BellRing, CreditCard, Lock, ShieldAlert, AlertCircle, Rocket } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStore, FeatureRequest } from '@/lib/store';
import { findDuplicate } from '@/lib/insight-engine';

const STATUS_COLUMNS = [
  { id: 'under_review', label: 'Under Review', icon: Clock, color: 'text-orange-400', bg: 'bg-orange-500/10' },
  { id: 'planned', label: 'Planned', icon: MoreHorizontal, color: 'text-blue-400', bg: 'bg-blue-500/10' },
  { id: 'in_progress', label: 'In Progress', icon: Sparkles, color: 'text-purple-400', bg: 'bg-purple-500/10' },
  { id: 'completed', label: 'Completed', icon: CheckCircle2, color: 'text-semantic-success', bg: 'bg-semantic-success/10' }
];

const CATEGORY_ICONS = {
  'API': FileTerminal,
  'Dashboard': LayoutDashboard,
  'SDK': FileTerminal,
  'Webhooks': Globe
};

export default function FeaturesPage() {
  const { featureRequests, createFeatureRequest, toggleFeatureVote, addFeatureComment, fundFeatureRequest, toggleFeatureSubscription, updateFeatureStatus, user } = useStore();
  
  const [activeFeature, setActiveFeature] = useState<FeatureRequest | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [viewMode, setViewMode] = useState<'kanban' | 'matrix'>('kanban');
  
  // New Request Form
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState<'API' | 'Dashboard' | 'SDK' | 'Webhooks'>('API');
  const [newDescription, setNewDescription] = useState('');
  const [aiWarning, setAiWarning] = useState<string | null>(null);
  
  // Comment & Modals
  const [newComment, setNewComment] = useState('');
  const [commentTab, setCommentTab] = useState<'public' | 'internal'>('public');
  const [isPledging, setIsPledging] = useState(false);
  
  // Admin Status Form
  const [statusDraft, setStatusDraft] = useState('');
  const [releaseNoteDraft, setReleaseNoteDraft] = useState('');
  
  // Floating Vote Animation State
  const [floatingVotes, setFloatingVotes] = useState<{id: number, featureId: string, x: number, y: number}[]>([]);

  // AI Deduplication Interceptor — real token-similarity against existing requests
  useEffect(() => {
    if (newTitle.length > 3) {
      const match = findDuplicate(newTitle, featureRequests.filter(fr => fr.status !== 'declined'));
      setAiWarning(match ? match.title : null);
    } else {
      setAiWarning(null);
    }
  }, [newTitle, featureRequests]);

  const handleVote = (e: React.MouseEvent, featureId: string) => {
    e.stopPropagation();
    toggleFeatureVote(featureId);
    
    // Animate +1
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    const id = Date.now();
    setFloatingVotes(prev => [...prev, { id, featureId, x: rect.left + rect.width / 2, y: rect.top }]);
    setTimeout(() => {
      setFloatingVotes(prev => prev.filter(v => v.id !== id));
    }, 1000);
  };

  const handleSubmitRequest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle || !newDescription) return;
    createFeatureRequest(newTitle, newDescription, newCategory);
    setIsCreating(false);
    setNewTitle('');
    setNewDescription('');
    setAiWarning(null);
  };

  const handleSubmitComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeFeature || !newComment) return;
    addFeatureComment(activeFeature.id, newComment, commentTab === 'internal');
    setNewComment('');
  };

  const handleFund = (amount: number) => {
    if (!activeFeature) return;
    fundFeatureRequest(activeFeature.id, amount);
    setIsPledging(false);
  };

  const handleUpdateStatus = () => {
    if (!activeFeature) return;
    updateFeatureStatus(activeFeature.id, statusDraft as FeatureRequest['status'], releaseNoteDraft || undefined);
    setStatusDraft('');
    setReleaseNoteDraft('');
  };

  // Re-sync active feature
  const syncedActiveFeature = useMemo(() => {
    if (!activeFeature) return null;
    return featureRequests.find(fr => fr.id === activeFeature.id) || null;
  }, [activeFeature, featureRequests]);

  const renderKanban = () => (
    <div className="flex-1 overflow-x-auto overflow-y-hidden pb-8 px-4 md:px-0">
      <div className="flex gap-6 h-full min-w-[1200px]">
        {STATUS_COLUMNS.map(column => {
          const columnRequests = featureRequests.filter(fr => fr.status === column.id);
          const Icon = column.icon;
          return (
            <div key={column.id} className="flex-1 flex flex-col h-full bg-surface/40 rounded-2xl border border-border-subtle overflow-hidden">
              <div className={cn("p-4 border-b border-border-subtle flex items-center justify-between shrink-0 bg-gradient-to-r", column.bg, "to-transparent opacity-90")}>
                <div className="flex items-center gap-2">
                  <Icon className={cn("w-4 h-4", column.color)} />
                  <h3 className={cn("font-bold text-sm", column.color)}>{column.label}</h3>
                </div>
                <div className="text-xs font-bold text-fg-muted bg-surface/50 px-2 py-0.5 rounded-full">
                  {columnRequests.length}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
                {columnRequests.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-fg-subtle italic text-xs">
                    No requests here
                  </div>
                ) : (
                  columnRequests.map(fr => {
                    const CatIcon = CATEGORY_ICONS[fr.category] || FileTerminal;
                    const fundPercent = fr.fundingGoal ? Math.min(100, Math.round(((fr.currentFunding || 0) / fr.fundingGoal) * 100)) : 0;
                    
                    return (
                      <div 
                        key={fr.id}
                        onClick={() => setActiveFeature(fr)}
                        className="bg-[#121212] border border-border rounded-xl p-4 hover:border-white/30 transition-all cursor-pointer group shadow-lg hover:shadow-xl hover:-translate-y-0.5 flex flex-col gap-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <h4 className="text-sm font-bold text-fg leading-tight group-hover:text-purple-400 transition-colors">
                            {fr.title}
                          </h4>
                          {fr.isSubscribed && <BellRing className="w-3 h-3 text-teal shrink-0" />}
                        </div>
                        
                        <p className="text-xs text-fg-muted line-clamp-2">
                          {fr.description}
                        </p>
                        
                        {fr.fundingGoal && fr.status !== 'completed' && fr.status !== 'declined' && (
                          <div className="w-full bg-glass rounded-full h-1.5 mt-1 overflow-hidden">
                            <div className="bg-gradient-to-r from-emerald-500 to-teal-400 h-full rounded-full" style={{ width: `${fundPercent}%` }} />
                          </div>
                        )}

                        <div className="flex items-center justify-between pt-2 border-t border-border-subtle">
                          <div className="flex items-center gap-2">
                            <span className="bg-glass border border-border text-fg-muted text-[9px] uppercase tracking-widest font-bold px-1.5 py-0.5 rounded flex items-center gap-1">
                              <CatIcon className="w-3 h-3" /> {fr.category}
                            </span>
                          </div>
                          
                          <div className="flex items-center gap-3">
                            {fr.comments.length > 0 && (
                              <div className="flex items-center gap-1 text-fg-muted text-xs font-bold">
                                <MessageSquare className="w-3 h-3" /> {fr.comments.length}
                              </div>
                            )}
                            <button 
                              onClick={(e) => handleVote(e, fr.id)}
                              className={cn(
                                "flex items-center gap-1.5 px-2 py-1 rounded text-xs font-bold transition-all border",
                                fr.hasVoted 
                                  ? "bg-teal/10 text-teal border-teal/30 hover:bg-teal/20" 
                                  : "bg-glass text-fg-muted border-border-subtle hover:bg-glass-2 hover:text-fg"
                              )}
                            >
                              <ChevronUp className={cn("w-3.5 h-3.5", fr.hasVoted && "text-teal")} strokeWidth={3} />
                              {fr.votes}
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  const renderMatrix = () => (
    <div className="flex-1 px-4 md:px-0 pb-8 flex flex-col">
      <div className="flex-1 bg-surface/80 border border-border rounded-2xl p-8 relative overflow-hidden flex flex-col">
        <div className="absolute top-0 right-0 p-4 opacity-10 font-black text-6xl rotate-90 transform origin-top-right text-fg">IMPACT</div>
        <div className="absolute bottom-0 left-0 p-4 opacity-10 font-black text-6xl text-fg">EFFORT</div>
        
        {/* Matrix Grid Axes */}
        <div className="flex-1 relative border-l-2 border-b-2 border-border-strong mt-4 ml-4">
          <div className="absolute -left-6 bottom-1/2 -rotate-90 text-xs font-bold text-fg-muted uppercase tracking-widest">Low Impact ➔ High Impact</div>
          <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-xs font-bold text-fg-muted uppercase tracking-widest">Low Effort ➔ High Effort</div>
          
          {/* Grid Lines */}
          <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 opacity-5 pointer-events-none">
            <div className="border-r border-b border-white"></div>
            <div className="border-b border-white bg-green-500/20"></div> {/* High Impact / Low Effort (Quick Wins) */}
            <div className="border-r border-white"></div>
            <div className=""></div>
          </div>
          
          {/* Quadrant Labels */}
          <div className="absolute top-4 right-4 text-fg-subtle font-black uppercase text-xl">Major Projects</div>
          <div className="absolute top-4 left-4 text-green-500/20 font-black uppercase text-xl">Quick Wins</div>
          <div className="absolute bottom-4 right-4 text-fg-subtle font-black uppercase text-xl">Thankless Tasks</div>
          <div className="absolute bottom-4 left-4 text-fg-subtle font-black uppercase text-xl">Fill-ins</div>

          {/* Scatter Plot Points */}
          {featureRequests.filter(fr => fr.status !== 'completed' && fr.status !== 'declined' && fr.effortScore && fr.impactScore).map(fr => {
            const x = (fr.effortScore! / 10) * 100;
            const y = (fr.impactScore! / 10) * 100;
            return (
              <div
                key={fr.id}
                onClick={() => setActiveFeature(fr)}
                className="absolute w-4 h-4 rounded-full bg-purple-500 shadow-[0_0_10px_rgba(168,85,247,0.8)] cursor-pointer hover:scale-150 transition-all -ml-2 mb-2 group z-10"
                style={{ left: `${x}%`, bottom: `${y}%` }}
              >
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 opacity-0 group-hover:opacity-100 transition-opacity bg-black border border-border-strong text-fg text-xs px-2 py-1 rounded whitespace-nowrap z-20 pointer-events-none">
                  <span className="font-bold">{fr.title}</span>
                  <div className="text-fg-muted text-[10px]">E:{fr.effortScore} I:{fr.impactScore}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  return (
    <div className="max-w-[1600px] mx-auto h-[calc(100vh-80px)] flex flex-col animate-in fade-in duration-500">
      
      {/* Floating Animations Layer */}
      <AnimatePresence>
        {floatingVotes.map(fv => (
          <motion.div
            key={fv.id}
            initial={{ opacity: 1, y: 0, scale: 0.8 }}
            animate={{ opacity: 0, y: -50, scale: 1.5 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="fixed text-teal font-black pointer-events-none z-50 drop-shadow-[0_0_8px_rgba(45,212,191,0.8)]"
            style={{ left: fv.x - 10, top: fv.y }}
          >
            +1
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-8 shrink-0 px-4 md:px-0 mt-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-purple-400" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-fg">Feature Requests</h1>
          </div>
          <p className="text-fg-muted">Shape the roadmap. Upvote ideas, pledge API credits, or submit your own feature requests.</p>
        </div>
        
        <div className="flex items-center gap-4 bg-surface p-1 rounded-xl border border-border">
          <div className="flex bg-[#121212] rounded-lg p-0.5">
            <button 
              onClick={() => setViewMode('kanban')}
              className={cn("px-3 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-2", viewMode === 'kanban' ? "bg-white/10 text-fg shadow-sm" : "text-fg-muted hover:text-fg")}
            >
              <Kanban className="w-4 h-4" /> Kanban
            </button>
            <button 
              onClick={() => setViewMode('matrix')}
              className={cn("px-3 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-2", viewMode === 'matrix' ? "bg-white/10 text-fg shadow-sm" : "text-fg-muted hover:text-fg")}
            >
              <BarChart2 className="w-4 h-4" /> Matrix
            </button>
          </div>
          <button
            onClick={() => setIsCreating(true)}
            className="h-9 px-4 bg-purple-500 text-fg font-bold rounded-lg hover:bg-purple-600 transition-all flex items-center gap-2 shadow-[0_0_15px_rgba(168,85,247,0.3)]"
          >
            <Plus className="w-4 h-4" /> Request Feature
          </button>
        </div>
      </div>

      {viewMode === 'kanban' ? renderKanban() : renderMatrix()}

      {/* Deep Feature Request Modal */}
      <AnimatePresence>
        {syncedActiveFeature && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
             <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} onClick={() => setActiveFeature(null)} className="absolute inset-0 bg-surface/80 backdrop-blur-sm" />
             <motion.div initial={{opacity:0, scale:0.95, y:20}} animate={{opacity:1, scale:1, y:0}} exit={{opacity:0, scale:0.95, y:20}} className="relative w-full max-w-4xl bg-surface border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
               
               {/* Release Notes Banner */}
               {syncedActiveFeature.status === 'completed' && syncedActiveFeature.releaseNote && (
                 <div className="bg-gradient-to-r from-emerald-500/20 to-teal-400/20 border-b border-emerald-500/30 p-4 shrink-0 flex items-start gap-4">
                   <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
                     <Rocket className="w-5 h-5 text-emerald-400" />
                   </div>
                   <div>
                     <h3 className="font-bold text-emerald-400 flex items-center gap-2 mb-1">Feature Shipped & Live!</h3>
                     <p className="text-sm text-emerald-100/80 leading-relaxed">{syncedActiveFeature.releaseNote}</p>
                   </div>
                 </div>
               )}

               {/* Modal Header */}
               <div className="p-6 border-b border-border flex justify-between items-start bg-glass shrink-0">
                 <div className="pr-8 flex-1">
                   <div className="flex items-center gap-2 mb-3">
                     <span className="bg-purple-500/10 text-purple-400 border border-purple-500/20 text-[10px] uppercase font-black tracking-widest px-2 py-0.5 rounded">
                       {STATUS_COLUMNS.find(c => c.id === syncedActiveFeature.status)?.label || syncedActiveFeature.status}
                     </span>
                     <span className="bg-white/10 text-fg-muted border border-border text-[10px] uppercase font-black tracking-widest px-2 py-0.5 rounded flex items-center gap-1">
                       <FileTerminal className="w-3 h-3" /> {syncedActiveFeature.category}
                     </span>
                   </div>
                   <h2 className="text-2xl font-bold text-fg mb-2 leading-tight">
                     {syncedActiveFeature.title}
                   </h2>
                   <div className="text-xs text-fg-muted flex items-center gap-4">
                     <span>Requested by <span className="text-fg font-bold">{syncedActiveFeature.author}</span></span>
                     <span>{new Date(syncedActiveFeature.createdAt).toLocaleDateString()}</span>
                   </div>
                 </div>
                 
                 <div className="flex flex-col items-end gap-3 shrink-0">
                   <div className="flex gap-2">
                     <button 
                       onClick={() => toggleFeatureSubscription(syncedActiveFeature.id)} 
                       className={cn("p-2 rounded-xl border transition-all", syncedActiveFeature.isSubscribed ? "bg-teal/10 text-teal border-teal/50" : "bg-[#121212] text-fg-muted border-border hover:border-white/30 hover:text-fg")}
                       title={syncedActiveFeature.isSubscribed ? "Unsubscribe" : "Subscribe to Updates"}
                     >
                       {syncedActiveFeature.isSubscribed ? <BellRing className="w-5 h-5" /> : <Bell className="w-5 h-5" />}
                     </button>
                     <button 
                       onClick={(e) => handleVote(e, syncedActiveFeature.id)}
                       className={cn(
                         "flex items-center gap-2 px-4 py-2 rounded-xl border-2 transition-all shadow-lg",
                         syncedActiveFeature.hasVoted 
                           ? "bg-teal/10 text-teal border-teal/50 shadow-[0_0_15px_rgba(45,212,191,0.2)]" 
                           : "bg-[#121212] text-fg-muted border-border hover:border-white/30 hover:text-fg"
                       )}
                     >
                       <ChevronUp className="w-5 h-5" strokeWidth={3} />
                       <span className="font-black text-lg leading-none">{syncedActiveFeature.votes}</span>
                     </button>
                     <button onClick={() => setActiveFeature(null)} className="text-fg-muted hover:text-fg bg-overlay p-2 rounded-xl border border-border flex items-center justify-center">
                       <X className="w-5 h-5" />
                     </button>
                   </div>
                 </div>
               </div>
               
               <div className="flex-1 flex overflow-hidden">
                 {/* Left Column: Description & Funding */}
                 <div className="w-7/12 border-r border-border overflow-y-auto custom-scrollbar bg-surface">
                   
                   {/* Funding Banner */}
                   {syncedActiveFeature.fundingGoal && syncedActiveFeature.status !== 'completed' && syncedActiveFeature.status !== 'declined' && (
                     <div className="m-6 p-5 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 relative overflow-hidden">
                       <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
                         <CreditCard className="w-24 h-24 text-emerald-400" />
                       </div>
                       <h3 className="text-sm font-bold text-emerald-400 flex items-center gap-2 mb-2">
                         <Sparkles className="w-4 h-4" /> Fund this Feature
                       </h3>
                       <p className="text-xs text-emerald-100/60 mb-4 pr-12">
                         Need this feature urgently? Pledge API credits to prioritize it on our roadmap.
                       </p>
                       <div className="mb-2 flex justify-between text-xs font-mono font-bold text-emerald-100/80">
                         <span>${syncedActiveFeature.currentFunding?.toLocaleString()} Pledged</span>
                         <span>Goal: ${syncedActiveFeature.fundingGoal.toLocaleString()}</span>
                       </div>
                       <div className="w-full bg-overlay rounded-full h-2 mb-4 overflow-hidden border border-emerald-500/20">
                         <div 
                           className="bg-gradient-to-r from-emerald-500 to-teal-400 h-full rounded-full transition-all duration-1000 ease-out" 
                           style={{ width: `${Math.min(100, Math.round(((syncedActiveFeature.currentFunding || 0) / syncedActiveFeature.fundingGoal) * 100))}%` }} 
                         />
                       </div>
                       {!isPledging ? (
                         <button onClick={() => setIsPledging(true)} className="w-full bg-emerald-500 text-[#09090b] font-bold text-sm py-2 rounded-xl hover:bg-emerald-400 transition-colors">
                           Pledge Credits
                         </button>
                       ) : (
                         <div className="flex gap-2">
                           {[100, 500, 1000].map(amt => (
                             <button key={amt} onClick={() => handleFund(amt)} className="flex-1 bg-emerald-500/20 text-emerald-400 border border-emerald-500/50 font-bold text-sm py-2 rounded-xl hover:bg-emerald-500/40 transition-colors">
                               +${amt}
                             </button>
                           ))}
                           <button onClick={() => setIsPledging(false)} className="px-3 bg-overlay text-fg-muted hover:text-fg rounded-xl">
                             <X className="w-4 h-4" />
                           </button>
                         </div>
                       )}
                     </div>
                   )}

                   <div className="p-6">
                     <h3 className="text-xs font-black uppercase text-fg-muted tracking-widest mb-3">Description</h3>
                     <div className="text-sm text-fg leading-relaxed whitespace-pre-wrap">
                       {syncedActiveFeature.description}
                     </div>
                   </div>

                   {user?.role === 'admin' && (
                     <div className="m-6 p-5 rounded-2xl border border-rose-500/30 bg-rose-500/5">
                        <h3 className="text-xs font-black uppercase text-rose-400 tracking-widest mb-3 flex items-center gap-2"><ShieldAlert className="w-4 h-4"/> Admin Controls</h3>
                        <div className="space-y-3">
                          <select value={statusDraft || syncedActiveFeature.status} onChange={e => setStatusDraft(e.target.value)} className="w-full bg-overlay border border-rose-500/30 rounded-lg p-2 text-xs text-fg">
                            <option value="under_review">Under Review</option>
                            <option value="planned">Planned</option>
                            <option value="in_progress">In Progress</option>
                            <option value="completed">Completed</option>
                          </select>
                          {(statusDraft === 'completed' || (syncedActiveFeature.status === 'completed' && !statusDraft)) && (
                            <textarea 
                              placeholder="Release Notes (Optional, triggered to subscribers)..." 
                              value={releaseNoteDraft}
                              onChange={e => setReleaseNoteDraft(e.target.value)}
                              className="w-full bg-overlay border border-rose-500/30 rounded-lg p-2 text-xs text-fg resize-none"
                              rows={3}
                            />
                          )}
                          <button onClick={handleUpdateStatus} disabled={!statusDraft && !releaseNoteDraft} className="w-full bg-rose-500/20 text-rose-400 text-xs font-bold py-2 rounded-lg disabled:opacity-50">Update Status & Notify</button>
                        </div>
                     </div>
                   )}

                 </div>

                 {/* Right Column: Discussions */}
                 <div className="w-5/12 flex flex-col bg-gradient-to-b from-[#121212] to-[#09090b]">
                   {/* Tabs */}
                   <div className="flex border-b border-border shrink-0">
                     <button 
                       onClick={() => setCommentTab('public')}
                       className={cn("flex-1 py-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-colors", commentTab === 'public' ? "border-purple-500 text-purple-400" : "border-transparent text-fg-muted hover:text-fg")}
                     >
                       Public Discussion
                     </button>
                     {user?.role === 'admin' && (
                       <button 
                         onClick={() => setCommentTab('internal')}
                         className={cn("flex-1 py-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-colors flex items-center justify-center gap-1", commentTab === 'internal' ? "border-rose-500 text-rose-400" : "border-transparent text-fg-muted hover:text-fg")}
                       >
                         <Lock className="w-3 h-3" /> Internal Notes
                       </button>
                     )}
                   </div>
                   
                   <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar relative">
                     {commentTab === 'internal' && (
                       <div className="absolute top-0 left-0 right-0 h-1 bg-[repeating-linear-gradient(45deg,transparent,transparent_10px,#f43f5e_10px,#f43f5e_20px)] opacity-50 pointer-events-none" />
                     )}
                     
                     {syncedActiveFeature.comments.filter(c => commentTab === 'internal' ? c.isInternal : !c.isInternal).map(comment => (
                       <div key={comment.id} className={cn("p-4 rounded-xl border flex gap-3", comment.isInternal ? "bg-rose-500/5 border-rose-500/20" : comment.role === 'admin' ? "bg-purple-500/5 border-purple-500/20" : "bg-overlay border-border-subtle")}>
                         <div className={cn("w-8 h-8 rounded-full shrink-0 flex items-center justify-center font-bold text-xs", comment.isInternal ? "bg-rose-500/20 text-rose-400" : comment.role === 'admin' ? "bg-purple-500/20 text-purple-400" : "bg-white/10 text-fg-muted")}>
                           {comment.author.charAt(0).toUpperCase()}
                         </div>
                         <div>
                           <div className="flex items-center gap-2 mb-1">
                             <span className="font-bold text-sm text-fg">{comment.author}</span>
                             {comment.role === 'admin' && <span className={cn("text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded", comment.isInternal ? "bg-rose-500 text-black" : "bg-purple-500 text-black")}>Staff</span>}
                             <span className="text-xs text-fg-subtle font-mono">{new Date(comment.timestamp).toLocaleDateString()}</span>
                           </div>
                           <p className="text-sm text-fg-muted whitespace-pre-wrap leading-relaxed">{comment.content}</p>
                         </div>
                       </div>
                     ))}
                     {syncedActiveFeature.comments.filter(c => commentTab === 'internal' ? c.isInternal : !c.isInternal).length === 0 && (
                       <div className="text-center py-12 text-fg-subtle italic text-sm border border-dashed border-border rounded-xl">
                         {commentTab === 'internal' ? "No internal notes yet." : "No comments yet. Start the discussion!"}
                       </div>
                     )}
                   </div>

                   {/* Comment Input */}
                   <div className="p-4 bg-surface border-t border-border shrink-0">
                     <form onSubmit={handleSubmitComment} className="flex flex-col gap-2">
                        <textarea
                          value={newComment}
                          onChange={e => setNewComment(e.target.value)}
                          placeholder={commentTab === 'internal' ? "Add a private internal note..." : "Add to the discussion..."}
                          rows={2}
                          className={cn("w-full border rounded-xl py-3 px-4 text-sm text-fg focus:outline-none transition-colors resize-none custom-scrollbar", commentTab === 'internal' ? "bg-rose-500/5 border-rose-500/30 focus:border-rose-500 placeholder:text-rose-500/50" : "bg-[#121212] border-border focus:border-purple-500/50")}
                        />
                        <button type="submit" disabled={!newComment} className={cn("px-6 py-2 text-fg font-bold rounded-xl disabled:opacity-50 transition-colors flex items-center justify-center gap-2", commentTab === 'internal' ? "bg-rose-500 hover:bg-rose-600" : "bg-white/10 hover:bg-white/20")}>
                          {commentTab === 'internal' ? <Lock className="w-4 h-4"/> : null}
                          Post {commentTab === 'internal' ? 'Internal Note' : 'Reply'}
                        </button>
                     </form>
                   </div>

                 </div>
               </div>
             </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* New Request Drawer/Modal */}
      <AnimatePresence>
        {isCreating && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
             <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} onClick={() => setIsCreating(false)} className="absolute inset-0 bg-surface/80 backdrop-blur-sm" />
             <motion.div initial={{opacity:0, scale:0.95, y:20}} animate={{opacity:1, scale:1, y:0}} exit={{opacity:0, scale:0.95, y:20}} className="relative w-full max-w-xl bg-surface border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col">
               <div className="p-6 border-b border-border flex justify-between items-center bg-glass shrink-0">
                 <h2 className="text-xl font-bold text-fg flex items-center gap-2">
                   <Sparkles className="w-5 h-5 text-purple-400" /> Request a Feature
                 </h2>
                 <button onClick={() => setIsCreating(false)} className="text-fg-muted hover:text-fg p-2">
                   <X className="w-5 h-5" />
                 </button>
               </div>
               
               <div className="p-6">
                 
                 {/* AI Interceptor Alert */}
                 <AnimatePresence>
                   {aiWarning && (
                     <motion.div initial={{opacity:0, height:0}} animate={{opacity:1, height:'auto'}} exit={{opacity:0, height:0}} className="overflow-hidden mb-5">
                       <div className="bg-indigo-500/10 border border-indigo-500/30 rounded-xl p-4 flex items-start gap-3">
                         <AlertCircle className="w-5 h-5 text-indigo-400 mt-0.5 shrink-0" />
                         <div>
                           <div className="font-bold text-indigo-400 text-sm">Similar Request Found!</div>
                           <div className="text-xs text-indigo-100/60 mt-1">
                             An existing request matches your title: <strong className="text-indigo-200">&quot;{aiWarning}&quot;</strong>. You can help ship it faster by upvoting it instead of creating a duplicate.
                           </div>
                         </div>
                       </div>
                     </motion.div>
                   )}
                 </AnimatePresence>

                 <form id="feature-form" onSubmit={handleSubmitRequest} className="space-y-5">
                    <div>
                      <label className="block text-[10px] font-black text-fg-muted uppercase tracking-widest mb-2">Title</label>
                      <input
                        type="text"
                        value={newTitle}
                        onChange={e => setNewTitle(e.target.value)}
                        placeholder="Short, descriptive title..."
                        required
                        className="w-full bg-[#121212] border border-border rounded-xl py-3 px-4 text-sm text-fg focus:outline-none focus:border-purple-500/50"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-[10px] font-black text-fg-muted uppercase tracking-widest mb-2">Category</label>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        {['API', 'Dashboard', 'SDK', 'Webhooks'].map(cat => (
                          <button
                            key={cat}
                            type="button"
                            onClick={() => setNewCategory(cat as 'API' | 'Dashboard' | 'SDK' | 'Webhooks')}
                            className={cn(
                              "py-2 text-xs font-bold rounded-lg border transition-all",
                              newCategory === cat ? "bg-purple-500/20 text-purple-400 border-purple-500/30" : "bg-glass text-fg-muted border-border hover:bg-glass-2"
                            )}
                          >
                            {cat}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-black text-fg-muted uppercase tracking-widest mb-2">Description</label>
                      <textarea
                        value={newDescription}
                        onChange={e => setNewDescription(e.target.value)}
                        placeholder="What is the use case? How would this help your team?"
                        required
                        rows={5}
                        className="w-full bg-[#121212] border border-border rounded-xl py-3 px-4 text-sm text-fg focus:outline-none focus:border-purple-500/50 resize-none custom-scrollbar"
                      />
                    </div>
                 </form>
               </div>
               
               <div className="p-6 border-t border-border bg-surface flex justify-end gap-3 shrink-0">
                 <button type="button" onClick={() => setIsCreating(false)} className="px-6 py-3 border border-border font-bold rounded-xl hover:bg-glass transition-colors text-fg">
                   Cancel
                 </button>
                 <button type="submit" form="feature-form" disabled={!newTitle || !newDescription} className="px-8 py-3 bg-purple-500 text-fg font-bold rounded-xl hover:bg-purple-600 transition-colors disabled:opacity-50 flex items-center gap-2">
                   Submit Request
                 </button>
               </div>
             </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
