'use client';

/**
 * Phase-1 link interceptor — keeps the portal self-contained.
 *
 * The Phase-1 shells render the REAL console/admin pages, and those pages contain
 * hardcoded <Link href="/console/…"> / "/admin/…" / "/docs" targets that would navigate
 * OUT of the /phase-1 portal into the full product. This capture-phase click handler
 * rewrites any such in-app navigation to its /phase-1 equivalent, so "anything on the
 * Phase-1 portal goes from /phase-1 only". Every /console/* and /admin/* route has a
 * /phase-1 twin (see the re-exports), so the rewritten target always resolves.
 *
 * Deliberate exits (e.g. "Full product", "Sign out") opt out with `data-phase1-exit`.
 * External links, new-tab clicks, and modified clicks (⌘/ctrl/shift/alt) are left alone.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

function rewrite(href: string): string | null {
  if (!href.startsWith('/') || href.startsWith('/phase-1')) return null;
  if (href === '/console') return '/phase-1/console/home';
  if (href.startsWith('/console/')) return '/phase-1' + href;
  if (href === '/admin') return '/phase-1/admin/overview';
  if (href.startsWith('/admin/')) return '/phase-1' + href;
  if (href === '/docs') return '/phase-1/console/docs';
  return null;
}

export function Phase1LinkInterceptor() {
  const router = useRouter();
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      const anchor = target?.closest?.('a') as HTMLAnchorElement | null;
      if (!anchor) return;
      if (anchor.hasAttribute('data-phase1-exit') || anchor.target === '_blank') return;
      const href = anchor.getAttribute('href');
      if (!href) return;
      const dest = rewrite(href);
      if (!dest) return;
      e.preventDefault();
      e.stopPropagation();
      router.push(dest);
    };
    document.addEventListener('click', onClick, true); // capture — beats next/link's own handler
    return () => document.removeEventListener('click', onClick, true);
  }, [router]);
  return null;
}
