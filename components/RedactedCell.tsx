'use client';
import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

export function RedactedCell({ payload }: { payload: string }) {
  const [revealed, setRevealed] = useState(false);
  
  if (!revealed) {
    return (
      <button 
        onClick={() => setRevealed(true)}
        className="flex items-center gap-2 bg-neutral-200 text-neutral-700 px-3 py-1.5 rounded-md text-[11px] font-extrabold hover:bg-neutral-300 transition-colors shadow-sm tracking-wide"
      >
        <EyeOff className="w-3.5 h-3.5" />
        &lt;REDACTED_FOR_PRIVACY&gt; - Click to Reveal
      </button>
    );
  }
  
  return (
    <div className="flex flex-col gap-2 min-w-[250px]">
      <pre className="text-[11px] font-mono bg-[#14131E] text-neutral-300 p-3 rounded-lg w-full overflow-x-auto whitespace-pre-wrap max-h-32 border border-neutral-800 shadow-inner">
        {payload}
      </pre>
      <button 
        onClick={() => setRevealed(false)}
        className="flex items-center gap-1.5 text-neutral-500 hover:text-neutral-800 text-xs font-bold w-fit bg-neutral-100 px-2.5 py-1 rounded transition-colors"
      >
        <Eye className="w-3.5 h-3.5" /> Hide Payload
      </button>
    </div>
  );
}
