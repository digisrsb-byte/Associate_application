import { LayoutGrid, Table2 } from 'lucide-react';

interface MobileSheetUnavailableProps {
  title?: string;
  onUseMobileList: () => void;
}

/**
 * Shown when Sheet View is selected below the desktop breakpoint.
 * Spreadsheet sticky columns are not usable on phone widths.
 */
export function MobileSheetUnavailable({
  title = 'Spreadsheet layout is for desktop',
  onUseMobileList,
}: MobileSheetUnavailableProps) {
  return (
    <div className="bg-[var(--card)] rounded-2xl border border-white shadow-card px-5 py-10 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--frost-100)] text-[var(--navy-900)]">
        <Table2 className="h-6 w-6" aria-hidden />
      </div>
      <h2 className="font-display text-lg font-semibold text-[var(--ink)]">{title}</h2>
      <p className="mt-2 text-sm text-[var(--muted)] max-w-sm mx-auto leading-relaxed">
        The wide sticky Sheet View needs a larger screen. On this device, use the
        mobile list to browse records and edit filings.
      </p>
      <button
        type="button"
        onClick={onUseMobileList}
        className="mt-6 inline-flex min-h-11 items-center justify-center gap-2 px-5 py-2.5 text-sm font-bold text-white bg-[var(--navy-900)] hover:bg-[var(--navy-700)] rounded-xl cursor-pointer"
      >
        <LayoutGrid className="h-4 w-4" aria-hidden />
        <span>Use mobile list</span>
      </button>
    </div>
  );
}
