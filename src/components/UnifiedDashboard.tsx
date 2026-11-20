import { useMemo } from 'react';
import { ArrowUpRight, Plus, TrendingUp } from 'lucide-react';
import type { ClientRecord, GstClientRecord } from '../types/ledger.ts';
import { computeYearSummary, computeGstMonthSummary } from '../utils/summaryUtils.ts';
import { YearSummaryView } from './YearSummaryView.tsx';
import { GstMonthSummaryView } from './GstDashboardView.tsx';

interface UnifiedDashboardProps {
  itClients: ClientRecord[];
  assessmentYears: string[];
  gstClients: GstClientRecord[];
  gstMonths: string[];
  onAddClient: () => void;
  onAddCompany: () => void;
  onOpenItAllData: () => void;
  onOpenGstAllData: () => void;
}

export function UnifiedDashboardHero({
  itClients,
  assessmentYears,
  gstClients,
  gstMonths,
  onAddClient,
  onAddCompany,
  onOpenItAllData,
  onOpenGstAllData,
}: UnifiedDashboardProps) {
  const itSummary = useMemo(
    () => computeYearSummary(itClients, assessmentYears),
    [itClients, assessmentYears]
  );
  const gstSummary = useMemo(
    () => computeGstMonthSummary(gstClients, gstMonths),
    [gstClients, gstMonths]
  );

  const firstYear = itSummary.rows[0]?.year || 'AY 2019-20';
  const lastYear =
    itSummary.rows[itSummary.rows.length - 1]?.year || 'AY 2026-27';
  const firstMonth = gstSummary.rows[0]?.month || 'Apr 2026';
  const lastMonth =
    gstSummary.rows[gstSummary.rows.length - 1]?.month || 'Mar 2027';

  return (
    <section className="relative overflow-hidden rounded-2xl bg-grad-soft text-[var(--ink)] p-5 shadow-card">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-8 -top-10 w-44 h-44 rounded-full bg-white/35 blur-xs"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute right-20 -bottom-12 w-32 h-32 rounded-full bg-[var(--navy-900)]/45"
      />

      <div className="relative flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="space-y-1.5 max-w-2xl">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/75 text-[11px] font-semibold text-[var(--ink)]">
            <TrendingUp className="w-3 h-3 text-[var(--blue-500)]" />
            Overall · IT {firstYear}–{lastYear} · GST {firstMonth}–{lastMonth}
          </span>
          <h2 className="font-display text-lg sm:text-xl font-bold tracking-tight text-[var(--ink)]">
            TaxLedger Dashboard
          </h2>
          <p className="text-xs sm:text-sm text-[var(--ink)]">
            Single overall view for the full application · {itClients.length}{' '}
            {itClients.length === 1 ? 'IT client' : 'IT clients'} · {gstClients.length}{' '}
            {gstClients.length === 1 ? 'GST company' : 'GST companies'} · amounts in Rs.
          </p>
        </div>

        <div className="relative flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onAddClient}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-white bg-[var(--navy-900)] hover:bg-[var(--navy-700)] rounded-xl transition-colors shadow-sm cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Client</span>
          </button>
          <button
            type="button"
            onClick={onAddCompany}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-white bg-[var(--navy-900)] hover:bg-[var(--navy-700)] rounded-xl transition-colors shadow-sm cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add GST Company</span>
          </button>
          <button
            type="button"
            onClick={onOpenItAllData}
            className="inline-flex items-center gap-1 px-3.5 py-2.5 text-xs font-semibold text-[var(--ink)] bg-white/85 hover:bg-[var(--card)] rounded-xl transition-colors shadow-xs cursor-pointer whitespace-nowrap"
          >
            <span>IT Data</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onOpenGstAllData}
            className="inline-flex items-center gap-1 px-3.5 py-2.5 text-xs font-semibold text-[var(--ink)] bg-white/85 hover:bg-[var(--card)] rounded-xl transition-colors shadow-xs cursor-pointer whitespace-nowrap"
          >
            <span>GST Data</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </section>
  );
}

export function UnifiedDashboardBody({
  itClients,
  assessmentYears,
  gstClients,
  gstMonths,
  onOpenItAllData,
  onOpenGstAllData,
}: Omit<UnifiedDashboardProps, 'onAddClient' | 'onAddCompany'>) {
  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">
              IT Ledger
            </p>
            <h3 className="font-display text-base font-semibold text-[var(--ink)]">
              Salary / ITR overview
            </h3>
          </div>
          <button
            type="button"
            onClick={onOpenItAllData}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-[11px] font-semibold text-[var(--ink)] bg-[var(--card)] border border-[var(--line)] rounded-lg hover:bg-[var(--frost-100)] cursor-pointer"
          >
            Open IT data
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>
        <YearSummaryView
          clients={itClients}
          years={assessmentYears}
          onOpenAllData={onOpenItAllData}
        />
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">
              GST Ledger
            </p>
            <h3 className="font-display text-base font-semibold text-[var(--ink)]">
              Monthly filing overview
            </h3>
          </div>
          <button
            type="button"
            onClick={onOpenGstAllData}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-[11px] font-semibold text-[var(--ink)] bg-[var(--card)] border border-[var(--line)] rounded-lg hover:bg-[var(--frost-100)] cursor-pointer"
          >
            Open GST data
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>
        <GstMonthSummaryView
          clients={gstClients}
          months={gstMonths}
          onOpenAllData={onOpenGstAllData}
        />
      </section>
    </div>
  );
}
