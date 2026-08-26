'use client';

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, ChevronUp, MessageSquare, Clock, Filter, Search, X, Tag, ListFilter, Activity, CheckCircle2, Clock3 } from 'lucide-react';

type FeatureStatus = 'Under Consideration' | 'Planned' | 'In Progress' | 'Completed';
type Category = 'API' | 'Dashboard' | 'Billing' | 'SDK' | 'Other';
type SortOption = 'Top Voted' | 'Newest';

interface FeatureRequest {
  id: string;
  title: string;
  description: string;
  status: FeatureStatus;
  category: Category;
  upvotes: number;
  submittedAt: string;
  author: string;
  isUpvotedByMe: boolean;
  timestamp: number; // for sorting by newest
}

const initialFeatures: FeatureRequest[] = [
  {
    id: 'FR-001',
    title: 'Webhook Retries Configuration',
    description: 'Allow configuring the backoff strategy (linear vs exponential) for webhook retries directly from the dashboard.',
    status: 'Planned',
    category: 'Dashboard',
    upvotes: 142,
    submittedAt: '3 weeks ago',
    timestamp: Date.now() - 1000 * 60 * 60 * 24 * 21,
    author: 'Stripe Integration Team',
    isUpvotedByMe: false
  },
  {
    id: 'FR-002',
    title: 'Python SDK Async Support',
    description: 'Add fully typed asyncio support for the official Python SDK to improve throughput in asynchronous extraction jobs.',
    status: 'In Progress',
    category: 'SDK',
    upvotes: 89,
    submittedAt: '1 month ago',
    timestamp: Date.now() - 1000 * 60 * 60 * 24 * 30,
    author: 'DataEng Corp',
    isUpvotedByMe: true
  },
  {
    id: 'FR-003',
    title: 'Idempotency Keys for all POST endpoints',
    description: 'Ensure that every POST/PATCH request in the API accepts an Idempotency-Key header to prevent duplicate charges on timeouts.',
    status: 'Completed',
    category: 'API',
    upvotes: 215,
    submittedAt: '3 months ago',
    timestamp: Date.now() - 1000 * 60 * 60 * 24 * 90,
    author: 'Acme FinTech',
    isUpvotedByMe: false
  },
  {
    id: 'FR-004',
    title: 'Usage Alerts via Slack',
    description: 'Native Slack integration to alert the engineering team when API credit usage hits 80% or 90% of the monthly limit.',
    status: 'Under Consideration',
    category: 'Billing',
    upvotes: 67,
    submittedAt: '2 days ago',
    timestamp: Date.now() - 1000 * 60 * 60 * 24 * 2,
    author: 'GrowthHacks LLC',
    isUpvotedByMe: false
  },
  {
    id: 'FR-005',
    title: 'GraphQL API Endpoint',
    description: 'Provide a GraphQL endpoint for the lookup services so we can request exact nested fields and reduce payload size.',
    status: 'Under Consideration',
    category: 'API',
    upvotes: 45,
    submittedAt: '1 week ago',
    timestamp: Date.now() - 1000 * 60 * 60 * 24 * 7,
    author: 'Frontend Wizards',
    isUpvotedByMe: false
  },
  {
    id: 'FR-006',
    title: 'Export logs to Datadog',
    description: '1-click integration to stream API request logs and error traces directly into our Datadog instance.',
    status: 'Planned',
    category: 'Dashboard',
    upvotes: 112,
    submittedAt: '2 weeks ago',
    timestamp: Date.now() - 1000 * 60 * 60 * 24 * 14,
    author: 'DevOps Inc.',
    isUpvotedByMe: false
  }
];

const StatusIcons: Record<FeatureStatus, React.ReactNode> = {
  'Under Consideration': <MessageSquare className="w-3.5 h-3.5 text-blue-400" />,
  'Planned': <Clock3 className="w-3.5 h-3.5 text-purple-400" />,
  'In Progress': <Activity className="w-3.5 h-3.5 text-yellow-400" />,
  'Completed': <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />,
};

const categoryColors: Record<Category, string> = {
  API: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  Dashboard: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  Billing: 'bg-green-500/10 text-green-400 border-green-500/20',
  SDK: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  Other: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
};

import { useToast } from '@/components/Toast';

