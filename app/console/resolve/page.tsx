'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Resolve was folded into the Enrichment Studio (the "Resolve a person" preset).
 * This route now redirects so existing links and the roadmap stay coherent.
 */
export default function ResolveRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/console/studio?preset=person'); }, [router]);
  return (
    <div className="max-w-[1200px] mx-auto flex items-center justify-center py-24">
      <div className="w-8 h-8 rounded-full border-2 border-teal border-t-transparent animate-spin" />
    </div>
  );
}
