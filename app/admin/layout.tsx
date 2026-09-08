import { ToastProvider } from '@/components/admin/Toast';
import { AdminShell } from '@/components/admin/AdminShell';

/**
 * Admin section layout (merged into the console app). The console root layout already
 * provides <html>/<body>, fonts and the next-themes provider, so here we only add the
 * admin toast context and the operator shell (left nav + header).
 */
export default function AdminSectionLayout({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <AdminShell>{children}</AdminShell>
    </ToastProvider>
  );
}
