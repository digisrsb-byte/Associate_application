import { ChevronLeft, ChevronRight } from 'lucide-react';

interface GstYearSelectorProps {
  years: string[];
  selectedYear: string;
  currentYear: string;
  onChange: (year: string) => void;
  onShiftYear: (delta: number) => void;
}

export function GstYearSelector({
  selectedYear,
  currentYear,
  onShiftYear,
}: GstYearSelectorProps) {
  const isCurrent = selectedYear === currentYear;

  return (
    <div className="bg-[var(--card)] rounded-2xl shadow-card px-3.5 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="shrink-0">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
          Financial Year
        </p>
        <p className="text-xs text-[var(--muted)] mt-0.5">
          Showing Apr–Mar months for the selected year
        </p>
      </div>

      <div className="flex items-center justify-end gap-2 min-w-0 flex-1">
        <button
          type="button"
          onClick={() => onShiftYear(-1)}
          className="shrink-0 p-2 rounded-full border border-[var(--line)] bg-[var(--card)] text-[var(--ink)] hover:bg-[var(--frost-100)] cursor-pointer shadow-sm"
          title="Previous year"
          aria-label="Previous financial year"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--navy-900)] text-white shadow-sm">
          <span className="font-mono text-xs font-bold whitespace-nowrap">{selectedYear}</span>
          {isCurrent && (
            <span className="px-1.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide bg-[var(--navy-900)] text-white">
              Current
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={() => onShiftYear(1)}
          className="shrink-0 p-2 rounded-full border border-[var(--line)] bg-[var(--card)] text-[var(--ink)] hover:bg-[var(--frost-100)] cursor-pointer shadow-sm"
          title="Next year"
          aria-label="Next financial year"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
