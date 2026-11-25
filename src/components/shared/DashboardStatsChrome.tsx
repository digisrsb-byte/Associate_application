import type { ReactNode } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

/** Shared “Show Data / See more” toolbar for IT & GST dashboard charts. */
export function DashboardStatsToolbar({
  showStatsData,
  onToggleStats,
  onSeeMore,
}: {
  showStatsData: boolean;
  onToggleStats: () => void;
  onSeeMore: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onToggleStats}
        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[var(--frost-100)] hover:bg-[var(--sky-200)] text-xs font-semibold text-[var(--ink)] transition-colors cursor-pointer whitespace-nowrap"
      >
        <span>{showStatsData ? 'Hide Data' : 'Show Data'}</span>
        {showStatsData ? (
          <ChevronUp className="w-3.5 h-3.5" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5" />
        )}
      </button>
      <button
        type="button"
        onClick={onSeeMore}
        className="text-xs font-semibold text-[var(--muted)] hover:text-[var(--ink)] transition-colors cursor-pointer whitespace-nowrap"
      >
        See more
      </button>
    </div>
  );
}

export type LegendItem = {
  swatchClass: string;
  label: string;
  valueNode: ReactNode;
};

/** Clickable left metric panel + legend rows (domain labels/values from caller). */
export function DashboardMetricPanel({
  title,
  primaryValue,
  legend,
  onToggle,
  titleAttr,
}: {
  title: string;
  primaryValue: string;
  legend: LegendItem[];
  onToggle: () => void;
  titleAttr: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="text-left space-y-4 rounded-xl p-2 -m-2 hover:bg-[var(--frost-100)] transition-colors cursor-pointer"
      title={titleAttr}
    >
      <div>
        <p className="text-xs text-[var(--muted)]">{title}</p>
        <p className="mt-0.5 font-mono text-2xl font-bold tracking-tight text-[var(--ink)] tabular-nums">
          ₹{primaryValue}
        </p>
      </div>

      <div className="space-y-2 text-xs">
        {legend.map((item) => (
          <div
            key={item.label}
            className="flex items-center justify-between gap-2"
          >
            <span className="inline-flex items-center gap-2 text-[var(--muted)] font-medium">
              <span className={`w-2.5 h-2.5 rounded-full ${item.swatchClass}`} />
              {item.label}
            </span>
            {item.valueNode}
          </div>
        ))}
      </div>
    </button>
  );
}
