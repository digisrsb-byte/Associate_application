import { useMemo, useState } from 'react';
import { ArrowUpRight, Plus, TrendingUp, X } from 'lucide-react';
import type { GstClientRecord } from '../types/ledger.ts';
import {
  computeGstFilingTotal,
  formatPlainNumber,
  getGstFinancialYearLabel,
} from '../utils/ledgerUtils.ts';
import {
  GST_FY_RECD_SCOPE_NOTE,
  gstFyUnallocatedSeparateNote,
} from '../utils/gstCopy.ts';
import { computeGstMonthSummary } from '../utils/summaryUtils.ts';
import {
  DashboardMetricPanel,
  DashboardStatsToolbar,
} from './shared/DashboardStatsChrome.tsx';
import { MultiSeriesLineChart } from './shared/MultiSeriesLineChart.tsx';

interface GstDashboardHeroBannerProps {
  clients: GstClientRecord[];
  months: string[];
  selectedFy?: string;
  onAddCompany: () => void;
  onOpenAllData: () => void;
}

export function GstDashboardHeroBanner({
  clients,
  months,
  selectedFy,
  onAddCompany,
  onOpenAllData,
}: GstDashboardHeroBannerProps) {
  const summary = useMemo(() => computeGstMonthSummary(clients, months), [clients, months]);
  const firstMonth = summary.rows[0]?.month || months[0] || 'Apr 2026';
  const lastMonth =
    summary.rows[summary.rows.length - 1]?.month ||
    months[months.length - 1] ||
    'Mar 2027';
  const fyLabel =
    selectedFy || getGstFinancialYearLabel(firstMonth) || 'Selected FY';

  return (
    <section className="relative overflow-hidden rounded-2xl bg-grad-soft text-[var(--ink)] p-5 shadow-card flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-8 -top-10 w-44 h-44 rounded-full bg-white/35 blur-xs"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute right-20 -bottom-12 w-32 h-32 rounded-full bg-[var(--navy-900)]/45"
      />

      <div className="relative space-y-1.5 max-w-xl">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/75 text-[11px] font-semibold text-[var(--ink)]">
          <TrendingUp className="w-3 h-3 text-[var(--blue-500)]" />
          <span className="font-mono">{fyLabel}</span>
          <span aria-hidden="true">·</span>
          {firstMonth} – {lastMonth}
        </span>
        <h2 className="font-display text-lg sm:text-xl font-bold tracking-tight text-[var(--ink)]">
          GST Monthly Filing Dashboard
        </h2>
        <p className="text-xs sm:text-sm text-[var(--ink)]">
          {clients.length} GST {clients.length === 1 ? 'company' : 'companies'} · {summary.totalEntries}{' '}
          {summary.totalEntries === 1 ? 'filing' : 'filings'} in {fyLabel}.
        </p>
      </div>

      <div className="relative flex flex-wrap items-center gap-2 shrink-0">
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
          onClick={onOpenAllData}
          className="inline-flex items-center gap-1 px-3.5 py-2.5 text-xs font-semibold text-[var(--ink)] bg-white/85 hover:bg-[var(--card)] rounded-xl transition-colors shadow-xs cursor-pointer whitespace-nowrap"
        >
          <span>All Data</span>
          <ArrowUpRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </section>
  );
}

interface GstMonthSummaryViewProps {
  clients: GstClientRecord[];
  months: string[];
  selectedFy?: string;
  onOpenAllData: () => void;
}

