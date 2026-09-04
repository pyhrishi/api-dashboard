import React from 'react';
import { Hexagon, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LogoProps {
  className?: string;
  variant?: 'light' | 'dark' | 'auto';
  collapsed?: boolean;
}

export function Logo({ className, variant = 'auto', collapsed = false }: LogoProps) {
  let textColor = 'text-ink dark:text-fg';
  let subtextColor = 'text-teal-deep dark:text-teal';
  let iconColor = 'text-ink dark:text-fg';
  let glowClasses = 'opacity-0 dark:group-hover:opacity-100';

  if (variant === 'light') {
    textColor = 'text-ink';
    subtextColor = 'text-teal-deep';
    iconColor = 'text-ink';
    glowClasses = 'hidden';
  } else if (variant === 'dark') {
    textColor = 'text-fg';
    subtextColor = 'text-teal';
    iconColor = 'text-fg';
    glowClasses = 'opacity-0 group-hover:opacity-100';
  }

  return (
    <div className={cn("flex items-center gap-3 select-none group", className)}>
      <div className="relative flex items-center justify-center">
        <Hexagon className={cn(
          "w-8 h-8 transition-transform duration-500 group-hover:rotate-90",
          iconColor
        )} strokeWidth={1.5} />
        <Zap className={cn(
          "w-4 h-4 absolute transition-all duration-500",
          subtextColor
        )} strokeWidth={3} fill="currentColor" />
        
        {/* Glow effect */}
        <div className={cn("absolute inset-0 bg-teal/20 blur-md rounded-full -z-10 transition-opacity duration-500", glowClasses)} />
      </div>

      {!collapsed && (
        <div className="flex flex-col">
          <span className={cn("font-display font-black text-xl leading-none tracking-tight", textColor)}>
            zinbit
          </span>
          <span className={cn("text-[9px] font-bold uppercase tracking-[0.2em] leading-tight ml-[1px]", subtextColor)}>
            by Zintlr
          </span>
        </div>
      )}
    </div>
  );
}
