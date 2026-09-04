'use client';

import { useEffect, useCallback, useState } from 'react';
import { useTheme } from 'next-themes';
import { useStore } from '@/lib/store';
import { motion } from 'framer-motion';
import { Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';

type BinaryTheme = 'light' | 'dark';

const MODES: { value: BinaryTheme; icon: React.ReactNode; label: string }[] = [
  { value: 'light', icon: <Sun  className="w-3.5 h-3.5" />, label: 'Light' },
  { value: 'dark',  icon: <Moon className="w-3.5 h-3.5" />, label: 'Dark'  },
];

interface ThemeToggleProps {
  /** Compact: 2-option sliding pill. Expanded: labelled cards (for settings). */
  variant?: 'compact' | 'expanded';
  className?: string;
}

export function ThemeToggle({ variant = 'compact', className }: ThemeToggleProps) {
  const { setTheme } = useTheme();
  const { themeMode, setThemeMode } = useStore();
  const [mounted, setMounted] = useState(false);

  // Only two states now — anything else (legacy 'system') resolves to dark.
  const current: BinaryTheme = themeMode === 'light' ? 'light' : 'dark';

  const handleChange = useCallback((mode: BinaryTheme) => {
    setThemeMode(mode);
    setTheme(mode);
  }, [setTheme, setThemeMode]);

  // On mount: coerce any persisted 'system' (or unset) to an explicit choice.
  useEffect(() => {
    setMounted(true);
    const resolved: BinaryTheme = themeMode === 'light' ? 'light' : 'dark';
    if (themeMode !== resolved) setThemeMode(resolved);
    setTheme(resolved);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!mounted) {
    return (
      <div className={cn('opacity-0', className)}>
        <div className="w-full h-8" />
      </div>
    );
  }

  const activeIndex = current === 'light' ? 0 : 1;

  if (variant === 'expanded') {
    return (
      <div className={cn('flex flex-col gap-2', className)}>
        <p className="text-xs font-black uppercase tracking-widest text-fg-muted mb-1">Appearance</p>
        <div className="grid grid-cols-2 gap-2">
          {MODES.map(({ value, icon, label }) => {
            const active = current === value;
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
                <div className={cn('transition-transform duration-200', active && 'scale-110')}>{icon}</div>
                <span className="text-xs">{label}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // Compact — two-segment Light / Dark slider (sidebar footer).
  return (
    <div
      role="group"
      aria-label="Theme"
      className={cn(
        'relative flex items-center p-1 rounded-lg bg-glass border border-border',
        className
      )}
    >
      {/* Sliding indicator: exactly half the track (minus padding); slides one slot. */}
      <motion.div
        aria-hidden
        className="absolute top-1 bottom-1 left-1 w-[calc(50%-4px)] rounded-md bg-teal/10 border border-teal/30 shadow-[0_0_12px_rgba(70,189,198,0.2)]"
        animate={{ x: activeIndex === 0 ? '0%' : '100%' }}
        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
      />

      {MODES.map(({ value, icon, label }) => {
        const active = current === value;
        return (
          <button
            key={value}
            onClick={() => handleChange(value)}
            aria-label={`${label} mode`}
            aria-pressed={active}
            title={`${label} mode`}
            className={cn(
              'relative z-10 flex-1 flex items-center justify-center gap-1.5 h-7 rounded-md text-xs font-bold transition-colors',
              active ? 'text-teal' : 'text-fg-subtle hover:text-fg-muted'
            )}
          >
            <motion.span
              animate={{ rotate: value === 'light' && active ? 45 : 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 28 }}
              className="flex"
            >
              {icon}
            </motion.span>
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
