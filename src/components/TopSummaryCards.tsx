import { ArrowUpRight, IndianRupee, Users, Wallet } from 'lucide-react';
import { formatCurrency } from '../utils/ledgerUtils.ts';

interface TopSummaryCardsProps {
  totalClients: number;
  yearsCount: number;
  totalReceived: number;
  outstandingTotal: number;
  totalBilled: number;
  totalEntries: number;
  entityPluralLabel?: string;
  entitySingularLabel?: string;
  periodPluralLabel?: string;
  periodSingularLabel?: string;
}

export function TopSummaryCards({
  totalClients,
  yearsCount,
  totalReceived,
  outstandingTotal,
  totalBilled,
  totalEntries,
  entityPluralLabel = 'Clients',
  entitySingularLabel = 'client',
  periodPluralLabel = 'Assessment Years',
  periodSingularLabel = 'Assessment Year',
}: TopSummaryCardsProps) {
  const collectionPct = totalBilled > 0 ? Math.min(100, (totalReceived / totalBilled) * 100) : 0;
  const outstandingPct = totalBilled > 0 ? Math.min(100, (outstandingTotal / totalBilled) * 100) : 0;

  return (
    <section
      aria-label="Key ledger totals"
      className="grid grid-cols-1 md:grid-cols-3 gap-3"
    >
      {/* Total Received — royal blue like Scheduly booking card */}
      <div className="relative overflow-hidden rounded-2xl bg-[var(--navy-900)] text-white p-3.5 shadow-card flex flex-col justify-between gap-3">
        <svg
          aria-hidden="true"
          viewBox="0 0 220 90"
          className="pointer-events-none absolute -right-4 -bottom-3 w-40 h-20 opacity-20"
        >
          <path
            d="M0 70 Q 55 15, 110 48 T 220 18"
            fill="none"
            stroke="white"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <path
            d="M0 84 Q 65 38, 125 62 T 220 38"
            fill="none"
            stroke="var(--gold)"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>

        <div className="relative flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-white/75">
              Total Received
            </p>
            <p className="mt-1 font-mono text-xl sm:text-[22px] font-bold tracking-tight tabular-nums text-white">
              {formatCurrency(totalReceived)}
            </p>
          </div>
          <div className="p-2 rounded-lg bg-white/15 text-[var(--gold)] shrink-0">
            <IndianRupee className="w-3.5 h-3.5" />
          </div>
        </div>

        <div className="relative space-y-1">
          <div className="flex items-center justify-between text-[11px] font-semibold text-white/75 tabular-nums">
            <span>{collectionPct.toFixed(1)}% collected</span>
            <span>Billed {formatCurrency(totalBilled)}</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-white/20 overflow-hidden">
            <div
              className="h-full rounded-full bg-[var(--gold)] transition-all duration-300"
              style={{ width: `${collectionPct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Outstanding — slightly deeper soft blue */}
      <div className="relative overflow-hidden rounded-2xl bg-grad-soft text-[var(--ink)] p-3.5 shadow-card flex flex-col justify-between gap-3 ring-1 ring-[var(--navy-900)]/10">
        <svg
          aria-hidden="true"
          viewBox="0 0 220 90"
          className="pointer-events-none absolute -right-4 -bottom-3 w-40 h-20 opacity-35"
        >
          <path
            d="M0 64 Q 50 22, 110 52 T 220 20"
            fill="none"
            stroke="var(--navy-900)"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <path
            d="M0 80 Q 60 44, 125 66 T 220 42"
            fill="none"
            stroke="var(--navy-700)"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>

        <div className="relative flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--navy-900)]/70">
              Outstanding Total
            </p>
            <p className="mt-1 font-mono text-xl sm:text-[22px] font-bold tracking-tight tabular-nums text-[var(--navy-900)]">
              {formatCurrency(outstandingTotal)}
            </p>
          </div>
          <div className="p-2 rounded-lg bg-[var(--navy-900)]/10 text-[var(--navy-900)] shrink-0">
            <Wallet className="w-3.5 h-3.5" />
          </div>
        </div>

        <div className="relative space-y-1">
          <div className="flex items-center justify-between text-[11px] font-medium text-[var(--navy-900)]/70 tabular-nums">
            <span>{outstandingPct.toFixed(1)}% pending</span>
            <span>{outstandingTotal > 0 ? 'Balance due' : 'All cleared'}</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-[var(--navy-900)]/15 overflow-hidden">
            <div
              className="h-full rounded-full bg-[var(--navy-900)] transition-all duration-300"
              style={{ width: `${outstandingPct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Third KPI — white + blue progress */}
      <div className="relative overflow-hidden rounded-2xl bg-[var(--card)] text-[var(--ink)] p-3.5 shadow-card flex flex-col justify-between gap-3">
        <div className="relative flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
              Total {entityPluralLabel}
            </p>
            <div className="mt-1 flex items-baseline gap-2">
              <p className="font-mono text-xl sm:text-[22px] font-bold tracking-tight tabular-nums text-[var(--ink)]">
                {totalClients}
              </p>
              <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-[var(--navy-900)] bg-[var(--blue-15)] px-2 py-0.5 rounded-full">
                <ArrowUpRight className="w-3 h-3" />
                {totalEntries} {totalEntries === 1 ? 'filing' : 'filings'}
              </span>
            </div>
          </div>
          <div className="p-2 rounded-lg bg-[var(--frost-100)] text-[var(--navy-900)] shrink-0">
            <Users className="w-3.5 h-3.5" />
          </div>
        </div>

        <div className="relative space-y-1">
          <div className="flex items-center justify-between text-[11px] font-medium text-[var(--muted)] tabular-nums">
            <span>
              {yearsCount} {yearsCount === 1 ? periodSingularLabel : periodPluralLabel}
            </span>
            <span>
              {totalClients > 0 ? (totalEntries / totalClients).toFixed(1) : '0.0'} avg / {entitySingularLabel}
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-[var(--frost-100)] overflow-hidden flex">
            <div
              className="h-full bg-[var(--blue-500)] rounded-full transition-all duration-300"
              style={{ width: `${totalClients > 0 ? Math.min(100, (totalEntries / Math.max(1, totalClients * Math.max(1, yearsCount))) * 100 + 25) : 0}%` }}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
