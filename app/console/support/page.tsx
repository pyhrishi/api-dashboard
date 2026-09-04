'use client';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LifeBuoy, CheckCircle2, ChevronRight, Plus, ArrowLeft, Send, Link as LinkIcon, Lock, X, Timer, Play, ShieldAlert, BrainCircuit, Sparkles, Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStore, SupportTicketMessage } from '@/lib/store';
import { useRouter, useSearchParams } from 'next/navigation';
import { suggestTriage } from '@/lib/insight-engine';

const SecureMessage = ({ msg, isResolved }: { msg: SupportTicketMessage, isResolved: boolean }) => {
  const [isRevealed, setIsRevealed] = useState(false);
  
  if (isResolved || msg.message === '[SECURE VAULT PURGED]') {
    return (
      <div className="bg-overlay border border-border-subtle text-fg-subtle rounded-xl p-3 flex items-center gap-3 italic text-xs">
        <ShieldAlert className="w-4 h-4" /> [SECURE VAULT PURGED]
      </div>
    );
  }

  return (
    <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl overflow-hidden shadow-inner">
       <div className="px-3 py-2 border-b border-rose-500/10 flex items-center justify-between bg-rose-500/5">
         <div className="flex items-center gap-2 text-rose-400 text-[10px] font-black uppercase tracking-widest">
           <Lock className="w-3 h-3" /> Secure Vault Secret
         </div>
         <button 
           onMouseDown={() => setIsRevealed(true)} 
           onMouseUp={() => setIsRevealed(false)}
           onMouseLeave={() => setIsRevealed(false)}
           className="text-rose-400/60 hover:text-rose-400 text-[10px] uppercase font-bold flex items-center gap-1"
         >
           {isRevealed ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
           {isRevealed ? 'Hide' : 'Hold to Reveal'}
         </button>
       </div>
       <div className="p-3 text-sm font-mono text-rose-100 break-all">
         {isRevealed ? msg.message : '••••••••••••••••••••••••••••••••'}
       </div>
    </div>
  );
};

export default function SupportPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { supportTickets, createTicket, addTicketMessage, resolveTicket, checkSlaEscalation, apiLogs, logApiRequest } = useStore();
  
  // State
  const [activeTicketId, setActiveTicketId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  
  // New Ticket State
  const [newSubject, setNewSubject] = useState('');
  const [newPriority, setNewPriority] = useState<'low'|'medium'|'high'|'critical'>('medium');
  const [newMessage, setNewMessage] = useState('');
  const [linkedLogId, setLinkedLogId] = useState<string | undefined>();
  
  // AI Triage State
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState<{title: string, body: string} | null>(null);
  
  // Thread State
  const [replyMessage, setReplyMessage] = useState('');
  const [isSecretMode, setIsSecretMode] = useState(false);
  const [isAgentTyping, setIsAgentTyping] = useState(false);
  const threadEndRef = useRef<HTMLDivElement>(null);
  
  // Replay State
  const [isEditMode, setIsEditMode] = useState(false);
  const [replayPayload, setReplayPayload] = useState('');
  const [replayResult, setReplayResult] = useState<{ status?: number; body?: unknown } | null>(null);

  // SLA Tick
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => {
      setNow(Date.now());
      checkSlaEscalation();
    }, 1000);
    return () => clearInterval(t);
  }, [checkSlaEscalation]);

  // Handle URL Params for deep linking
  useEffect(() => {
    const action = searchParams?.get('action');
    const logId = searchParams?.get('logId');
    if (action === 'new') {
      setIsCreating(true);
      if (logId) {
        setLinkedLogId(logId);
        setNewSubject(`Issue with API Request ${logId.substring(0, 8)}...`);
      }
    }
  }, [searchParams]);

  // Auto-scroll thread
  useEffect(() => {
    if (threadEndRef.current) {
      threadEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [supportTickets, isAgentTyping, activeTicketId]);

  const activeTicket = useMemo(() => supportTickets.find(t => t.id === activeTicketId), [supportTickets, activeTicketId]);
  
  // Handlers
  const handleAnalyzeOrSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubject || !newMessage) return;
    
    // AI Triage Interception
    if (linkedLogId && !aiSuggestion) {
      const log = apiLogs.find(l => l.id === linkedLogId);
      if (log && log.status >= 400) {
        setIsAnalyzing(true);
        setTimeout(() => {
          setIsAnalyzing(false);
          const t = suggestTriage(log);
          setAiSuggestion({
            title: `Auto-Triage · ${t.severity.toUpperCase()} severity`,
            body: `${t.summary} ${t.resolution}`,
          });
        }, 1500);
        return;
      }
    }

    submitTicket();
  };

  const submitTicket = () => {
    createTicket(newSubject, newPriority, newMessage, linkedLogId);
    setIsCreating(false);
    setNewSubject('');
    setNewMessage('');
    setLinkedLogId(undefined);
    setAiSuggestion(null);
    router.replace('/console/support');
  };

  const handleReply = (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyMessage || !activeTicketId) return;
    
    addTicketMessage(activeTicketId, replyMessage, isSecretMode);
    setReplyMessage('');
    setIsSecretMode(false);
    
    // Simulate Agent Typing
    setIsAgentTyping(true);
    setTimeout(() => {
      addTicketMessage(activeTicketId, "We've received your update and our engineers are looking into it right now. We will follow up shortly.", false);
      setIsAgentTyping(false);
    }, 3000 + Math.random() * 2000);
  };

  const handleReplay = () => {
    if (!linkedLogId || !activeTicketId) return;
    const log = apiLogs.find(l => l.id === linkedLogId);
    if (!log) return;
    
    let parsedBody;
    try {
      parsedBody = JSON.parse(replayPayload);
    } catch {
      alert("Invalid JSON payload");
      return;
    }
    
    const mockStatus = 200;
    const mockRes = { success: true, message: "Replay successful" };
    
    logApiRequest({
      id: `log_${Date.now()}_rep`,
      timestamp: new Date().toISOString(),
      environment: log.environment,
      method: log.method,
      path: log.path,
      status: mockStatus,
      duration: Math.floor(Math.random() * 100) + 20,
      ip: log.ip,
      request: { ...log.request, body: parsedBody },
      response: mockRes
    });
    
    setReplayResult({ status: mockStatus, body: mockRes });
    setIsEditMode(false);
    
    // Auto-inject system message
    addTicketMessage(activeTicketId, `[SYSTEM EVENT]: User executed an interactive replay of the attached request with a modified payload. The new response was ${mockStatus} OK.`, false);
  };

  const getPriorityColor = (p: string) => {
    switch(p) {
      case 'low': return 'text-fg-muted bg-white/10';
      case 'medium': return 'text-blue-400 bg-blue-500/10 border-blue-500/20';
      case 'high': return 'text-orange-400 bg-orange-500/10 border-orange-500/20';
      case 'critical': return 'text-semantic-error bg-semantic-error/10 border-semantic-error/20';
      default: return 'text-fg-muted bg-white/10';
    }
  };

  const getStatusColor = (s: string) => {
    switch(s) {
      case 'open': return 'text-orange-400 bg-orange-500/10 border-orange-500/20';
      case 'in_progress': return 'text-blue-400 bg-blue-500/10 border-blue-500/20';
      case 'resolved': return 'text-semantic-success bg-semantic-success/10 border-semantic-success/20';
      default: return 'text-fg-muted bg-white/10';
    }
  };

  const formatSla = (deadline: string) => {
    const diff = new Date(deadline).getTime() - now;
    if (diff <= 0) return 'BREACHED';
    const h = Math.floor(diff / (1000 * 60 * 60));
    const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const s = Math.floor((diff % (1000 * 60)) / 1000);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Render log context
  const renderLogContext = (logId: string) => {
    const log = apiLogs.find(l => l.id === logId);
    if (!log) return null;
    
    return (
      <div className="bg-surface/80 border border-border rounded-xl overflow-hidden mb-6 shadow-xl">
        <div className="px-4 py-3 border-b border-border-subtle flex items-center justify-between bg-glass">
          <div className="flex items-center gap-3">
            <LinkIcon className="w-4 h-4 text-teal" />
            <span className="font-bold text-xs uppercase tracking-widest text-fg-muted">Attached Request Context</span>
          </div>
          <div className="flex gap-2">
            {!isEditMode && activeTicket?.status !== 'resolved' && (
              <button 
                onClick={() => {
                  setReplayPayload(JSON.stringify(log.request.body || {}, null, 2));
                  setIsEditMode(true);
                }}
                className="text-[10px] uppercase font-bold text-teal hover:text-teal/80 bg-teal/10 px-2 py-1 rounded border border-teal/20 flex items-center gap-1"
              >
                <Play className="w-3 h-3" /> Edit & Replay
              </button>
            )}
            <button onClick={() => router.push(`/console/logs?search=${log.id}`)} className="text-[10px] uppercase font-bold text-fg-muted hover:text-fg px-2 py-1">View in Logs ↗</button>
          </div>
        </div>
        <div className="p-4 space-y-4">
          <div className="flex items-center gap-3">
            <span className={cn("px-2 py-0.5 rounded text-xs font-black uppercase tracking-wider", log.status >= 400 ? 'bg-semantic-error/10 text-semantic-error border border-semantic-error/20' : 'bg-semantic-success/10 text-semantic-success border border-semantic-success/20')}>
              {log.status}
            </span>
            <span className="font-bold text-fg font-mono text-sm">{log.method} {log.path}</span>
          </div>
          
          {isEditMode ? (
             <div className="space-y-3">
               <div className="text-[10px] font-black uppercase text-teal mb-2 flex items-center gap-1"><Sparkles className="w-3 h-3"/> Interactive Sandbox</div>
               <textarea 
                 value={replayPayload}
                 onChange={(e) => setReplayPayload(e.target.value)}
                 className="w-full h-32 bg-[#121212] border border-teal/30 rounded-lg p-2 text-sm text-teal/90 font-mono focus:outline-none focus:border-teal custom-scrollbar"
               />
               <div className="flex justify-end gap-2">
                 <button onClick={() => setIsEditMode(false)} className="px-3 py-1 text-xs font-bold text-fg-muted hover:text-fg">Cancel</button>
                 <button onClick={handleReplay} className="px-3 py-1 bg-teal text-black text-xs font-bold rounded hover:bg-teal/90 flex items-center gap-1"><Play className="w-3 h-3"/> Fire Request</button>
               </div>
             </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-[10px] font-black uppercase text-fg-muted mb-2">Request Payload</div>
                <div className="max-h-32 overflow-auto bg-[#121212] rounded-lg p-2 border border-border-subtle custom-scrollbar">
                  <pre className="text-[10px] text-fg-muted font-mono">{JSON.stringify(log.request, null, 2)}</pre>
                </div>
              </div>
              <div>
                <div className="text-[10px] font-black uppercase text-fg-muted mb-2">Response Payload</div>
                <div className="max-h-32 overflow-auto bg-[#121212] rounded-lg p-2 border border-border-subtle custom-scrollbar">
                  <pre className="text-[10px] text-fg-muted font-mono">{JSON.stringify(replayResult?.body || log.response, null, 2)}</pre>
                </div>
                {replayResult && <div className="text-[10px] text-teal mt-1 font-bold">Showing Replay Result</div>}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-6xl mx-auto animate-in fade-in duration-500 pb-24">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-teal/10 border border-teal/20 flex items-center justify-center">
              <LifeBuoy className="w-5 h-5 text-teal" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-fg">Support & Tickets</h1>
          </div>
          <p className="text-fg-muted">Get help from our engineering team and track your technical issues.</p>
        </div>
        
        {!activeTicketId && (
          <button
            onClick={() => setIsCreating(true)}
            className="h-10 px-4 bg-teal text-[#09090b] font-bold rounded-xl hover:bg-teal/90 transition-all flex items-center gap-2 shadow-[0_0_15px_rgba(45,212,191,0.3)]"
          >
            <Plus className="w-4 h-4" /> New Ticket
          </button>
        )}
      </div>

      {!activeTicketId && !isCreating && (
        <div className="space-y-4">
          <div className="glass-inner rounded-2xl border border-border shadow-xl overflow-hidden">
             {supportTickets.length === 0 ? (
                <div className="p-16 flex flex-col items-center justify-center text-center">
                  <LifeBuoy className="w-12 h-12 text-white/10 mb-4" />
                  <h3 className="text-lg font-bold text-fg mb-2">No active tickets</h3>
                  <p className="text-fg-muted text-sm max-w-md">You haven&apos;t opened any support tickets yet. If you run into issues, you can file a ticket directly from the API Logs.</p>
                </div>
             ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-border bg-glass">
                        <th className="px-6 py-4 text-[10px] font-black text-fg-muted uppercase tracking-widest">Subject</th>
                        <th className="px-6 py-4 text-[10px] font-black text-fg-muted uppercase tracking-widest">Status</th>
                        <th className="px-6 py-4 text-[10px] font-black text-fg-muted uppercase tracking-widest">SLA</th>
                        <th className="px-6 py-4 text-[10px] font-black text-fg-muted uppercase tracking-widest">Priority</th>
                        <th className="px-6 py-4 text-[10px] font-black text-fg-muted uppercase tracking-widest">Last Updated</th>
                      </tr>
                    </thead>
                    <tbody>
                      {supportTickets.map(ticket => {
                         const isBreaching = ticket.status !== 'resolved' && ticket.slaDeadline && (new Date(ticket.slaDeadline).getTime() - now < 900000); // 15m
                         return (
                        <tr key={ticket.id} className="border-b border-border-subtle hover:bg-glass transition-colors group cursor-pointer" onClick={() => setActiveTicketId(ticket.id)}>
                          <td className="px-6 py-4">
                            <div className="font-bold text-fg group-hover:text-teal transition-colors flex items-center gap-2">
                              {ticket.subject}
                              {ticket.linkedLogId && <LinkIcon className="w-3.5 h-3.5 text-fg-subtle" />}
                            </div>
                            <div className="text-xs text-fg-muted mt-1">ID: {ticket.id}</div>
                          </td>
                          <td className="px-6 py-4">
                            <span className={cn("px-2.5 py-1 rounded-md text-[10px] uppercase font-black tracking-wider border flex items-center gap-1.5 w-fit", getStatusColor(ticket.status))}>
                              {ticket.status === 'in_progress' && <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />}
                              {ticket.status.replace('_', ' ')}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            {ticket.status !== 'resolved' && ticket.slaDeadline ? (
                              <div className={cn("flex items-center gap-1.5 text-xs font-mono font-bold px-2 py-1 rounded border", isBreaching ? "text-semantic-error border-semantic-error/30 bg-semantic-error/10 animate-pulse" : "text-fg-muted border-border bg-glass")}>
                                <Timer className="w-3.5 h-3.5" />
                                {formatSla(ticket.slaDeadline)}
                              </div>
                            ) : (
                              <span className="text-fg-subtle text-xs">—</span>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <span className={cn("px-2.5 py-1 rounded-md text-[10px] uppercase font-black tracking-wider border", getPriorityColor(ticket.priority))}>
                              {ticket.priority}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-fg-muted text-xs flex justify-between items-center">
                            {new Date(ticket.updatedAt).toLocaleString()}
                            <ChevronRight className="w-5 h-5 text-fg-subtle group-hover:text-teal transition-colors inline-block" />
                          </td>
                        </tr>
                      )})}
                    </tbody>
                  </table>
                </div>
             )}
          </div>
        </div>
      )}

      {/* Ticket View */}
      {activeTicketId && activeTicket && (
        <div className="glass-inner rounded-2xl border border-border shadow-xl overflow-hidden flex flex-col h-[700px]">
          <div className="p-4 border-b border-border bg-surface/50 flex items-center justify-between shrink-0">
             <div className="flex items-center gap-4">
               <button onClick={() => { setActiveTicketId(null); setIsEditMode(false); setReplayResult(null); }} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-glass-2 text-fg-muted hover:text-fg transition-colors">
                 <ArrowLeft className="w-4 h-4" />
               </button>
               <div>
                 <h2 className="font-bold text-fg text-lg flex items-center gap-2">
                   {activeTicket.subject}
                 </h2>
                 <div className="text-xs text-fg-muted flex items-center gap-4 mt-1">
                   <span>ID: {activeTicket.id}</span>
                   <span className={cn("uppercase font-bold", activeTicket.status === 'resolved' ? 'text-semantic-success' : 'text-orange-400')}>{activeTicket.status.replace('_', ' ')}</span>
                 </div>
               </div>
             </div>
             {activeTicket.status !== 'resolved' && (
               <div className="flex gap-3">
                 {activeTicket.slaDeadline && (
                    <div className="px-3 py-1.5 rounded-lg bg-glass border border-border flex items-center gap-2">
                      <span className="text-[10px] font-black uppercase text-fg-muted tracking-widest">SLA</span>
                      <span className="text-xs font-mono font-bold text-fg">{formatSla(activeTicket.slaDeadline)}</span>
                    </div>
                 )}
                 <button 
                   onClick={() => resolveTicket(activeTicket.id)}
                   className="px-4 py-1.5 border border-border rounded-xl text-xs font-bold hover:bg-glass transition-colors flex items-center gap-2 text-fg-muted hover:text-fg"
                 >
                   <CheckCircle2 className="w-4 h-4" /> Mark Resolved
                 </button>
               </div>
             )}
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar bg-gradient-to-b from-transparent to-[#09090b]/20 relative">
             {activeTicket.status !== 'resolved' && (
               <div className="absolute top-0 left-0 right-0 bg-teal/10 border-b border-teal/20 text-teal py-1 flex justify-center items-center gap-2 text-[10px] font-bold uppercase tracking-widest">
                 <Eye className="w-3 h-3" /> Zinbit Support is actively monitoring this ticket
               </div>
             )}
             
             <div className="pt-4">
               {activeTicket.linkedLogId && renderLogContext(activeTicket.linkedLogId)}
             </div>
             
             {activeTicket.messages.map((msg) => (
               <div key={msg.id} className={cn("flex w-full", msg.sender === 'user' ? "justify-end" : "justify-start")}>
                 <div className={cn(
                   "max-w-[75%] rounded-2xl p-4 shadow-lg",
                   msg.sender === 'user' ? "bg-teal/10 border border-teal/20 text-fg" : 
                   msg.sender === 'support' && msg.message.includes('[SYSTEM EVENT]') ? "bg-glass border border-border text-fg-muted italic text-xs w-full text-center" : 
                   "bg-[#121212] border border-border text-fg"
                 )}>
                   {!msg.message.includes('[SYSTEM EVENT]') && (
                     <div className="text-[10px] uppercase font-black tracking-wider text-fg-subtle mb-2 flex items-center gap-2">
                       {msg.sender === 'user' ? 'You' : 'Zinbit Support'}
                       <span className="opacity-50 font-mono normal-case tracking-normal">{new Date(msg.timestamp).toLocaleTimeString()}</span>
                     </div>
                   )}
                   
                   {msg.isSecret ? (
                     <SecureMessage msg={msg} isResolved={activeTicket.status === 'resolved'} />
                   ) : (
                     <div className="text-sm whitespace-pre-wrap leading-relaxed">{msg.message}</div>
                   )}
                 </div>
               </div>
             ))}
             {isAgentTyping && (
               <div className="flex w-full justify-start">
                 <div className="bg-[#121212] border border-border text-fg-muted rounded-2xl p-4 text-xs italic flex items-center gap-2">
                   <div className="flex gap-1">
                     <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                     <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                     <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                   </div>
                   Zinbit Support is typing...
                 </div>
               </div>
             )}
             <div ref={threadEndRef} />
          </div>
          
          <div className="p-4 border-t border-border bg-surface shrink-0">
             {activeTicket.status === 'resolved' ? (
                <div className="text-center p-4 text-sm text-fg-muted italic flex items-center justify-center gap-2">
                  <Lock className="w-4 h-4" /> This ticket has been resolved and is closed to new messages.
                </div>
             ) : (
                <form onSubmit={handleReply} className="flex gap-2">
                  <button 
                    type="button" 
                    onClick={() => setIsSecretMode(!isSecretMode)}
                    className={cn("px-4 rounded-xl border flex items-center justify-center transition-colors", isSecretMode ? "bg-rose-500/20 border-rose-500/50 text-rose-400" : "bg-[#121212] border-border text-fg-muted hover:text-fg")}
                    title="Toggle Secure Vault Mode"
                  >
                    {isSecretMode ? <Lock className="w-5 h-5" /> : <Lock className="w-5 h-5 opacity-50" />}
                  </button>
                  <input
                    type="text"
                    value={replyMessage}
                    onChange={e => setReplyMessage(e.target.value)}
                    placeholder={isSecretMode ? "Enter secure payload (will self-destruct on resolve)..." : "Type your reply..."}
                    className={cn(
                      "flex-1 border rounded-xl py-3 px-4 text-sm focus:outline-none transition-colors",
                      isSecretMode ? "bg-rose-500/5 border-rose-500/30 text-rose-100 placeholder:text-rose-500/50" : "bg-[#121212] border-border text-fg focus:border-teal/50"
                    )}
                  />
                  <button type="submit" disabled={!replyMessage} className={cn("px-6 font-bold rounded-xl disabled:opacity-50 transition-colors flex items-center gap-2", isSecretMode ? "bg-rose-500 text-fg hover:bg-rose-600" : "bg-teal text-[#09090b] hover:bg-teal/90")}>
                    Send <Send className="w-4 h-4" />
                  </button>
                </form>
             )}
          </div>
        </div>
      )}

      {/* New Ticket Modal */}
      <AnimatePresence>
        {isCreating && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
             <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} onClick={() => { setIsCreating(false); router.replace('/console/support'); }} className="absolute inset-0 bg-surface/80 backdrop-blur-sm" />
             <motion.div initial={{opacity:0, scale:0.95, y:20}} animate={{opacity:1, scale:1, y:0}} exit={{opacity:0, scale:0.95, y:20}} className="relative w-full max-w-2xl bg-surface border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
               <div className="p-6 border-b border-border flex justify-between items-center bg-glass shrink-0">
                 <h2 className="text-xl font-bold text-fg flex items-center gap-2">
                   <LifeBuoy className="w-5 h-5 text-teal" /> New Support Ticket
                 </h2>
                 <button onClick={() => { setIsCreating(false); router.replace('/console/support'); }} className="text-fg-muted hover:text-fg p-2">
                   <X className="w-5 h-5" />
                 </button>
               </div>
               
               <div className="p-6 overflow-y-auto custom-scrollbar relative">
                 
                 {isAnalyzing && (
                   <div className="absolute inset-0 z-10 bg-surface/90 backdrop-blur flex flex-col items-center justify-center">
                     <BrainCircuit className="w-12 h-12 text-teal animate-pulse mb-4" />
                     <h3 className="text-lg font-bold text-fg mb-2">AI Analyzing Request...</h3>
                     <p className="text-fg-muted text-sm">Searching for known error patterns in your log payload.</p>
                   </div>
                 )}

                 <form id="ticket-form" onSubmit={handleAnalyzeOrSubmit} className="space-y-6">
                    {linkedLogId && (
                      <div className="bg-teal/5 border border-teal/20 rounded-xl p-4 flex items-start gap-3">
                        <LinkIcon className="w-5 h-5 text-teal shrink-0 mt-0.5" />
                        <div>
                          <div className="font-bold text-teal text-sm">Request Auto-Attached</div>
                          <div className="text-xs text-fg-muted mt-1">Request ID <code className="font-mono bg-overlay px-1 py-0.5 rounded text-fg">{linkedLogId}</code> will be attached to this ticket automatically to help our engineers debug faster.</div>
                        </div>
                      </div>
                    )}
                    
                    <AnimatePresence>
                      {aiSuggestion && (
                        <motion.div initial={{opacity:0, height:0}} animate={{opacity:1, height:'auto'}} className="bg-indigo-500/10 border border-indigo-500/30 rounded-xl p-5 overflow-hidden relative">
                          <div className="absolute top-0 right-0 bg-indigo-500 text-fg text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-bl-lg">AI Auto-Triage</div>
                          <h4 className="font-bold text-indigo-400 mb-2 flex items-center gap-2"><Sparkles className="w-4 h-4" /> {aiSuggestion.title}</h4>
                          <p className="text-sm text-indigo-200/80 mb-4">{aiSuggestion.body}</p>
                          <div className="flex gap-3">
                            <button type="button" onClick={() => {setIsCreating(false); setAiSuggestion(null); router.replace('/console/support');}} className="flex-1 bg-indigo-500 hover:bg-indigo-600 text-fg font-bold py-2 rounded-lg text-sm transition-colors">
                              This solved my issue
                            </button>
                            <button type="button" onClick={submitTicket} className="flex-1 bg-glass hover:bg-glass-2 text-fg font-bold py-2 rounded-lg text-sm border border-border transition-colors">
                              Continue to Submit
                            </button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                    
                    {!aiSuggestion && (
                      <>
                        <div className="flex gap-4">
                          <div className="flex-[2]">
                            <label className="block text-[10px] font-black text-fg-muted uppercase tracking-widest mb-2">Subject</label>
                            <input
                              type="text"
                              value={newSubject}
                              onChange={e => setNewSubject(e.target.value)}
                              placeholder="Brief summary of the issue..."
                              required
                              className="w-full bg-[#121212] border border-border rounded-xl py-3 px-4 text-sm text-fg focus:outline-none focus:border-teal/50"
                            />
                          </div>
                          <div className="flex-1">
                            <label className="block text-[10px] font-black text-fg-muted uppercase tracking-widest mb-2">Priority</label>
                            <select
                              value={newPriority}
                              onChange={e => setNewPriority(e.target.value as 'low' | 'medium' | 'high' | 'critical')}
                              className="w-full bg-[#121212] border border-border rounded-xl py-3 px-4 text-sm text-fg focus:outline-none focus:border-teal/50"
                            >
                              <option value="low">Low</option>
                              <option value="medium">Medium</option>
                              <option value="high">High</option>
                              <option value="critical">Critical</option>
                            </select>
                          </div>
                        </div>

                        <div>
                          <label className="block text-[10px] font-black text-fg-muted uppercase tracking-widest mb-2">Description</label>
                          <textarea
                            value={newMessage}
                            onChange={e => setNewMessage(e.target.value)}
                            placeholder="Please describe the issue in detail. If applicable, include steps to reproduce..."
                            required
                            rows={6}
                            className="w-full bg-[#121212] border border-border rounded-xl py-3 px-4 text-sm text-fg focus:outline-none focus:border-teal/50 resize-none custom-scrollbar"
                          />
                        </div>
                      </>
                    )}
                 </form>
               </div>
               
               {!aiSuggestion && (
                 <div className="p-6 border-t border-border bg-surface flex justify-end gap-3 shrink-0">
                   <button type="button" onClick={() => { setIsCreating(false); router.replace('/console/support'); }} className="px-6 py-3 border border-border font-bold rounded-xl hover:bg-glass transition-colors text-fg">
                     Cancel
                   </button>
                   <button type="submit" form="ticket-form" disabled={!newSubject || !newMessage || isAnalyzing} className="px-8 py-3 bg-teal text-[#09090b] font-bold rounded-xl hover:bg-teal/90 transition-colors disabled:opacity-50">
                     {isAnalyzing ? 'Analyzing...' : 'Submit Ticket'}
                   </button>
                 </div>
               )}
             </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
