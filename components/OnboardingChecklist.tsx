'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '@/lib/store';
import { Check, ChevronRight, Key, Webhook, Users, Play, X, User } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

export function OnboardingChecklist() {
  const { 
    activeKeys, 
    webhooks, 
    teamMembers, 
    isFirstCallMade, 
    isChecklistDismissed, 
    dismissChecklist 
  } = useStore();

  const [isExpanded, setIsExpanded] = useState(true);

  if (isChecklistDismissed) return null;

  const steps = [
    {
      id: 'account',
      title: 'Create an account',
      description: 'You\'ve successfully joined zinbit by Zintlr.',
      icon: User,
      href: '/console/settings',
      isCompleted: true, // Always true for logged in user
    },
    {
      id: 'keys',
      title: 'Generate an API Key',
      description: 'Create a key to authenticate your requests.',
      icon: Key,
      href: '/console/keys',
      isCompleted: activeKeys.length > 0,
    },
    {
      id: 'first_call',
      title: 'Make your first request',
      description: 'Test your integration with the API explorer.',
      icon: Play,
      href: '/console/explorer',
      isCompleted: isFirstCallMade,
    },
    {
      id: 'webhooks',
      title: 'Set up a webhook',
      description: 'Receive real-time updates for data changes.',
      icon: Webhook,
      href: '/console/webhooks',
      isCompleted: webhooks.length > 0,
    },
    {
      id: 'team',
      title: 'Invite team members',
      description: 'Collaborate with your team on zinbit.',
      icon: Users,
      href: '/console/settings',
      isCompleted: teamMembers.length > 3, // Since mock data has 3 members
    },
  ];

  const completedCount = steps.filter(s => s.isCompleted).length;
  const progressPercentage = (completedCount / steps.length) * 100;

  return (
    <div className="mb-8 bg-[#111115] border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
      {/* Header */}
      <div 
        className="p-5 flex items-center justify-between cursor-pointer hover:bg-white/5 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-4">
          {/* Circular Progress */}
          <div className="relative w-12 h-12 flex items-center justify-center flex-shrink-0">
            <svg className="w-12 h-12 transform -rotate-90">
              <circle cx="24" cy="24" r="20" stroke="currentColor" strokeWidth="4" fill="transparent" className="text-white/10" />
              <circle 
                cx="24" cy="24" r="20" 
                stroke="currentColor" 
                strokeWidth="4" 
                fill="transparent" 
                strokeDasharray={125.6} 
                strokeDashoffset={125.6 - (125.6 * progressPercentage) / 100}
                className="text-teal transition-all duration-1000 ease-out" 
              />
            </svg>
            <span className="absolute text-[10px] font-bold text-white">
              {completedCount}/{steps.length}
            </span>
          </div>

          <div>
            <h2 className="text-lg font-bold text-white">Getting Started with zinbit</h2>
            <p className="text-sm text-white/60">Complete these steps to set up your workspace.</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button 
            onClick={(e) => {
              e.stopPropagation();
              dismissChecklist();
            }}
            className="p-2 text-white/40 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
            title="Dismiss checklist"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Body */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-white/5"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-1 p-4 bg-white/[0.02]">
              {steps.map((step) => {
                const Icon = step.icon;
                return (
                  <Link 
                    key={step.id} 
                    href={step.href}
                    className={cn(
                      "flex items-start gap-4 p-4 rounded-xl transition-all duration-300 group hover:bg-white/5",
                      step.isCompleted ? "opacity-60 hover:opacity-100" : ""
                    )}
                  >
                    <div className={cn(
                      "w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 border transition-colors duration-500",
                      step.isCompleted 
                        ? "bg-teal text-ink border-teal" 
                        : "border-white/20 text-white/40 group-hover:border-white/40 group-hover:text-white"
                    )}>
                      {step.isCompleted ? <Check className="w-3 h-3" strokeWidth={3} /> : <Icon className="w-3 h-3" />}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-1">
                        <h3 className={cn("text-sm font-bold transition-colors", step.isCompleted ? "text-white/60 line-through" : "text-white")}>
                          {step.title}
                        </h3>
                        {!step.isCompleted && <ChevronRight className="w-4 h-4 text-white/40 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />}
                      </div>
                      <p className="text-xs text-white/50 mt-1">{step.description}</p>
                    </div>
                  </Link>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
