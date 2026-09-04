import Link from 'next/link';
import { AlertTriangle, Home } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#09090b] flex flex-col items-center justify-center p-6 text-center">
      <div className="w-20 h-20 bg-teal/10 rounded-2xl flex items-center justify-center mb-8 border border-teal/20 shadow-[0_0_30px_rgba(70,189,198,0.2)]">
        <AlertTriangle className="w-10 h-10 text-teal" />
      </div>
      <h1 className="text-4xl md:text-5xl font-display font-black text-white mb-4 tracking-tight">404 - Not Found</h1>
      <p className="text-white/60 font-medium text-lg max-w-md mx-auto mb-10">
        The endpoint or page you&apos;re looking for doesn&apos;t exist, has been moved, or you don&apos;t have access to it.
      </p>
      <Link href="/console" className="flex items-center justify-center gap-2 px-6 py-3 bg-teal hover:bg-teal-light text-white font-bold rounded-xl transition-all shadow-[0_0_20px_rgba(70,189,198,0.3)]">
        <Home className="w-4 h-4" /> Return to Dashboard
      </Link>
    </div>
  );
}
