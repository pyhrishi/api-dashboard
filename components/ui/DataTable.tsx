'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from './Skeleton';
import { EmptyState } from './EmptyState';

export interface Column<T> {
  key: string;
  header: ReactNode;
  render?: (row: T) => ReactNode;
  /** Return a comparable value to make the column sortable. */
  sortValue?: (row: T) => string | number;
  align?: 'left' | 'right';
  className?: string;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  /** Rows per page; omit to disable pagination. */
  pageSize?: number;
  initialSort?: { key: string; dir: 'asc' | 'desc' };
  onRowClick?: (row: T) => void;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  className?: string;
}

/**
 * Typed table with client-side sort + pagination, skeleton loading, and a built-in
 * empty state. Scrolls horizontally inside its own container — never the page.
 */
export function DataTable<T>({
  columns, rows, rowKey, loading = false, pageSize, initialSort, onRowClick,
  emptyTitle = 'Nothing here yet', emptyDescription, emptyAction, className,
}: DataTableProps<T>) {
  const [sort, setSort] = useState(initialSort);
  const [page, setPage] = useState(0);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find(c => c.key === sort.key);
    if (!col?.sortValue) return rows;
    const sv = col.sortValue;
    return [...rows].sort((a, b) => {
      const av = sv(a), bv = sv(b);
      const cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv));
      return sort.dir === 'asc' ? cmp : -cmp;
    });
  }, [rows, sort, columns]);

  const pageCount = pageSize ? Math.max(1, Math.ceil(sorted.length / pageSize)) : 1;
  const visible = pageSize ? sorted.slice(page * pageSize, (page + 1) * pageSize) : sorted;

  const toggleSort = (col: Column<T>) => {
    if (!col.sortValue) return;
    setPage(0);
    setSort(prev => prev?.key === col.key ? { key: col.key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key: col.key, dir: 'desc' });
  };

  if (!loading && rows.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} className={className} />;
  }

  return (
    <div className={cn('bg-surface-2 border border-border rounded-2xl overflow-hidden', className)}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              {columns.map(col => (
                <th
                  key={col.key}
                  onClick={() => toggleSort(col)}
                  className={cn(
                    'px-4 py-3 text-[10px] font-black uppercase tracking-widest text-fg-muted whitespace-nowrap select-none',
                    col.align === 'right' ? 'text-right' : 'text-left',
                    col.sortValue && 'cursor-pointer hover:text-fg',
                    col.className
                  )}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.header}
                    {sort?.key === col.key && (
                      <ChevronDown className={cn('w-3 h-3 transition-transform', sort.dir === 'asc' && 'rotate-180')} />
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: pageSize ?? 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-border-subtle last:border-0">
                    {columns.map(col => <td key={col.key} className="px-4 py-3"><Skeleton className="h-4 w-3/4" /></td>)}
                  </tr>
                ))
              : visible.map(row => (
                  <tr
                    key={rowKey(row)}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    tabIndex={onRowClick ? 0 : undefined}
                    onKeyDown={onRowClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onRowClick(row); } } : undefined}
                    className={cn('border-b border-border-subtle last:border-0 transition-colors', onRowClick && 'cursor-pointer hover:bg-glass focus:outline-none focus-visible:bg-glass focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal/50')}
                  >
                    {columns.map(col => (
                      <td key={col.key} className={cn('px-4 py-3 text-fg', col.align === 'right' && 'text-right tabular-nums', col.className)}>
                        {col.render ? col.render(row) : String((row as Record<string, unknown>)[col.key] ?? '—')}
                      </td>
                    ))}
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
      {pageSize && pageCount > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-border text-xs text-fg-muted">
          <span>{page * pageSize + 1}–{Math.min((page + 1) * pageSize, sorted.length)} of {sorted.length}</span>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} aria-label="Previous page" className="p-1.5 rounded-lg hover:bg-glass disabled:opacity-40"><ChevronLeft className="w-4 h-4" /></button>
            <span className="px-2 font-semibold text-fg">{page + 1} / {pageCount}</span>
            <button onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))} disabled={page >= pageCount - 1} aria-label="Next page" className="p-1.5 rounded-lg hover:bg-glass disabled:opacity-40"><ChevronRight className="w-4 h-4" /></button>
          </div>
        </div>
      )}
    </div>
  );
}
