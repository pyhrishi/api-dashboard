'use client';

import { useState } from 'react';
import { LifeBuoy, AlertCircle, Clock, CheckCircle2, MessageSquare, Send } from 'lucide-react';

export default function SupportPage() {
  const [subject, setSubject] = useState('');
  const [priority, setPriority] = useState('low');
  const [endpoint, setEndpoint] = useState('general');
  const [description, setDescription] = useState('');

  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (subject && description) {
      setSubmitted(true);
      // Reset after 3 seconds for demo purposes
      setTimeout(() => {
        setSubmitted(false);
        setSubject('');
        setDescription('');
      }, 3000);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 ease-out">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight mb-2 flex items-center gap-3">
            <LifeBuoy className="w-8 h-8 text-teal" />
            Developer Support
          </h1>
          <p className="text-white/60">Manage your technical support tickets and SLAs.</p>
        </div>
        
        <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-teal/10 flex items-center justify-center border-2 border-teal/20">
            <Clock className="w-6 h-6 text-teal" />
          </div>
          <div>
            <div className="text-xs font-bold text-white/50 uppercase tracking-widest mb-1">Current SLA</div>
            <div className="text-sm font-extrabold text-white">Enterprise: &lt; 1 Hour Response</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Col: Ticket Form */}
        <div className="lg:col-span-2 space-y-6">
          <div className="glass-inner rounded-2xl border border-white/10 overflow-hidden shadow-xl">
            <div className="px-6 py-4 border-b border-white/10 bg-white/5">
              <h2 className="font-bold text-white">Open a Ticket</h2>
            </div>
            <div className="p-6">
              {submitted ? (
                <div className="flex flex-col items-center justify-center py-12 text-center space-y-4">
                  <div className="w-16 h-16 rounded-full bg-semantic-success/20 text-semantic-success flex items-center justify-center">
                    <CheckCircle2 className="w-8 h-8" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-white mb-2">Ticket Submitted</h3>
                    <p className="text-white/60 text-sm max-w-md mx-auto">Our engineering team has been notified. You will receive an email confirmation shortly based on your SLA.</p>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-5">
                  <div>
                    <label className="block text-xs font-bold text-white/60 uppercase tracking-wider mb-2">Subject</label>
                    <input 
                      type="text"
                      required
                      value={subject}
                      onChange={e => setSubject(e.target.value)}
                      placeholder="Brief description of the issue"
                      className="w-full bg-[#09090b] border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-teal transition-colors"
                    />
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div>
                      <label className="block text-xs font-bold text-white/60 uppercase tracking-wider mb-2">Priority</label>
                      <select
                        value={priority}
                        onChange={e => setPriority(e.target.value)}
                        className="w-full bg-[#09090b] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-teal transition-colors appearance-none"
                      >
                        <option value="low">Low (General Question)</option>
                        <option value="normal">Normal (Non-critical Issue)</option>
                        <option value="high">High (Production Impacted)</option>
                        <option value="urgent">Urgent (Complete Outage)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-white/60 uppercase tracking-wider mb-2">Endpoint / Area</label>
                      <select
                        value={endpoint}
                        onChange={e => setEndpoint(e.target.value)}
                        className="w-full bg-[#09090b] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-teal transition-colors appearance-none"
                      >
                        <option value="general">General / Account</option>
                        <option value="people">/v1/people-search</option>
                        <option value="company">/v1/company-search</option>
                        <option value="webhooks">Webhooks / Streams</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-white/60 uppercase tracking-wider mb-2">Description</label>
                    <textarea 
                      required
                      value={description}
                      onChange={e => setDescription(e.target.value)}
                      placeholder="Please provide steps to reproduce, request IDs, or specific error messages..."
                      rows={5}
                      className="w-full bg-[#09090b] border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-teal transition-colors resize-none"
                    />
                  </div>

                  <div className="pt-2 flex justify-end">
                    <button type="submit" className="bg-white text-ink px-6 py-2.5 rounded-full font-bold hover:bg-neutral-200 transition-colors flex items-center gap-2 text-sm shadow-lg shadow-white/10">
                      <Send className="w-4 h-4" />
                      Submit Ticket
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>

        {/* Right Col: Ticket History & Links */}
        <div className="space-y-6">
          
          <div className="glass-inner rounded-2xl border border-white/10 overflow-hidden">
            <div className="px-6 py-4 border-b border-white/10 bg-white/5">
              <h2 className="font-bold text-white text-sm">Recent Tickets</h2>
            </div>
            <div className="divide-y divide-white/5">
              
              <div className="p-4 hover:bg-white/5 transition-colors cursor-pointer group">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-mono text-white/40">#ZN-8402</span>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-semantic-success bg-semantic-success/10 px-2 py-0.5 rounded">Resolved</span>
                </div>
                <h4 className="text-sm font-bold text-white group-hover:text-teal transition-colors truncate">Webhook payload missing intent data</h4>
                <div className="text-xs text-white/50 mt-2">Closed 2 days ago</div>
              </div>

              <div className="p-4 hover:bg-white/5 transition-colors cursor-pointer group">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-mono text-white/40">#ZN-8319</span>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-semantic-success bg-semantic-success/10 px-2 py-0.5 rounded">Resolved</span>
                </div>
                <h4 className="text-sm font-bold text-white group-hover:text-teal transition-colors truncate">Rate limit increase request</h4>
                <div className="text-xs text-white/50 mt-2">Closed 2 weeks ago</div>
              </div>

            </div>
          </div>

          <div className="glass-inner rounded-2xl border border-white/10 p-6 space-y-4">
            <h3 className="font-bold text-white">Other Channels</h3>
            
            <a href="https://discord.gg/zintlr" target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 p-3 rounded-xl border border-white/5 bg-white/5 hover:bg-white/10 transition-colors">
              <MessageSquare className="w-5 h-5 text-[#5865F2]" />
              <div>
                <div className="text-sm font-bold text-white">Community Discord</div>
                <div className="text-xs text-white/50">Chat with other developers</div>
              </div>
            </a>

            <a href="/status" className="flex items-center gap-3 p-3 rounded-xl border border-white/5 bg-white/5 hover:bg-white/10 transition-colors">
              <AlertCircle className="w-5 h-5 text-semantic-success" />
              <div>
                <div className="text-sm font-bold text-white">System Status</div>
                <div className="text-xs text-white/50">Check for ongoing incidents</div>
              </div>
            </a>
          </div>

        </div>

      </div>
    </div>
  );
}