function shortMonthLabel(m: string): string {
  const parts = m.trim().split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0].slice(0, 3)} ${parts[1].slice(2)}`;
  }
  return m;
}

export function GstMonthSummaryView({
  clients,
  months,
  selectedFy,
  onOpenAllData,
}: GstMonthSummaryViewProps) {
  const summary = useMemo(() => computeGstMonthSummary(clients, months), [clients, months]);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [showStatsData, setShowStatsData] = useState(false);

  const firstMonth = summary.rows[0]?.month || months[0] || 'Apr 2026';
  const lastMonth =
    summary.rows[summary.rows.length - 1]?.month ||
    months[months.length - 1] ||
    'Mar 2027';
  const fyLabel =
    selectedFy || getGstFinancialYearLabel(firstMonth) || 'Selected FY';

  const maxMonthTotal = Math.max(1, ...summary.rows.map((r) => r.totalBilled));

  const activeRow = useMemo(
    () => (selectedMonth ? summary.rows.find((r) => r.month === selectedMonth) || null : null),
    [selectedMonth, summary.rows]
  );

  const displayTotal = activeRow ? activeRow.totalBilled : summary.totalBilled;
  const displayFees = activeRow ? activeRow.fees : summary.totalFees;
  const displayInterest = activeRow ? activeRow.interest : summary.totalInterest;
  const displayTax = activeRow ? activeRow.tax : summary.totalTax;

  const selectedMonthFilings = useMemo(() => {
    if (!selectedMonth) return [];
    const list: {
      company: GstClientRecord;
      fees: number;
      interest: number;
      tax: number;
      total: number;
    }[] = [];
    for (const company of clients) {
      const f = company.filings?.[selectedMonth];
      if (!f) continue;
      const fees = Math.max(0, Number(f.fees) || 0);
      const interest = Math.max(0, Number(f.interest) || 0);
      const tax = Math.max(0, Number(f.tax) || 0);
      const total =
        typeof f.total === 'number' && Number.isFinite(f.total)
          ? Math.max(0, f.total)
          : computeGstFilingTotal(fees, interest, tax);
      list.push({ company, fees, interest, tax, total });
    }
    return list;
  }, [clients, selectedMonth]);

  const handleBarClick = (m: string) => {
    if (selectedMonth === m) {
      setSelectedMonth(null);
      setShowStatsData(false);
    } else {
      setSelectedMonth(m);
      setShowStatsData(true);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-4 items-stretch">
        {/* Left: Interactive Monthly Statistics */}
        <section className="bg-[var(--card)] rounded-2xl p-5 shadow-card flex flex-col justify-between gap-4 min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-display text-sm sm:text-base font-semibold text-[var(--ink)]">
                  Monthly Filing Statistics
                </h3>
                {selectedMonth && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--frost-100)] text-[var(--blue-500)] text-[11px] font-semibold font-mono">
                    {selectedMonth}
                    <button
                      type="button"
                      onClick={() => setSelectedMonth(null)}
                      aria-label="Clear month filter"
                      className="hover:text-[var(--ink)] cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}
              </div>
              <p className="text-xs text-[var(--muted)]">
                Click any month on the line chart or &ldquo;Show Data&rdquo; to inspect Fees,
                Interest, Tax &amp; Total
              </p>
            </div>

            <DashboardStatsToolbar
              showStatsData={showStatsData}
              onToggleStats={() => setShowStatsData((p) => !p)}
              onSeeMore={onOpenAllData}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-[200px_minmax(0,1fr)] gap-5 items-end">
            <DashboardMetricPanel
              title={activeRow ? `${activeRow.month} Total` : 'Grand Total'}
              primaryValue={formatPlainNumber(displayTotal)}
              onToggle={() => setShowStatsData((p) => !p)}
              titleAttr="Click to show or hide GST monthly breakdown"
              legend={[
                {
                  swatchClass:
                    'bg-[var(--navy-900)] border border-[var(--navy-900)]/20',
                  label: 'Fees',
                  valueNode: (
                    <span className="font-mono font-semibold text-[var(--ink)] tabular-nums">
                      ₹{formatPlainNumber(displayFees)}
                    </span>
                  ),
                },
                {
                  swatchClass: 'bg-[var(--navy-900)]',
                  label: 'Interest',
                  valueNode: (
                    <span className="font-mono font-semibold text-[var(--muted)] tabular-nums">
                      ₹{formatPlainNumber(displayInterest)}
                    </span>
                  ),
                },
                {
                  swatchClass: 'bg-[var(--ice)]',
                  label: 'Tax',
                  valueNode: (
                    <span className="font-mono font-semibold text-[var(--blue-500)] tabular-nums">
                      ₹{formatPlainNumber(displayTax)}
                    </span>
                  ),
                },
              ]}
            />

            <div className="w-full min-w-0 pt-1">
              <MultiSeriesLineChart
                keys={summary.rows.map((r) => r.month)}
                labels={summary.rows.map(
                  (r) => shortMonthLabel(r.month).split(' ')[0]
                )}
                maxValue={maxMonthTotal}
                selectedKey={selectedMonth}
                onSelect={handleBarClick}
                ariaLabel="Monthly fees, interest and tax line chart"
                labelFontSize="9px"
                getHitTitle={(i) => {
                  const row = summary.rows[i];
                  return `${row.month} — Fees ₹${formatPlainNumber(row.fees)} | Int ₹${formatPlainNumber(row.interest)} | Tax ₹${formatPlainNumber(row.tax)} | Total ₹${formatPlainNumber(row.totalBilled)}`;
                }}
                series={[
                  {
                    values: summary.rows.map((r) => r.tax),
                    stroke: 'var(--ice)',
                    strokeWidth: 2.5,
                    circleFill: 'var(--sky-200)',
                  },
                  {
                    values: summary.rows.map((r) => r.fees),
                    stroke: 'var(--ice)',
                    strokeWidth: 2.5,
                    circleFill: 'var(--ice)',
                  },
                  {
                    values: summary.rows.map((r) => r.interest),
                    stroke: 'var(--ink)',
                    strokeWidth: 2,
                    circleFill: (sel) =>
                      sel ? 'var(--navy-900)' : 'var(--card)',
                    circleStrokeWidth: 1.5,
                  },
                ]}
              />
            </div>
          </div>

          {showStatsData && (
            <div className="border-t border-[var(--line)] pt-3.5 space-y-2.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setSelectedMonth(null)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer ${
                    selectedMonth === null
                      ? 'bg-[var(--navy-900)] text-white'
                      : 'bg-[var(--frost-100)] text-[var(--muted)] hover:text-[var(--ink)]'
                  }`}
                >
                  All Months ({summary.totalEntries})
                </button>
                {summary.rows.map((row) => (
                  <button
                    key={row.month}
                    type="button"
                    onClick={() => setSelectedMonth(row.month)}
                    className={`px-2 py-1 rounded-lg font-mono text-[11px] font-medium transition-colors cursor-pointer ${
                      selectedMonth === row.month
                        ? 'bg-[var(--navy-900)] text-white'
                        : 'bg-[var(--frost-100)] text-[var(--muted)] hover:text-[var(--ink)]'
                    }`}
                  >
                    {shortMonthLabel(row.month)} ({row.companies})
                  </button>
                ))}
              </div>

              {selectedMonth ? (
                selectedMonthFilings.length === 0 ? (
                  <div className="rounded-xl bg-[var(--frost-100)] px-4 py-4 text-center text-xs text-[var(--muted)]">
                    No GST filings recorded for {selectedMonth}.
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-[var(--line)]">
                    <table className="w-full border-collapse text-left text-xs">
                      <thead>
                        <tr className="bg-[var(--navy-900)] text-white text-[11px] border-b border-[var(--line)]">
                          <th className="px-3 py-2 font-semibold whitespace-nowrap">Company Name</th>
                          <th className="px-2.5 py-2 font-semibold whitespace-nowrap">User ID</th>
                          <th className="px-2.5 py-2 font-semibold whitespace-nowrap">Ref No</th>
                          <th className="px-2 py-2 font-semibold text-right whitespace-nowrap">Fees</th>
                          <th className="px-2 py-2 font-semibold text-right whitespace-nowrap">Interest</th>
                          <th className="px-2 py-2 font-semibold text-right whitespace-nowrap">Tax</th>
                          <th className="px-3 py-2 font-semibold text-right whitespace-nowrap">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--line)]">
                        {selectedMonthFilings.map(({ company, fees, interest, tax, total }) => (
                          <tr key={company.id} className="hover:bg-[var(--frost-100)]">
                            <td className="px-3 py-2 font-medium text-[var(--ink)] whitespace-nowrap">
                              {company.companyName}
                            </td>
                            <td className="px-2.5 py-2 font-mono text-[var(--muted)] whitespace-nowrap">
                              {company.userId}
                            </td>
                            <td className="px-2.5 py-2 font-mono text-[var(--muted)] whitespace-nowrap">
                              {company.referenceNumber || '—'}
                            </td>
                            <td className="px-2 py-2 text-right font-mono text-[var(--ink)] tabular-nums whitespace-nowrap">
                              ₹{formatPlainNumber(fees)}
                            </td>
                            <td className="px-2 py-2 text-right font-mono text-[var(--muted)] tabular-nums whitespace-nowrap">
                              ₹{formatPlainNumber(interest)}
                            </td>
                            <td className="px-2 py-2 text-right font-mono text-[var(--muted)] tabular-nums whitespace-nowrap">
                              ₹{formatPlainNumber(tax)}
                            </td>
                            <td className="px-3 py-2 text-right font-mono font-semibold text-[var(--ink)] tabular-nums whitespace-nowrap">
                              ₹{formatPlainNumber(total)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              ) : (
                <div className="overflow-x-auto rounded-xl border border-[var(--line)]">
                  <table className="w-full border-collapse text-left text-xs">
                    <thead>
                      <tr className="bg-[var(--navy-900)] text-white text-[11px] border-b border-[var(--line)]">
                        <th className="px-3 py-2 font-semibold whitespace-nowrap">Month</th>
                        <th className="px-2 py-2 font-semibold text-right whitespace-nowrap">Companies</th>
                        <th className="px-2 py-2 font-semibold text-right whitespace-nowrap">Fees</th>
                        <th className="px-2 py-2 font-semibold text-right whitespace-nowrap">Interest</th>
                        <th className="px-2 py-2 font-semibold text-right whitespace-nowrap">Tax</th>
                        <th className="px-3 py-2 font-semibold text-right whitespace-nowrap">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--line)]">
                      {summary.rows.map((row) => (
                        <tr
                          key={row.month}
                          onClick={() => setSelectedMonth(row.month)}
                          className="hover:bg-[var(--frost-100)]/50 cursor-pointer transition-colors"
                        >
                          <td className="px-3 py-1.5 font-mono font-medium text-[var(--ink)] whitespace-nowrap">
                            {row.month}
                          </td>
                          <td className="px-2 py-1.5 text-right font-mono text-[var(--muted)] tabular-nums">
                            {row.companies}
                          </td>
                          <td className="px-2 py-1.5 text-right font-mono text-[var(--ink)] tabular-nums whitespace-nowrap">
                            ₹{formatPlainNumber(row.fees)}
                          </td>
                          <td className="px-2 py-1.5 text-right font-mono text-[var(--muted)] tabular-nums whitespace-nowrap">
                            ₹{formatPlainNumber(row.interest)}
                          </td>
                          <td className="px-2 py-1.5 text-right font-mono text-[var(--muted)] tabular-nums whitespace-nowrap">
                            ₹{formatPlainNumber(row.tax)}
                          </td>
                          <td className="px-3 py-1.5 text-right font-mono font-semibold text-[var(--ink)] tabular-nums whitespace-nowrap">
                            ₹{formatPlainNumber(row.totalBilled)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Right: GST Totals Summary */}
        <section className="bg-[var(--card)] rounded-2xl p-5 shadow-card flex flex-col justify-between gap-3">
          <div>
            <h3 className="font-display text-sm font-semibold text-[var(--ink)]">
              GST Totals Summary
            </h3>
            <p className="text-xs text-[var(--muted)] mt-0.5">
              {fyLabel} · Fees + Interest + Tax = Total
            </p>
          </div>

          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-[var(--frost-100)]">
              <span className="text-[var(--muted)]">Fees</span>
              <span className="font-mono font-semibold text-[var(--ink)] tabular-nums">
                ₹{formatPlainNumber(summary.totalFees)}
              </span>
            </div>
            <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-[var(--frost-100)]">
              <span className="text-[var(--muted)]">Interest</span>
              <span className="font-mono font-semibold text-[var(--ink)] tabular-nums">
                ₹{formatPlainNumber(summary.totalInterest)}
              </span>
            </div>
            <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-[var(--frost-100)]">
              <span className="text-[var(--muted)]">Tax</span>
              <span className="font-mono font-semibold text-[var(--ink)] tabular-nums">
                ₹{formatPlainNumber(summary.totalTax)}
              </span>
            </div>
            <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-[var(--frost-100)]">
              <span className="font-semibold text-[var(--ink)]">Total</span>
              <span className="font-mono font-bold text-[var(--ink)] tabular-nums">
                ₹{formatPlainNumber(summary.totalBilled)}
              </span>
            </div>
          </div>

          <div className="pt-2 border-t border-[var(--line)] space-y-1.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-[var(--muted)]">FY Total Recd</span>
              <span className="font-mono font-semibold text-[var(--success)] tabular-nums">
                ₹{formatPlainNumber(summary.totalReceived)}
              </span>
            </div>
            <p className="text-[10px] text-[var(--muted)] leading-snug">
              {GST_FY_RECD_SCOPE_NOTE}
            </p>
            {summary.unallocatedReceived > 0 ? (
              <p className="text-[10px] text-[var(--muted)] leading-snug">
                {gstFyUnallocatedSeparateNote(
                  `₹${formatPlainNumber(summary.unallocatedReceived)}`
                )}
              </p>
            ) : null}
            <div className="flex items-center justify-between">
              <span className="text-[var(--muted)]">FY Outstanding</span>
              <span
                className={`font-mono font-semibold tabular-nums ${
                  summary.totalOutstanding > 0 ? 'text-[var(--blue-500)]' : 'text-[var(--ink)]'
                }`}
              >
                ₹{formatPlainNumber(summary.totalOutstanding)}
              </span>
            </div>
          </div>
        </section>
      </div>

      {/* Full-Width Month-wise Summary Table */}
      <section className="w-full bg-[var(--card)] rounded-2xl shadow-card overflow-hidden">
        <div className="px-4 sm:px-5 py-3.5 border-b border-[var(--line)] flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-sm sm:text-base font-semibold text-[var(--ink)]">
              GST Monthly Filing - Month-wise Summary ({firstMonth} to {lastMonth})
            </h2>
            <p className="text-xs text-[var(--muted)] mt-0.5">
              Month-wise breakdown of Fees, Interest, Tax, and Total.
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenAllData}
            className="text-xs font-semibold text-[var(--muted)] hover:text-[var(--ink)] transition-colors cursor-pointer whitespace-nowrap"
          >
            See all
          </button>
        </div>

        <div className="overflow-x-auto ledger-scroll">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="bg-[var(--navy-900)] text-white text-[11px] sm:text-xs">
                <th className="px-4 py-2.5 font-medium whitespace-nowrap">Month</th>
                <th className="px-3 py-2.5 font-medium text-right whitespace-nowrap">Companies</th>
                <th className="px-3 py-2.5 font-medium text-right whitespace-nowrap">Fees</th>
                <th className="px-3 py-2.5 font-medium text-right whitespace-nowrap">Interest</th>
                <th className="px-3 py-2.5 font-medium text-right whitespace-nowrap">Tax</th>
                <th className="px-4 py-2.5 font-medium text-right whitespace-nowrap">Total</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-[var(--line)]">
              {summary.rows.map((row) => (
                <tr key={row.month} className="hover:bg-[var(--frost-100)] transition-colors">
                  <td className="px-4 py-2.5 font-mono font-medium text-[var(--ink)] whitespace-nowrap">
                    {row.month}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-[var(--muted)] tabular-nums">
                    {row.companies}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-[var(--ink)] tabular-nums whitespace-nowrap">
                    ₹{formatPlainNumber(row.fees)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-[var(--muted)] tabular-nums whitespace-nowrap">
                    ₹{formatPlainNumber(row.interest)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-[var(--muted)] tabular-nums whitespace-nowrap">
                    ₹{formatPlainNumber(row.tax)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono font-semibold text-[var(--ink)] tabular-nums whitespace-nowrap">
                    ₹{formatPlainNumber(row.totalBilled)}
                  </td>
                </tr>
              ))}
            </tbody>

            <tfoot>
              <tr className="bg-[var(--frost-100)] border-t-2 border-[var(--line)] font-semibold text-[var(--ink)]">
                <td className="px-4 py-2.5 whitespace-nowrap">TOTAL</td>
                <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                  {summary.totalUniqueCompanies}
                </td>
                <td className="px-3 py-2.5 text-right font-mono tabular-nums whitespace-nowrap">
                  ₹{formatPlainNumber(summary.totalFees)}
                </td>
                <td className="px-3 py-2.5 text-right font-mono tabular-nums whitespace-nowrap">
                  ₹{formatPlainNumber(summary.totalInterest)}
                </td>
                <td className="px-3 py-2.5 text-right font-mono tabular-nums whitespace-nowrap">
                  ₹{formatPlainNumber(summary.totalTax)}
                </td>
                <td className="px-4 py-2.5 text-right font-mono tabular-nums whitespace-nowrap">
                  ₹{formatPlainNumber(summary.totalBilled)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
    </div>
  );
}
