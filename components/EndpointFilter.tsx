'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Check, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ENDPOINTS } from '@/lib/constants';

interface EndpointFilterProps {
  selected: string;
  onChange: (id: string) => void;
}

export function EndpointFilter({ selected, onChange }: EndpointFilterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  const selectedEndpoint = ENDPOINTS.find(e => e.id === selected) || ENDPOINTS[0];

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-3 bg-[#111115]/80 backdrop-blur-md border border-white/10 hover:border-teal/50 hover:bg-white/5 rounded-xl px-4 py-2 transition-all shadow-xl group"
      >
        <div 
          className="w-2.5 h-2.5 rounded-full" 
          style={{ backgroundColor: selectedEndpoint.color, boxShadow: `0 0 10px ${selectedEndpoint.color}80` }} 
        />
        <span className="text-sm font-bold text-white group-hover:text-teal transition-colors">
          {selectedEndpoint.label}
        </span>
        <ChevronDown className={cn("w-4 h-4 text-white/40 transition-transform duration-300", isOpen && "rotate-180 text-teal")} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="absolute right-0 top-full mt-2 w-64 bg-[#111115] border border-white/10 rounded-2xl shadow-[0_20px_40px_-10px_rgba(0,0,0,0.7)] overflow-hidden z-50 p-2"
          >
            <div className="mb-2 px-3 pt-2 pb-1 text-xs font-bold text-white/40 uppercase tracking-widest border-b border-white/5 flex items-center gap-2">
              <Activity className="w-3.5 h-3.5" /> Filter by Endpoint
            </div>
            <div className="space-y-1">
              {ENDPOINTS.map((ep) => (
                <button
                  key={ep.id}
                  onClick={() => {
                    onChange(ep.id);
                    setIsOpen(false);
                  }}
                  className={cn(
                    "w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left text-sm font-medium transition-all group",
                    selected === ep.id 
                      ? "bg-white/10 text-white" 
                      : "text-white/60 hover:bg-white/5 hover:text-white"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div 
                      className={cn("w-2 h-2 rounded-full transition-all", selected === ep.id ? "scale-110" : "scale-100")} 
                      style={{ 
                        backgroundColor: ep.color,
                        boxShadow: selected === ep.id ? `0 0 8px ${ep.color}80` : 'none'
                      }} 
                    />
                    <span className={selected === ep.id ? "font-bold" : ""}>{ep.label}</span>
                  </div>
                  {selected === ep.id && <Check className="w-4 h-4 text-teal" />}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