export default function FeatureRequestBoard() {
  const [features, setFeatures] = useState<FeatureRequest[]>(initialFeatures);
  const toast = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<FeatureStatus | 'All'>('All');
  const [sortBy, setSortBy] = useState<SortOption>('Top Voted');
  const [isModalOpen, setIsModalOpen] = useState(false);

  // New Request Form State
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newCategory, setNewCategory] = useState<Category>('API');

  const handleUpvote = (id: string) => {
    setFeatures(prev => prev.map(f => {
      if (f.id === id) {
        const isUpvoting = !f.isUpvotedByMe;
        if (isUpvoting) {
          toast.success('Vote Cast', 'Your vote has been recorded.');
        }
        return {
          ...f,
          upvotes: f.isUpvotedByMe ? f.upvotes - 1 : f.upvotes + 1,
          isUpvotedByMe: isUpvoting
        };
      }
      return f;
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newDescription.trim()) return;

    const newFeature: FeatureRequest = {
      id: `FR-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`,
      title: newTitle,
      description: newDescription,
      status: 'Under Consideration',
      category: newCategory,
      upvotes: 1,
      submittedAt: 'Just now',
      timestamp: Date.now(),
      author: 'You',
      isUpvotedByMe: true
    };

    setFeatures([newFeature, ...features]);
    setIsModalOpen(false);
    setNewTitle('');
    setNewDescription('');
    setNewCategory('API');
    setSortBy('Newest');
    toast.success('Feature Request Submitted', 'Your idea is now on the board and open for voting.');
  };

  const processedFeatures = useMemo(() => {
    let result = features;

    // Filter by status
    if (activeFilter !== 'All') {
      result = result.filter(f => f.status === activeFilter);
    }

    // Filter by search
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(f => 
        f.title.toLowerCase().includes(q) || 
        f.description.toLowerCase().includes(q)
      );
    }

    // Sort
    result.sort((a, b) => {
      if (sortBy === 'Top Voted') {
        return b.upvotes - a.upvotes;
      }
      // Newest
      return b.timestamp - a.timestamp;
    });

    return result;
  }, [features, activeFilter, searchQuery, sortBy]);

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#0A0A0C] font-sans">
      
      {/* HEADER */}
      <div className="px-8 py-8 border-b border-white/5 shrink-0">
        <div className="max-w-[1200px] mx-auto flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <MessageSquare className="w-6 h-6 text-teal" />
              Feature Requests
            </h1>
            <p className="text-white/40 mt-1 text-sm">Submit ideas, upvote features, and track our development roadmap.</p>
          </div>
          
          <button 
            onClick={() => setIsModalOpen(true)}
            className="bg-[#09090b]/10 hover:bg-[#09090b]/20 text-white font-medium px-4 py-2 rounded-lg flex items-center gap-2 transition-colors border border-white/10 text-sm"
          >
            <Plus className="w-4 h-4" />
            New Request
          </button>
        </div>
      </div>

      {/* CONTROLS */}
      <div className="px-8 py-4 bg-[#0A0A0C] sticky top-0 z-10 border-b border-white/5 shrink-0">
        <div className="max-w-[1200px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          
          {/* Status Tabs */}
          <div className="flex items-center gap-1 bg-[#09090b]/5 p-1 rounded-lg border border-white/5 w-full sm:w-auto overflow-x-auto">
            {(['All', 'Under Consideration', 'Planned', 'In Progress', 'Completed'] as const).map(status => (
              <button
                key={status}
                onClick={() => setActiveFilter(status)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
                  activeFilter === status 
                    ? 'bg-[#09090b]/10 text-white shadow-[0_0_15px_rgba(255,255,255,0.02)]' 
                    : 'text-white/40 hover:text-white hover:bg-[#09090b]/5'
                }`}
              >
                {status}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            {/* Search */}
            <div className="relative flex-1 sm:w-64">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
              <input 
                type="text" 
                placeholder="Search..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full bg-transparent border border-white/10 rounded-lg pl-9 pr-3 py-1.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-teal/50 transition-colors"
              />
            </div>

            {/* Sort */}
            <div className="relative shrink-0">
              <ListFilter className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
              <select 
                value={sortBy}
                onChange={e => setSortBy(e.target.value as SortOption)}
                className="pl-8 pr-8 py-1.5 bg-transparent border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-teal/50 appearance-none cursor-pointer"
              >
                <option value="Top Voted" className="bg-[#111115]">Top Voted</option>
                <option value="Newest" className="bg-[#111115]">Newest</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* LIST VIEW */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="max-w-[1200px] mx-auto flex flex-col gap-3 pb-20">
          <AnimatePresence mode="popLayout">
            {processedFeatures.map(feature => (
              <motion.div
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2 }}
                key={feature.id} 
                className="group flex items-start gap-4 p-4 rounded-xl border border-white/5 hover:border-white/10 bg-[#09090b]/[0.02] hover:bg-[#09090b]/[0.04] transition-colors"
              >
                {/* Upvote Column */}
                <button 
                  onClick={() => handleUpvote(feature.id)}
                  className={`shrink-0 flex flex-col items-center justify-center w-12 py-1.5 rounded-lg border transition-all ${
                    feature.isUpvotedByMe 
                      ? 'bg-teal/10 border-teal/30 text-teal' 
                      : 'bg-[#09090b]/5 border-transparent text-white/40 hover:bg-[#09090b]/10 hover:text-white'
                  }`}
                >
                  <ChevronUp className={`w-5 h-5 -mb-0.5 ${feature.isUpvotedByMe ? 'stroke-[3px]' : 'stroke-2'}`} />
                  <span className="font-bold text-xs">{feature.upvotes}</span>
                </button>
                
                {/* Main Content */}
                <div className="flex-1 min-w-0 py-0.5">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-mono text-white/30">{feature.id}</span>
                        <h4 className="text-base text-white font-semibold truncate leading-tight group-hover:text-teal transition-colors">
                          {feature.title}
                        </h4>
                      </div>
                      
                      <p className="text-white/50 text-sm leading-relaxed line-clamp-2 sm:line-clamp-1 mb-2">
                        {feature.description}
                      </p>

                      <div className="flex items-center gap-3 text-xs text-white/40">
                        <span className="flex items-center gap-1.5">
                          {feature.author}
                        </span>
                        <span>•</span>
                        <span className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5" />
                          {feature.submittedAt}
                        </span>
                      </div>
                    </div>

                    {/* Right Column: Badges */}
                    <div className="flex items-center gap-2 shrink-0 sm:flex-col sm:items-end">
                      <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border bg-[#09090b]/5 ${
                        feature.status === 'Completed' ? 'border-green-500/20 text-green-400' :
                        feature.status === 'In Progress' ? 'border-yellow-500/20 text-yellow-400' :
                        feature.status === 'Planned' ? 'border-purple-500/20 text-purple-400' :
                        'border-blue-500/20 text-blue-400'
                      }`}>
                        {StatusIcons[feature.status]}
                        {feature.status}
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${categoryColors[feature.category]}`}>
                        {feature.category}
                      </span>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          
          {processedFeatures.length === 0 && (
            <div className="border border-dashed border-white/10 rounded-xl p-12 flex flex-col items-center justify-center text-center mt-4">
              <div className="w-12 h-12 rounded-full bg-[#09090b]/5 flex items-center justify-center mb-4">
                <Search className="w-5 h-5 text-white/20" />
              </div>
              <p className="text-white text-sm font-medium mb-1">No feature requests found.</p>
              <p className="text-white/40 text-sm">Try adjusting your search or filters.</p>
            </div>
          )}
        </div>
      </div>

      {/* SUBMIT REQUEST MODAL */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-[#18181b] border border-white/10 rounded-xl w-full max-w-lg relative z-10 overflow-hidden shadow-2xl"
            >
              <div className="p-5 border-b border-white/5 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white">New Feature Request</h2>
                <button onClick={() => setIsModalOpen(false)} className="text-white/40 hover:text-white transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-5 space-y-5">
                <div>
                  <label className="block text-sm font-medium text-white/70 mb-1.5">Title</label>
                  <input 
                    type="text" 
                    value={newTitle}
                    onChange={e => setNewTitle(e.target.value)}
                    placeholder="Brief, descriptive title"
                    className="w-full bg-black/20 border border-white/10 rounded-md px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-teal/50 transition-colors"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-white/70 mb-1.5">Category</label>
                  <div className="relative">
                    <Tag className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                    <select 
                      value={newCategory}
                      onChange={e => setNewCategory(e.target.value as Category)}
                      className="w-full bg-black/20 border border-white/10 rounded-md pl-9 pr-3 py-2 text-sm text-white focus:outline-none focus:border-teal/50 transition-colors appearance-none cursor-pointer"
                    >
                      <option value="API">API</option>
                      <option value="Dashboard">Dashboard</option>
                      <option value="Billing">Billing</option>
                      <option value="SDK">SDK</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-white/70 mb-1.5">Description & Use Case</label>
                  <textarea 
                    value={newDescription}
                    onChange={e => setNewDescription(e.target.value)}
                    placeholder="Why do you need this? What problem does it solve?"
                    rows={4}
                    className="w-full bg-black/20 border border-white/10 rounded-md px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-teal/50 transition-colors resize-none"
                    required
                  />
                </div>

                <div className="pt-2 flex items-center justify-end gap-3">
                  <button 
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2 rounded-md text-sm font-medium text-white/60 hover:text-white hover:bg-[#09090b]/5 transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="bg-[#09090b] hover:bg-gray-200 text-black font-semibold px-4 py-2 rounded-md text-sm transition-colors"
                  >
                    Submit
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
