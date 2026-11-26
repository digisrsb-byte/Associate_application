import { useMemo } from 'react';
import {
  ArrowRight,
  Building2,
  Download,
  Plus,
  Users,
} from 'lucide-react';
import type { ClientRecord, GstClientRecord } from '../../types/ledger.ts';
import {
  computeGstClientTotals,
  formatCurrency,
  formatPlainNumber,
} from '../../utils/ledgerUtils.ts';
import {
  computeGstMonthSummary,
  computeYearSummary,
} from '../../utils/summaryUtils.ts';

interface MobileDashboardProps {
  itClients: ClientRecord[];
  assessmentYears: string[];
  gstClients: GstClientRecord[];
  gstMonths: string[];
  onAddClient: () => void;
  onAddCompany: () => void;
  onExportCsv: () => void;
  onOpenItAllData: () => void;
  onOpenGstAllData: () => void;
}

function inr(n: number): string {
  return formatCurrency(Math.max(0, Math.round(n)));
}

export function MobileDashboard({
  itClients,
  assessmentYears,
  gstClients,
  gstMonths,
  onAddClient,
  onAddCompany,
  onExportCsv,
  onOpenItAllData,
  onOpenGstAllData,
}: MobileDashboardProps) {
  const itSummary = useMemo(
    () => computeYearSummary(itClients, assessmentYears),
    [itClients, assessmentYears]
  );
  const gstSummary = useMemo(
    () => computeGstMonthSummary(gstClients, gstMonths),
    [gstClients, gstMonths]
  );

  const gstCompanyWide = useMemo(() => {
    let totalReceived = 0;
    let totalOutstanding = 0;
    let totalBilled = 0;
    for (const c of gstClients) {
      const t = computeGstClientTotals(c);
      totalReceived += t.totalReceived;
      totalOutstanding += t.outstandingTotal;
      totalBilled += t.totalBilled;
    }
    return { totalReceived, totalOutstanding, totalBilled };
  }, [gstClients]);

  const totalReceived = itSummary.totalReceived + gstCompanyWide.totalReceived;
  const totalBilled = itSummary.totalBilled + gstCompanyWide.totalBilled;
  const totalOutstanding =
    itSummary.totalOutstanding + gstCompanyWide.totalOutstanding;
  const collectionPct =
    totalBilled > 0 ? Math.min(100, (totalReceived / totalBilled) * 100) : 0;

  const recentIt = useMemo(() => {
    return [...itSummary.rows]
      .filter((r) => r.entries > 0)
      .slice(-4)
      .reverse();
  }, [itSummary.rows]);

  const recentGst = useMemo(() => {
    return [...gstSummary.rows]
      .filter((r) => r.companies > 0)
      .slice(-4)
      .reverse();
  }, [gstSummary.rows]);

  return (
    <div className="space-y-4 pb-2">
      <header className="space-y-1">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">
          Overview
        </p>
        <h1 className="font-display text-[1.35rem] font-bold tracking-tight text-[var(--ink)] leading-snug">
          Business snapshot
        </h1>
        <p className="text-xs text-[var(--muted)] leading-relaxed">
          Live totals from your IT and GST ledgers. All amounts in ₹.
        </p>
      </header>

      <section className="grid grid-cols-2 gap-2.5">
        <KpiTile
          label="IT clients count"
          value={String(itClients.length)}
          hint={`${assessmentYears.length} AY · due ₹${formatPlainNumber(itSummary.totalOutstanding)}`}
          onClick={onOpenItAllData}
        />
        <KpiTile
          label="GST companies count"
          value={String(gstClients.length)}
          hint={`${gstMonths.length} months · due ₹${formatPlainNumber(gstCompanyWide.totalOutstanding)}`}
          onClick={onOpenGstAllData}
        />
      </section>

      <section className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4 shadow-sm space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
              Outstanding due
            </p>
            <p
              className={`mt-1 font-display text-2xl font-bold tabular-nums tracking-tight ${
                totalOutstanding > 0
                  ? 'text-[var(--navy-900)]'
                  : 'text-[var(--success)]'
              }`}
            >
              {inr(totalOutstanding)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
              Collections received
            </p>
            <p className="mt-1 font-mono text-sm font-bold tabular-nums text-[var(--success)]">
              {inr(totalReceived)}
            </p>
          </div>
        </div>
        <div>
          <div className="flex justify-between text-[11px] text-[var(--muted)] mb-1.5">
            <span>Collection rate</span>
            <span className="font-mono font-semibold text-[var(--ink)]">
              {collectionPct.toFixed(0)}%
            </span>
          </div>
          <div className="h-2 rounded-full bg-[var(--frost-100)] overflow-hidden">
            <div
              className="h-full rounded-full bg-[var(--navy-900)] transition-[width] duration-500"
              style={{ width: `${collectionPct}%` }}
            />
          </div>
          <p className="mt-2 text-[11px] text-[var(--muted)]">
            Billed {inr(totalBilled)} · IT due {inr(itSummary.totalOutstanding)} ·
            GST billed {inr(gstSummary.totalBilled)}
          </p>
        </div>
      </section>

      <section className="grid grid-cols-3 gap-2">
        <MiniStat label="IT billed" value={inr(itSummary.totalBilled)} />
        <MiniStat label="IT received" value={inr(itSummary.totalReceived)} />
        <MiniStat label="GST billed" value={inr(gstSummary.totalBilled)} />
      </section>

      <section className="rounded-2xl border border-[var(--line)] bg-[var(--card)] overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--line)] flex items-center justify-between">
          <h2 className="text-sm font-bold text-[var(--ink)]">Recent IT years</h2>
          <button
            type="button"
            onClick={onOpenItAllData}
            className="inline-flex min-h-9 items-center gap-1 text-[11px] font-bold text-[var(--navy-900)] cursor-pointer"
          >
            Open <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
        {recentIt.length === 0 ? (
          <EmptyBlock text="No IT filings yet." />
        ) : (
          <ul className="divide-y divide-[var(--line)] list-none m-0 p-0">
            {recentIt.map((row) => (
              <li key={row.year} className="px-4 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-mono text-xs font-bold text-[var(--ink)]">{row.year}</p>
                  <p className="text-[11px] text-[var(--muted)] mt-0.5">
                    {row.entries} filings · {row.uniqueClients} clients
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-mono text-xs font-semibold tabular-nums text-[var(--ink)]">
                    ₹{formatPlainNumber(row.received)}
                  </p>
                  {row.outstanding > 0 ? (
                    <p className="text-[11px] font-semibold text-[var(--navy-900)] tabular-nums mt-0.5">
                      Due ₹{formatPlainNumber(row.outstanding)}
                    </p>
                  ) : (
                    <p className="text-[11px] text-[var(--success)] mt-0.5">Clear</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-[var(--line)] bg-[var(--card)] overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--line)] flex items-center justify-between">
          <h2 className="text-sm font-bold text-[var(--ink)]">Recent GST months</h2>
          <button
            type="button"
            onClick={onOpenGstAllData}
            className="inline-flex min-h-9 items-center gap-1 text-[11px] font-bold text-[var(--navy-900)] cursor-pointer"
          >
            Open <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
        {recentGst.length === 0 ? (
          <EmptyBlock text="No GST filings yet." />
        ) : (
          <ul className="divide-y divide-[var(--line)] list-none m-0 p-0">
            {recentGst.map((row) => (
              <li key={row.month} className="px-4 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-mono text-xs font-bold text-[var(--ink)]">{row.month}</p>
                  <p className="text-[11px] text-[var(--muted)] mt-0.5">
                    {row.companies}{' '}
                    {row.companies === 1 ? 'company' : 'companies'}
                  </p>
                </div>
                <p className="font-mono text-xs font-semibold tabular-nums text-[var(--ink)] shrink-0">
                  ₹{formatPlainNumber(row.totalBilled)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="grid grid-cols-1 gap-2">
        <ActionButton icon={Users} label="Add IT client" onClick={onAddClient} primary />
        <ActionButton icon={Building2} label="Add GST company" onClick={onAddCompany} />
        <ActionButton icon={Download} label="Export CSV pack" onClick={onExportCsv} />
      </section>
    </div>
  );
}

function KpiTile({
  label,
  value,
  hint,
  onClick,
}: {
  label: string;
  value: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-3.5 text-left shadow-sm cursor-pointer hover:border-[var(--navy-900)]/30 min-h-[88px]"
    >
      <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--muted)]">
        {label}
      </p>
      <p className="mt-1.5 font-display text-2xl font-bold tabular-nums text-[var(--ink)] leading-none">
        {value}
      </p>
      <p className="mt-2 text-[11px] text-[var(--muted)]">{hint}</p>
    </button>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--frost-100)]/80 px-2.5 py-2.5">
      <p className="text-[9px] font-bold uppercase tracking-wide text-[var(--muted)] truncate">
        {label}
      </p>
      <p className="mt-1 font-mono text-[11px] font-bold tabular-nums text-[var(--ink)] truncate">
        {value}
      </p>
    </div>
  );
}

function EmptyBlock({ text }: { text: string }) {
  return <p className="px-4 py-6 text-sm text-[var(--muted)] text-center">{text}</p>;
}

function ActionButton({
  icon: Icon,
  label,
  onClick,
  primary = false,
}: {
  icon: typeof Plus;
  label: string;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-11 inline-flex items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold cursor-pointer ${
        primary
          ? 'bg-[var(--navy-900)] text-white'
          : 'bg-[var(--card)] text-[var(--ink)] border border-[var(--line)]'
      }`}
    >
      <Icon className="w-4 h-4" />
      {label}
    </button>
  );
}
