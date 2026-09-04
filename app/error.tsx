'use client';

import { useEffect } from 'react';
import { RefreshCw, AlertTriangle } from 'lucide-react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-screen bg-surface flex flex-col items-center justify-center p-6 text-center">
      <div className="w-20 h-20 bg-semantic-error/10 rounded-2xl flex items-center justify-center mb-8 border border-semantic-error/20 shadow-[0_0_30px_rgba(221,27,36,0.2)]">
        <AlertTriangle className="w-10 h-10 text-semantic-error" />
      </div>
      <h1 className="text-4xl md:text-5xl font-display font-black text-fg mb-4 tracking-tight">500 - Application Error</h1>
      <p className="text-fg-muted font-medium text-lg max-w-md mx-auto mb-10">
        An unexpected error occurred while rendering this page. Our team has been notified.
      </p>
      <button
        onClick={() => reset()}
        className="flex items-center justify-center gap-2 px-6 py-3 bg-semantic-error/10 hover:bg-semantic-error/20 border border-semantic-error/30 text-semantic-error font-bold rounded-xl transition-all mx-auto"
      >
        <RefreshCw className="w-4 h-4" /> Try again
      </button>
    </div>
  );
}
