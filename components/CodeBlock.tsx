'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CodeBlockProps {
  code: string;
  language?: string;
  className?: string;
  textClassName?: string;
}

export function CodeBlock({ code, language = 'json', className, textClassName = 'text-white/80' }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  return (
    <div className={cn("relative group rounded-lg overflow-hidden border border-white/10 bg-[#09090b] shadow-inner", className)}>
      <div className="absolute right-3 top-3 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={handleCopy}
          className="p-1.5 rounded-md bg-white/10 hover:bg-white/20 border border-white/10 text-white/70 hover:text-white transition-all backdrop-blur-sm shadow-sm"
          title="Copy code"
        >
          {copied ? <Check className="w-4 h-4 text-teal" /> : <Copy className="w-4 h-4" />}
        </button>
      </div>
      <div className="overflow-x-auto p-4 md:p-5">
        <pre className={cn("text-sm font-mono whitespace-pre-wrap break-all", textClassName)}>
          <code>{code}</code>
        </pre>
      </div>
    </div>
  );
}
