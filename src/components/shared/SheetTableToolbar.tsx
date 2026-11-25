import type { ReactNode } from 'react';

/**
 * Shared frost header chrome for ContinuousSheetTable / GstSheetTable:
 * period navigator + trailing add control + hint line.
 */
export function SheetTableToolbar({
  periodNav,
  trailing,
  hint,
}: {
  periodNav: ReactNode;
  trailing: ReactNode;
  hint: string;
}) {
  return (
    <div className="px-4 py-3 border-b border-[var(--line)] bg-[var(--frost-100)] space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {periodNav}
        {trailing}
      </div>
      <p className="text-[11px] text-[var(--muted)]">{hint}</p>
    </div>
  );
}

/** Matching frost footer bar used under IT/GST sheet and simple tables. */
export function TableFooterBar({ children }: { children: ReactNode }) {
  return (
    <div className="px-4 py-3 border-t border-[var(--line)] bg-[var(--frost-100)]">
      {children}
    </div>
  );
}

/**
 * Simple list table header bar (IT SimpleClientTable / GST GstSimpleTable).
 * Children typically = TopPeriodNavigator with layout="split".
 */
export function SimpleTableToolbar({ children }: { children: ReactNode }) {
  return (
    <div className="px-4 py-3 border-b border-[var(--line)] bg-[var(--frost-100)] flex flex-wrap items-center justify-between gap-3">
      {children}
    </div>
  );
}
