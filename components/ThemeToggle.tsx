'use client';

import { useEffect, useCallback, useState } from 'react';
import { useTheme } from 'next-themes';
import { useStore } from '@/lib/store';
import { motion, AnimatePresence } from 'framer-motion';
import { Moon, Sun, Monitor } from 'lucide-react';
import { cn } from '@/lib/utils';

type ThemeMode = 'dark' | 'light' | 'system';

const MODES: { value: ThemeMode; icon: React.ReactNode; label: string }[] = [
  { value: 'dark',   icon: <Moon   className="w-3.5 h-3.5" />, label: 'Dark'   },
  { value: 'system', icon: <Monitor className="w-3.5 h-3.5" />, label: 'System' },
  { value: 'light',  icon: <Sun    className="w-3.5 h-3.5" />, label: 'Light'  },
];

interface ThemeToggleProps {
  /** Compact: 3-icon pill. Expanded: shows labels (for settings page) */
  variant?: 'compact' | 'expanded';
  className?: string;
}

export function ThemeToggle({ variant = 'compact', className }: ThemeToggleProps) {
  const { setTheme } = useTheme();
  const { themeMode, setThemeMode } = useStore();
  const [mounted, setMounted] = useState(false);

  const handleChange = useCallback((mode: ThemeMode) => {
    setThemeMode(mode);
    setTheme(mode);
  }, [setTheme, setThemeMode]);

  // Sync from persisted store on mount
  useEffect(() => {
    setMounted(true);
    if (themeMode) setTheme(themeMode);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!mounted) {
    return <div className={cn("opacity-0", className)}>
      <div className="w-full h-8" />
    </div>;
  }

  if (variant === 'expanded') {
    return (
      <div className={cn('flex flex-col gap-2', className)}>
        <p className="text-xs font-black uppercase tracking-widest text-fg-muted mb-1">Appearance</p>
        <div className="grid grid-cols-3 gap-2">
          {MODES.map(({ value, icon, label }) => {
            const active = themeMode === value;
            return (
              <button
                key={value}
                onClick={() => handleChange(value)}
                aria-pressed={active}
                className={cn(
                  'flex flex-col items-center gap-2 p-3 rounded-xl border transition-all duration-200 text-sm font-bold',
                  active
                    ? 'bg-teal/10 border-teal/40 text-teal shadow-[0_0_20px_rgba(70,189,198,0.15)]'
                    : 'bg-glass border-border text-fg-muted hover:border-border-strong hover:text-fg hover:bg-glass-2'
                )}
              >
                <div className={cn('transition-transform duration-200', active && 'scale-110')}>
                  {icon}
                </div>
                <span className="text-xs">{label}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // Compact pill — used in sidebar footer
  const activeIndex = MODES.findIndex(m => m.value === themeMode);

  return (
    <div
      role="group"
      aria-label="Theme toggle"
      className={cn(
        'relative flex items-center gap-0.5 p-1 rounded-lg bg-glass border border-border',
        className
      )}
    >
      {/* Sliding active indicator */}
      <AnimatePresence initial={false}>
        <motion.div
          key={themeMode}
          layoutId="theme-pill"
          className="absolute top-1 h-[calc(100%-8px)] rounded-md bg-teal/10 border border-teal/30 shadow-[0_0_12px_rgba(70,189,198,0.2)]"
          style={{ width: 'calc(33.33% - 2px)' }}
          animate={{ left: `calc(${activeIndex * 33.33}% + 2px)` }}
          transition={{ type: 'spring', stiffness: 380, damping: 32 }}
        />
      </AnimatePresence>

      {MODES.map(({ value, icon, label }) => {
        const active = themeMode === value;
        return (
          <button
            key={value}
            onClick={() => handleChange(value)}
            aria-label={`Switch to ${label} mode`}
            aria-pressed={active}
            title={`${label} mode`}
            className={cn(
              'relative z-10 flex items-center justify-center w-7 h-7 rounded-md transition-all duration-200',
              active ? 'text-teal' : 'text-fg-subtle hover:text-fg-muted'
            )}
          >
            <motion.div
              animate={{
                scale: active ? 1.15 : 1,
                rotate: value === 'light' && active ? 45 : 0,
              }}
              transition={{ type: 'spring', stiffness: 400, damping: 28 }}
            >
              {icon}
            </motion.div>
          </button>
        );
      })}
    </div>
  );
}
