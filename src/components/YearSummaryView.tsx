import { useMemo, useState } from 'react';
import { ArrowUpRight, ChevronDown, ChevronUp, Layers, Plus, TrendingUp, X } from 'lucide-react';
import type { ClientRecord, FilingRecord } from '../types/ledger.ts';
import { computeBalance, formatDisplayDate, formatPlainNumber } from '../utils/ledgerUtils.ts';
import { computeYearSummary } from '../utils/summaryUtils.ts';

interface DashboardHeroBannerProps {
  clients: ClientRecord[];
  years: string[];
  onAddClient: () => void;
  onOpenAllData: () => void;
}

export function DashboardHeroBanner({
  clients,
  years,
  onAddClient,
  onOpenAllData,
}: DashboardHeroBannerProps) {
  const summary = useMemo(() => computeYearSummary(clients, years), [clients, years]);
  const firstYear = summary.rows[0]?.year || 'AY 2019-20';
  const lastYear = summary.rows[summary.rows.length - 1]?.year || 'AY 2026-27';

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
          {firstYear} to {lastYear}
        </span>
        <h2 className="font-display text-lg sm:text-xl font-bold tracking-tight text-[var(--ink)]">
          Salary / ITR Filing Dashboard
        </h2>
        <p className="text-xs sm:text-sm text-[var(--ink)]">
          Live summary across {summary.totalUniqueClients} unique{' '}
          {summary.totalUniqueClients === 1 ? 'client' : 'clients'} and{' '}
          {summary.totalEntries} {summary.totalEntries === 1 ? 'filing' : 'filings'} (amounts in Rs.).
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

interface YearSummaryViewProps {
  clients: ClientRecord[];
  years: string[];
  onOpenAllData: () => void;
}

function shortAyLabel(ay: string): string {
  const match = ay.match(/(\d{4})-(\d{2})/);
  if (match) return `${match[1].slice(2)}-${match[2]}`;
  return ay.replace(/^AY\s*/i, '');
}

const BUCKET_ACCENTS = [
  'bg-[var(--navy-900)] text-white',
  'bg-[var(--ice)] text-[var(--ink)]',
  'bg-[var(--frost-100)] text-[var(--blue-500)]',
  'bg-[var(--navy-900)] text-white',
];

export function YearSummaryView({
  clients,
  years,
  onOpenAllData,
}: YearSummaryViewProps) {
  const summary = useMemo(() => computeYearSummary(clients, years), [clients, years]);
  const [selectedYear, setSelectedYear] = useState<string | null>(null);
  const [showStatsData, setShowStatsData] = useState(false);

  const firstYear = summary.rows[0]?.year || 'AY 2019-20';
  const lastYear = summary.rows[summary.rows.length - 1]?.year || 'AY 2026-27';
  const firstStartYear = firstYear.match(/\d{4}/)?.[0] || '2019';
  const lastStartYear = lastYear.match(/\d{4}/)?.[0] || '2026';

  const maxYearBilled = Math.max(
    1,
    ...summary.rows.map((r) => Math.max(r.amountBilled, r.received + r.outstanding))
  );

  const receivedSharePct =
    summary.totalBilled > 0
      ? Math.min(100, (summary.totalReceived / summary.totalBilled) * 100)
      : 0;
  const outstandingSharePct =
    summary.totalBilled > 0
      ? Math.max(0, 100 - receivedSharePct)
      : 0;

  const activeRow = useMemo(
    () => (selectedYear ? summary.rows.find((r) => r.year === selectedYear) || null : null),
    [selectedYear, summary.rows]
  );

  const displayBilled = activeRow ? activeRow.amountBilled : summary.totalBilled;
  const displayReceived = activeRow ? activeRow.received : summary.totalReceived;
  const displayOutstanding = activeRow ? activeRow.outstanding : summary.totalOutstanding;
  const displayCollectionPct = activeRow ? activeRow.collectionPct : summary.totalCollectionPct;

  const selectedYearFilings = useMemo(() => {
    if (!selectedYear) return [];
    const list: { client: ClientRecord; filing: FilingRecord; balance: number }[] = [];
    for (const client of clients) {
      const f = client.filings?.[selectedYear];
      if (!f) continue;
      const bal =
        typeof f.balance === 'number' && !Number.isNaN(f.balance)
          ? Math.max(0, f.balance)
          : computeBalance(Number(f.fees) || 0, Number(f.received) || 0);
      list.push({ client, filing: f, balance: bal });
    }
    return list;
  }, [clients, selectedYear]);

  const handleBarClick = (year: string) => {
    if (selectedYear === year) {
      setSelectedYear(null);
      setShowStatsData(false);
    } else {
      setSelectedYear(year);
      setShowStatsData(true);
    }
  };

  const handleToggleStatsPanel = () => {
    setShowStatsData((prev) => !prev);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_330px] gap-4 items-stretch">
        {/* Left: Interactive Statistics Line Chart Card */}
        <section className="bg-[var(--card)] rounded-2xl p-5 shadow-card flex flex-col justify-between gap-4 min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-display text-sm sm:text-base font-semibold text-[var(--ink)]">
                  Statistics
                </h3>
                {selectedYear && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--frost-100)] text-[var(--blue-500)] text-[11px] font-semibold font-mono">
                    {selectedYear}
                    <button
                      type="button"
                      onClick={() => setSelectedYear(null)}
                      aria-label="Clear year filter"
                      className="hover:text-[var(--ink)] cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}
              </div>
              <p className="text-xs text-[var(--muted)]">
                Click any year on the line chart or &ldquo;Show Data&rdquo; to inspect filings
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleToggleStatsPanel}
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
                onClick={onOpenAllData}
                className="text-xs font-semibold text-[var(--muted)] hover:text-[var(--ink)] transition-colors cursor-pointer whitespace-nowrap"
              >
                See more
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-[210px_minmax(0,1fr)] gap-5 items-end">
            {/* Left clickable summary + legend */}
            <button
              type="button"
              onClick={handleToggleStatsPanel}
              className="text-left space-y-4 rounded-xl p-2 -m-2 hover:bg-[var(--frost-100)] transition-colors cursor-pointer"
              title="Click to show or hide detailed statistics data"
            >
              <div>
                <p className="text-xs text-[var(--muted)]">
                  {activeRow ? `${activeRow.year} Billed` : 'Total Billed'}
                </p>
                <p className="mt-0.5 font-mono text-2xl font-bold tracking-tight text-[var(--ink)] tabular-nums">
                  ₹{formatPlainNumber(displayBilled)}
                </p>
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-2 text-[var(--muted)] font-medium">
                    <span className="w-2.5 h-2.5 rounded-full bg-[var(--navy-900)] border border-[var(--navy-900)]/20" />
                    Received
                  </span>
                  <span className="font-mono font-semibold text-[var(--success)] tabular-nums">
                    ₹{formatPlainNumber(displayReceived)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-2 text-[var(--muted)] font-medium">
                    <span className="w-2.5 h-2.5 rounded-full bg-[var(--ice)]" />
                    Outstanding
                  </span>
                  <span className="font-mono font-semibold text-[var(--blue-500)] tabular-nums">
                    ₹{formatPlainNumber(displayOutstanding)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-2 text-[var(--muted)] font-medium">
                    <span className="w-2.5 h-2.5 rounded-full bg-[var(--navy-900)]" />
                    Collection
                  </span>
                  <span className="font-mono font-semibold text-[var(--ink)] tabular-nums">
                    {displayCollectionPct.toFixed(1)}%
                  </span>
                </div>
              </div>
            </button>

            {/* Right clickable multi-line chart */}
            <div className="w-full min-w-0 pt-1">
              {(() => {
                const rows = summary.rows;
                const n = rows.length;
                const W = 560;
                const H = 168;
                const padT = 12;
                const padR = 10;
                const padB = 28;
                const padL = 10;
                const plotW = W - padL - padR;
                const plotH = H - padT - padB;
                const xAt = (i: number) =>
                  padL + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
                const yAt = (value: number) =>
                  padT + (1 - Math.min(1, Math.max(0, value / maxYearBilled))) * plotH;

                const pts = rows.map((row, i) => ({
                  x: xAt(i),
                  receivedY: yAt(row.received),
                  outstandingY: yAt(row.outstanding),
                  collectionY: yAt((row.collectionPct / 100) * maxYearBilled),
                }));

                const linePath = (getY: (p: (typeof pts)[number]) => number) =>
                  pts
                    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${getY(p)}`)
                    .join(' ');

                return (
                  <div className="relative w-full">
                    <svg
                      viewBox={`0 0 ${W} ${H}`}
                      className="w-full h-[168px] sm:h-[180px]"
                      role="img"
                      aria-label="Yearly received, outstanding and collection line chart"
                    >
                      <line
                        x1={padL}
                        y1={yAt(0)}
                        x2={W - padR}
                        y2={yAt(0)}
                        stroke="var(--line)"
                        strokeWidth="1"
                      />

                      <path
                        d={linePath((p) => p.outstandingY)}
                        fill="none"
                        stroke="var(--ice)"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <path
                        d={linePath((p) => p.receivedY)}
                        fill="none"
                        stroke="var(--ice)"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <path
                        d={linePath((p) => p.collectionY)}
                        fill="none"
                        stroke="var(--ink)"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />

                      {rows.map((row, i) => {
                        const isSelected = selectedYear === row.year;
                        const cx = pts[i].x;
                        return (
                          <g key={row.year}>
                            {isSelected && (
                              <line
                                x1={cx}
                                y1={padT}
                                x2={cx}
                                y2={yAt(0)}
                                stroke="var(--ink)"
                                strokeWidth="1.5"
                                strokeDasharray="4 3"
                                opacity="0.35"
                              />
                            )}
                            <circle
                              cx={cx}
                              cy={pts[i].outstandingY}
                              r={isSelected ? 4.5 : 3}
                              fill="var(--sky-200)"
                              stroke="var(--ink)"
                              strokeWidth="1"
                            />
                            <circle
                              cx={cx}
                              cy={pts[i].receivedY}
                              r={isSelected ? 4.5 : 3}
                              fill="var(--ice)"
                              stroke="var(--ink)"
                              strokeWidth="1"
                            />
                            <circle
                              cx={cx}
                              cy={pts[i].collectionY}
                              r={isSelected ? 4.5 : 3}
                              fill={isSelected ? 'var(--navy-900)' : 'var(--card)'}
                              stroke="var(--ink)"
                              strokeWidth="1.5"
                            />
                            <text
                              x={cx}
                              y={H - 8}
                              textAnchor="middle"
                              className="fill-[var(--muted)]"
                              style={{
                                fontSize: '10px',
                                fontFamily: 'JetBrains Mono, ui-monospace, monospace',
                                fontWeight: isSelected ? 700 : 500,
                              }}
                            >
                              {shortAyLabel(row.year)}
                            </text>
                          </g>
                        );
                      })}
                    </svg>

                    <div className="absolute inset-0 flex">
                      {rows.map((row) => {
                        const isSelected = selectedYear === row.year;
                        return (
                          <button
                            key={row.year}
                            type="button"
                            onClick={() => handleBarClick(row.year)}
                            aria-pressed={isSelected}
                            title={`Click to inspect ${row.year} — Billed ₹${formatPlainNumber(row.amountBilled)} | Received ₹${formatPlainNumber(row.received)} | Outstanding ₹${formatPlainNumber(row.outstanding)}`}
                            className={`flex-1 h-full rounded-lg cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--blue-500)] ${
                              isSelected ? 'bg-[var(--frost-100)]/35' : 'hover:bg-[var(--frost-100)]/50'
                            }`}
                          />
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>

          {/* Expandable Statistics Data Breakdown */}
          {showStatsData && (
            <div className="border-t border-[var(--line)] pt-3.5 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setSelectedYear(null)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer ${
                      selectedYear === null
                        ? 'bg-[var(--navy-900)] text-white'
                        : 'bg-[var(--frost-100)] text-[var(--muted)] hover:text-[var(--ink)]'
                    }`}
                  >
                    All Years ({summary.totalEntries})
                  </button>
                  {summary.rows.map((row) => (
                    <button
                      key={row.year}
                      type="button"
                      onClick={() => setSelectedYear(row.year)}
                      className={`px-2 py-1 rounded-lg font-mono text-[11px] font-medium transition-colors cursor-pointer ${
                        selectedYear === row.year
                          ? 'bg-[var(--navy-900)] text-white'
                          : 'bg-[var(--frost-100)] text-[var(--muted)] hover:text-[var(--ink)]'
                      }`}
                    >
                      {shortAyLabel(row.year)} ({row.entries})
                    </button>
                  ))}
                </div>
              </div>

              {selectedYear ? (
                selectedYearFilings.length === 0 ? (
                  <div className="rounded-xl bg-[var(--frost-100)] px-4 py-4 text-center text-xs text-[var(--muted)]">
                    No client filings recorded for {selectedYear}.
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-[var(--line)]">
                    <table className="w-full border-collapse text-left text-xs">
                      <thead>
                        <tr className="bg-[var(--navy-900)] text-white text-[11px] border-b border-[var(--line)]">
                          <th className="px-3 py-2 font-semibold whitespace-nowrap">Client Name</th>
                          <th className="px-2.5 py-2 font-semibold whitespace-nowrap">PAN</th>
                          <th className="px-2.5 py-2 font-semibold whitespace-nowrap">Filing Date</th>
                          <th className="px-2.5 py-2 font-semibold text-right whitespace-nowrap">Fees</th>
                          <th className="px-2.5 py-2 font-semibold text-right whitespace-nowrap">Received</th>
                          <th className="px-3 py-2 font-semibold text-right whitespace-nowrap">Outstanding</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--line)]">
                        {selectedYearFilings.map(({ client, filing, balance }) => (
                          <tr key={client.id} className="hover:bg-[var(--frost-100)]">
                            <td className="px-3 py-2 font-medium text-[var(--ink)] whitespace-nowrap">
                              {client.name}
                            </td>
                            <td className="px-2.5 py-2 font-mono text-[var(--muted)] whitespace-nowrap">
                              {client.pan}
                            </td>
                            <td className="px-2.5 py-2 text-[var(--muted)] whitespace-nowrap">
                              {formatDisplayDate(filing.filingDate)}
                            </td>
                            <td className="px-2.5 py-2 text-right font-mono text-[var(--ink)] tabular-nums whitespace-nowrap">
                              ₹{formatPlainNumber(Number(filing.fees) || 0)}
                            </td>
                            <td className="px-2.5 py-2 text-right font-mono font-medium text-[var(--success)] tabular-nums whitespace-nowrap">
                              ₹{formatPlainNumber(Number(filing.received) || 0)}
                            </td>
                            <td
                              className={`px-3 py-2 text-right font-mono font-semibold tabular-nums whitespace-nowrap ${
                                balance > 0 ? 'text-[var(--blue-500)]' : 'text-[var(--muted)]'
                              }`}
                            >
                              ₹{formatPlainNumber(balance)}
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
                        <th className="px-3 py-2 font-semibold whitespace-nowrap">Assessment Year</th>
                        <th className="px-2.5 py-2 font-semibold text-right whitespace-nowrap">Entries</th>
                        <th className="px-2.5 py-2 font-semibold text-right whitespace-nowrap">Billed</th>
                        <th className="px-2.5 py-2 font-semibold text-right whitespace-nowrap">Received</th>
                        <th className="px-2.5 py-2 font-semibold text-right whitespace-nowrap">Outstanding</th>
                        <th className="px-3 py-2 font-semibold text-right whitespace-nowrap">Collection %</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--line)]">
                      {summary.rows.map((row) => (
                        <tr
                          key={row.year}
                          onClick={() => setSelectedYear(row.year)}
                          className="hover:bg-[var(--frost-100)]/50 cursor-pointer transition-colors"
                          title={`Click to view ${row.year} client filings`}
                        >
                          <td className="px-3 py-1.5 font-mono font-medium text-[var(--ink)] whitespace-nowrap">
                            {row.year}
                          </td>
                          <td className="px-2.5 py-1.5 text-right font-mono text-[var(--muted)] tabular-nums">
                            {row.entries}
                          </td>
                          <td className="px-2.5 py-1.5 text-right font-mono text-[var(--ink)] tabular-nums whitespace-nowrap">
                            ₹{formatPlainNumber(row.amountBilled)}
                          </td>
                          <td className="px-2.5 py-1.5 text-right font-mono text-[var(--success)] tabular-nums whitespace-nowrap">
                            ₹{formatPlainNumber(row.received)}
                          </td>
                          <td
                            className={`px-2.5 py-1.5 text-right font-mono font-semibold tabular-nums whitespace-nowrap ${
                              row.outstanding > 0 ? 'text-[var(--blue-500)]' : 'text-[var(--muted)]'
                            }`}
                          >
                            ₹{formatPlainNumber(row.outstanding)}
                          </td>
                          <td className="px-3 py-1.5 text-right font-mono text-[var(--ink)] tabular-nums whitespace-nowrap">
                            {row.collectionPct.toFixed(1)}%
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

        {/* Right Column */}
        <div className="space-y-4 flex flex-col">
          {/* Collection Share */}
          <section className="bg-[var(--card)] rounded-2xl p-4 shadow-card space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-display text-sm font-semibold text-[var(--ink)]">
                Collection Share
              </h3>
              <span className="font-mono text-xs font-bold text-[var(--ink)] tabular-nums">
                {summary.totalCollectionPct.toFixed(1)}%
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px] text-[var(--muted)]">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[var(--navy-900)] border border-[var(--navy-900)]/20 shrink-0" />
                <span>Received: {receivedSharePct.toFixed(0)}%</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[var(--ice)] shrink-0" />
                <span>Due: {outstandingSharePct.toFixed(0)}%</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[var(--navy-900)] shrink-0" />
                <span>Clients: {summary.totalUniqueClients}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[var(--blue-500)] shrink-0" />
                <span>Entries: {summary.totalEntries}</span>
              </div>
            </div>

            <div className="h-4 w-full rounded-full bg-[var(--frost-100)] p-0.5 flex gap-1 overflow-hidden">
              {receivedSharePct > 0 && (
                <div
                  className="h-full rounded-full bg-[var(--navy-900)] transition-all duration-300"
                  style={{ width: `${receivedSharePct}%` }}
                  title={`Received: ${receivedSharePct.toFixed(1)}%`}
                />
              )}
              {outstandingSharePct > 0 && (
                <div
                  className="h-full rounded-full bg-[var(--ice)] transition-all duration-300"
                  style={{ width: `${outstandingSharePct}%` }}
                  title={`Outstanding: ${outstandingSharePct.toFixed(1)}%`}
                />
              )}
              {summary.totalBilled === 0 && (
                <div className="h-full w-full rounded-full bg-[var(--line)]" />
              )}
            </div>
          </section>

          {/* Clients by number of years filed */}
          <section className="bg-[var(--card)] rounded-2xl p-4 shadow-card flex-1 flex flex-col justify-between gap-3">
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-display text-sm font-semibold text-[var(--ink)]">
                  Clients by number of years filed
                </h3>
                <button
                  type="button"
                  onClick={onOpenAllData}
                  className="text-[11px] font-semibold text-[var(--muted)] hover:text-[var(--ink)] cursor-pointer whitespace-nowrap"
                >
                  See more
                </button>
              </div>

              <div className="space-y-2">
                {summary.buckets.length === 0 ? (
                  <div className="rounded-xl bg-[var(--frost-100)] px-3 py-5 text-center text-xs text-[var(--muted)]">
                    No filed entries yet
                  </div>
                ) : (
                  summary.buckets.map((b, idx) => {
                    const badgeClass = BUCKET_ACCENTS[idx % BUCKET_ACCENTS.length];
                    return (
                      <div
                        key={b.yearsCount}
                        className="flex items-center justify-between gap-3 rounded-xl bg-[var(--frost-100)] hover:bg-[var(--frost-100)]/60 px-3 py-2.5 transition-colors"
                      >
                        <div className="flex items-center gap-2.5">
                          <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${badgeClass}`}>
                            <Layers className="w-3.5 h-3.5" />
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-[var(--ink)]">
                              {b.yearsCount} {b.yearsCount === 1 ? 'year' : 'years'} filed
                            </p>
                            <p className="text-[11px] text-[var(--muted)]">
                              Times Filed (years)
                            </p>
                          </div>
                        </div>
                        <span className={`px-2.5 py-1 rounded-lg font-mono text-xs font-bold tabular-nums ${badgeClass}`}>
                          {b.clientCount}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-[var(--frost-100)] text-xs font-semibold text-[var(--ink)]">
              <span>Total</span>
              <span className="font-mono tabular-nums">{summary.totalBucketClients}</span>
            </div>
          </section>
        </div>
      </div>

      {/* Full-Width Table: Salary / ITR Filing - Year-wise Summary */}
      <section className="w-full bg-[var(--card)] rounded-2xl shadow-card overflow-hidden">
        <div className="px-4 sm:px-5 py-3.5 border-b border-[var(--line)] flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-sm sm:text-base font-semibold text-[var(--ink)]">
              Salary / ITR Filing - Year-wise Summary ({firstYear} to {lastYear})
            </h2>
            <p className="text-xs text-[var(--muted)] mt-0.5">
              All figures are live formulas from &ldquo;All Data&rdquo; and &ldquo;Client Summary&rdquo;. Amounts in Rs.
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
                <th className="px-4 py-2.5 font-medium whitespace-nowrap">Assessment Year</th>
                <th className="px-3 py-2.5 font-medium text-right whitespace-nowrap">Entries</th>
                <th className="px-3 py-2.5 font-medium text-right whitespace-nowrap">Unique Clients</th>
                <th className="px-3 py-2.5 font-medium text-right whitespace-nowrap">Amount Billed</th>
                <th className="px-3 py-2.5 font-medium text-right whitespace-nowrap">Received</th>
                <th className="px-3 py-2.5 font-medium text-right whitespace-nowrap">Outstanding</th>
                <th className="px-4 py-2.5 font-medium text-right whitespace-nowrap">Collection %</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-[var(--line)]">
              {summary.rows.map((row) => (
                <tr key={row.year} className="hover:bg-[var(--frost-100)] transition-colors">
                  <td className="px-4 py-2.5 font-mono font-medium text-[var(--ink)] whitespace-nowrap">
                    {row.year}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-[var(--muted)] tabular-nums">
                    {row.entries}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-[var(--muted)] tabular-nums">
                    {row.uniqueClients}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-[var(--ink)] tabular-nums whitespace-nowrap">
                    ₹{formatPlainNumber(row.amountBilled)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono font-medium text-[var(--success)] tabular-nums whitespace-nowrap">
                    ₹{formatPlainNumber(row.received)}
                  </td>
                  <td
                    className={`px-3 py-2.5 text-right font-mono font-semibold tabular-nums whitespace-nowrap ${
                      row.outstanding > 0 ? 'text-[var(--blue-500)]' : 'text-[var(--muted)]'
                    }`}
                  >
                    ₹{formatPlainNumber(row.outstanding)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-[var(--ink)] tabular-nums whitespace-nowrap">
                    {row.collectionPct.toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>

            <tfoot>
              <tr className="bg-[var(--frost-100)] border-t-2 border-[var(--line)] font-semibold text-[var(--ink)]">
                <td className="px-4 py-2.5 whitespace-nowrap">
                  TOTAL ({firstStartYear}-{lastStartYear})
                </td>
                <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                  {summary.totalEntries}
                </td>
                <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                  {summary.totalUniqueClients}
                </td>
                <td className="px-3 py-2.5 text-right font-mono tabular-nums whitespace-nowrap">
                  ₹{formatPlainNumber(summary.totalBilled)}
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-[var(--success)] tabular-nums whitespace-nowrap">
                  ₹{formatPlainNumber(summary.totalReceived)}
                </td>
                <td
                  className={`px-3 py-2.5 text-right font-mono tabular-nums whitespace-nowrap ${
                    summary.totalOutstanding > 0 ? 'text-[var(--blue-500)]' : 'text-[var(--ink)]'
                  }`}
                >
                  ₹{formatPlainNumber(summary.totalOutstanding)}
                </td>
                <td className="px-4 py-2.5 text-right font-mono tabular-nums whitespace-nowrap">
                  {summary.totalCollectionPct.toFixed(1)}%
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="px-4 sm:px-5 py-2.5 bg-[var(--frost-100)] border-t border-[var(--line)] text-[11px] text-[var(--muted)]">
          &ldquo;Unique Clients&rdquo; in the total row counts each client PAN once across all years.
        </div>
      </section>
    </div>
  );
}
