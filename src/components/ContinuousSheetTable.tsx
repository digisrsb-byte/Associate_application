import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarPlus,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  LayoutGrid,
  Plus,
  RotateCcw,
} from 'lucide-react';
import type { ClientRecord, FilingRecord } from '../types/ledger.ts';
import {
  computeBalance,
  computeClientTotals,
  extractYearOrderKey,
  formatDisplayDate,
  formatPlainNumber,
} from '../utils/ledgerUtils.ts';
import { CompanyRowMenu } from './CompanyRowMenu.tsx';
import { PortalPasswordCell } from './PortalPasswordCell.tsx';

interface ContinuousSheetTableProps {
  clients: ClientRecord[];
  years: string[];
  onEditCell: (client: ClientRecord, year: string, existing?: FilingRecord) => void;
  onEditClient: (client: ClientRecord) => void;
  onViewHistory: (client: ClientRecord) => void;
  onDeleteClient: (clientId: string) => Promise<void>;
  onAddYearColumn: (yearLabel: string) => Promise<void>;
  suggestedNextYear: string;
  onAddClientClick: () => void;
}

function resolveCurrentAssessmentYear(years: string[], now = new Date()): string {
  if (years.length === 0) return '';
  const month = now.getMonth();
  const year = now.getFullYear();
  const startYear = month >= 3 ? year : year - 1;
  const target = `AY ${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`;
  if (years.includes(target)) return target;

  const targetKey = extractYearOrderKey(target);
  const sorted = [...years].sort(
    (a, b) => extractYearOrderKey(a) - extractYearOrderKey(b) || a.localeCompare(b)
  );
  const candidates = sorted.filter((y) => extractYearOrderKey(y) <= targetKey);
  if (candidates.length > 0) return candidates[candidates.length - 1];
  return sorted[sorted.length - 1];
}

function getFilingBalance(f: FilingRecord): number {
  if (typeof f.balance === 'number' && !Number.isNaN(f.balance)) {
    return Math.max(0, f.balance);
  }
  return computeBalance(Number(f.fees) || 0, Number(f.received) || 0);
}

function shortAyLabel(year: string): string {
  const match = year.match(/(\d{4})\s*[-/]\s*(\d{2})/);
  if (match) return `${match[1].slice(2)}-${match[2]}`;
  return year.replace(/^AY\s+/i, '');
}

const focusRing =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--blue-500)]';

const pillBtn =
  'inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[var(--ink)] bg-[var(--card)] border border-[var(--line)] rounded-full hover:bg-[var(--frost-100)] cursor-pointer min-h-8 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm';

export function ContinuousSheetTable({
  clients,
  years,
  onEditCell,
  onEditClient,
  onViewHistory,
  onDeleteClient,
  onAddYearColumn,
  suggestedNextYear,
  onAddClientClick,
}: ContinuousSheetTableProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [addingYear, setAddingYear] = useState(false);
  const [newYearInput, setNewYearInput] = useState(suggestedNextYear);
  const [savingYear, setSavingYear] = useState(false);
  const [showAllYears, setShowAllYears] = useState(false);
  const [yearMenuOpen, setYearMenuOpen] = useState(false);
  const yearMenuRef = useRef<HTMLDivElement | null>(null);

  const sortedYears = useMemo(
    () =>
      [...years].sort(
        (a, b) => extractYearOrderKey(a) - extractYearOrderKey(b) || a.localeCompare(b)
      ),
    [years]
  );

  const currentYear = useMemo(
    () => resolveCurrentAssessmentYear(sortedYears),
    [sortedYears]
  );

  const [selectedYear, setSelectedYear] = useState(currentYear);

  useEffect(() => {
    if (!selectedYear || !sortedYears.includes(selectedYear)) {
      setSelectedYear(currentYear || sortedYears[sortedYears.length - 1] || '');
    }
  }, [sortedYears, currentYear, selectedYear]);

  const activeYear = sortedYears.includes(selectedYear)
    ? selectedYear
    : currentYear || sortedYears[sortedYears.length - 1] || '';

  const activeYearIndex = sortedYears.indexOf(activeYear);
  const canGoPrev = activeYearIndex > 0;
  const canGoNext = activeYearIndex >= 0 && activeYearIndex < sortedYears.length - 1;
  const isViewingCurrent = activeYear === currentYear;

  const visibleYears = showAllYears ? sortedYears : activeYear ? [activeYear] : [];

  const yearsNewestFirst = useMemo(
    () => [...sortedYears].reverse(),
    [sortedYears]
  );

  const yearsWithDue = useMemo(() => {
    const due = new Set<string>();
    for (const year of sortedYears) {
      for (const client of clients) {
        const f = client.filings?.[year];
        if (f && getFilingBalance(f) > 0) {
          due.add(year);
          break;
        }
      }
    }
    return due;
  }, [clients, sortedYears]);

  useEffect(() => {
    if (!yearMenuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!yearMenuRef.current?.contains(event.target as Node)) {
        setYearMenuOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setYearMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [yearMenuOpen]);

  const copyValue = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey((c) => (c === key ? null : c)), 1400);
    } catch {
      // Clipboard blocked
    }
  };

  const handleConfirmAddYear = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newYearInput.trim()) return;
    setSavingYear(true);
    try {
      await onAddYearColumn(newYearInput.trim());
      setAddingYear(false);
    } finally {
      setSavingYear(false);
    }
  };

  const goPrev = () => {
    if (!canGoPrev) return;
    setShowAllYears(false);
    setSelectedYear(sortedYears[activeYearIndex - 1]);
  };

  const goNext = () => {
    if (!canGoNext) return;
    setShowAllYears(false);
    setSelectedYear(sortedYears[activeYearIndex + 1]);
  };

  const backToCurrent = () => {
    setShowAllYears(false);
    setSelectedYear(currentYear);
  };

  const onYearSelect = (year: string) => {
    if (!year) return;
    setShowAllYears(false);
    setSelectedYear(year);
    setYearMenuOpen(false);
  };

  const yearDropdown = (
    <div className="relative" ref={yearMenuRef}>
      <button
        type="button"
        onClick={() => setYearMenuOpen((open) => !open)}
        aria-expanded={yearMenuOpen}
        aria-haspopup="listbox"
        className={`inline-flex items-center gap-1.5 pl-4 pr-3 py-2 rounded-full bg-[var(--navy-900)] text-white text-xs font-bold font-mono min-h-8 cursor-pointer shadow-sm ${focusRing}`}
      >
        <span>{showAllYears ? 'All years' : shortAyLabel(activeYear) || '—'}</span>
        <ChevronDown className="w-3.5 h-3.5" />
      </button>

      {yearMenuOpen && (
        <div
          role="listbox"
          aria-label="Assessment years"
          className="absolute left-0 top-[calc(100%+6px)] z-40 w-[168px] rounded-2xl border border-[var(--line)] bg-[var(--card)] shadow-card overflow-hidden"
        >
          <button
            type="button"
            onClick={() => {
              setShowAllYears(true);
              setYearMenuOpen(false);
            }}
            className={`w-full flex items-center gap-2 px-3.5 py-2.5 text-left text-xs font-semibold text-[var(--ink)] hover:bg-[var(--frost-100)] border-b border-[var(--line)] cursor-pointer ${focusRing}`}
          >
            <LayoutGrid className="w-3.5 h-3.5 text-[var(--muted)]" />
            <span>All years</span>
          </button>

          <div className="max-h-64 overflow-y-auto py-1.5 px-1.5">
            {yearsNewestFirst.map((year) => {
              const selected = !showAllYears && year === activeYear;
              const isNow = year === currentYear;
              const hasDue = yearsWithDue.has(year);
              return (
                <button
                  key={year}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => onYearSelect(year)}
                  className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-left text-xs font-bold font-mono cursor-pointer ${focusRing} ${
                    selected
                      ? 'bg-[var(--navy-900)] text-white'
                      : 'text-[var(--ink)] hover:bg-[var(--frost-100)]'
                  }`}
                >
                  <span>
                    {shortAyLabel(year)}
                    {isNow ? ' · now' : ''}
                  </span>
                  {hasDue && (
                    <span
                      className="w-2 h-2 rounded-full bg-[var(--danger)] shrink-0"
                      aria-label="Has outstanding balance"
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );

  const prevYear = canGoPrev ? sortedYears[activeYearIndex - 1] : '';
  const nextYear = canGoNext ? sortedYears[activeYearIndex + 1] : '';

  const topPeriodNav = (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex items-center gap-1">
        <button
          type="button"
          onClick={goPrev}
          disabled={!canGoPrev || showAllYears}
          aria-label="Previous year"
          className={`p-2 rounded-full border border-[var(--line)] bg-[var(--card)] text-[var(--ink)] hover:bg-[var(--frost-100)] cursor-pointer min-h-8 min-w-8 inline-flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed shadow-sm ${focusRing}`}
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        {yearDropdown}

        <button
          type="button"
          onClick={goNext}
          disabled={!canGoNext || showAllYears}
          aria-label="Next year"
          className={`p-2 rounded-full border border-[var(--line)] bg-[var(--card)] text-[var(--ink)] hover:bg-[var(--frost-100)] cursor-pointer min-h-8 min-w-8 inline-flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed shadow-sm ${focusRing}`}
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <button
        type="button"
        onClick={backToCurrent}
        disabled={isViewingCurrent && !showAllYears}
        className={`${pillBtn} ${focusRing}`}
      >
        <RotateCcw className="w-3.5 h-3.5" />
        <span>Current</span>
      </button>

      <button
        type="button"
        onClick={() => {
          setShowAllYears(true);
          setYearMenuOpen(false);
        }}
        aria-pressed={showAllYears}
        className={`${pillBtn} ${focusRing} ${
          showAllYears ? 'bg-[var(--navy-900)] text-white border-[var(--navy-900)] hover:bg-[var(--navy-700)]' : ''
        }`}
      >
        <LayoutGrid className="w-3.5 h-3.5" />
        <span>All years</span>
      </button>
    </div>
  );

  const bottomPeriodNav = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <button
        type="button"
        onClick={goPrev}
        disabled={!canGoPrev || showAllYears}
        className={`${pillBtn} ${focusRing}`}
      >
        <span>‹ Previous{prevYear ? ` · ${shortAyLabel(prevYear)}` : ''}</span>
      </button>

      <button
        type="button"
        onClick={goNext}
        disabled={!canGoNext || showAllYears}
        className={`${pillBtn} ${focusRing}`}
      >
        <span>Next{nextYear ? ` · ${shortAyLabel(nextYear)}` : ''} ›</span>
      </button>
    </div>
  );

  if (clients.length === 0) {
    return (
      <div className="bg-[var(--card)] rounded-2xl border border-white shadow-card px-6 py-14 text-center">
        <h2 className="font-display text-lg font-semibold text-[var(--ink)]">
          Your sheet is empty
        </h2>
        <p className="mt-1.5 text-sm text-[var(--muted)]">
          Add your first client to start filling continuous Assessment Year columns.
        </p>
        <button
          type="button"
          onClick={onAddClientClick}
          className={`mt-5 inline-flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-white bg-[var(--navy-900)] hover:bg-[var(--navy-700)] rounded-xl cursor-pointer min-h-8 ${focusRing}`}
        >
          <Plus className="w-4 h-4" />
          <span>Add First Client</span>
        </button>
      </div>
    );
  }

  return (
    <div className="bg-[var(--card)] rounded-2xl border border-white shadow-card overflow-hidden">
      <div className="px-4 py-3 border-b border-[var(--line)] bg-[var(--frost-100)] space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          {topPeriodNav}

          {addingYear ? (
            <form onSubmit={handleConfirmAddYear} className="flex items-center gap-1.5 ml-auto">
              <input
                type="text"
                value={newYearInput}
                onChange={(e) => setNewYearInput(e.target.value)}
                placeholder="AY 2027-28"
                className={`px-2.5 py-1.5 text-xs font-mono border border-[var(--line)] rounded-lg bg-[var(--card)] w-28 focus:outline-none focus:border-[var(--blue-500)] min-h-8 ${focusRing}`}
                autoFocus
              />
              <button
                type="submit"
                disabled={savingYear}
                className={`px-3 py-1.5 text-xs font-bold bg-[var(--navy-900)] text-white rounded-lg hover:bg-[var(--navy-700)] cursor-pointer min-h-8 ${focusRing}`}
              >
                Add
              </button>
              <button
                type="button"
                onClick={() => setAddingYear(false)}
                className={`px-2 py-1.5 text-xs text-[var(--muted)] cursor-pointer min-h-8 ${focusRing}`}
              >
                Cancel
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => {
                setNewYearInput(suggestedNextYear);
                setAddingYear(true);
              }}
              className={`ml-auto inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-[var(--ink)] bg-[var(--card)] border border-[var(--line)] rounded-lg hover:bg-[var(--frost-100)] cursor-pointer min-h-8 ${focusRing}`}
            >
              <CalendarPlus className="w-3.5 h-3.5 text-[var(--blue-500)]" />
              <span>New Year</span>
            </button>
          )}
        </div>

        <p className="text-[11px] text-[var(--muted)]">
          Jump years from the dropdown, step with Previous / Next, or open All years.
        </p>
      </div>

      <div className="overflow-x-auto ledger-scroll">
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="bg-[var(--navy-900)] text-white">
              <th className="sticky left-0 z-20 bg-[var(--navy-900)] px-2.5 py-2 font-medium border-r border-white/15 min-w-[130px] whitespace-nowrap">
                Name *
              </th>
              <th className="px-2.5 py-2 font-medium border-r border-white/15 min-w-[105px] whitespace-nowrap">
                PAN *
              </th>
              <th className="px-2.5 py-2 font-medium border-r border-white/15 min-w-[125px] whitespace-nowrap">
                Password *
              </th>
              <th className="px-2.5 py-2 font-medium border-r border-white/15 min-w-[110px] whitespace-nowrap">
                Phone
              </th>
              <th className="px-2.5 py-2 font-medium border-r border-white/15 min-w-[80px] whitespace-nowrap">
                Ref No
              </th>
              <th className="px-2.5 py-2 font-medium border-r border-white/25 min-w-[125px] whitespace-nowrap">
                Remark
              </th>
              {visibleYears.map((year) => {
                const isCurrentCol = year === currentYear;
                return (
                  <th
                    key={year}
                    className={`px-2.5 py-2 font-medium border-r min-w-[152px] whitespace-nowrap ${
                      isCurrentCol && !showAllYears
                        ? 'bg-[var(--navy-900)] text-white border-[var(--gold)]'
                        : isCurrentCol
                          ? 'bg-[var(--navy-700)] text-[var(--sidebar-text)] border-white/15'
                          : 'bg-[var(--navy-700)] text-[var(--sidebar-text)] border-white/15'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[11px]">{year}</span>
                      {isCurrentCol && (
                        <span
                          className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold tracking-wide ${
                            !showAllYears
                              ? 'bg-[var(--navy-900)] text-white'
                              : 'bg-[var(--navy-900)] text-white'
                          }`}
                        >
                          CURRENT
                        </span>
                      )}
                    </div>
                  </th>
                );
              })}
              <th className="sticky right-[188px] z-20 bg-[var(--navy-900)] px-2.5 py-2 font-medium text-right border-l border-r border-white/15 min-w-[105px] whitespace-nowrap">
                Total Received
              </th>
              <th className="sticky right-[82px] z-20 bg-[var(--navy-900)] px-2.5 py-2 font-medium text-right border-r border-white/15 min-w-[112px] whitespace-nowrap">
                Outstanding
              </th>
              <th className="sticky right-0 z-20 bg-[var(--navy-900)] px-2.5 py-2 font-medium text-right min-w-[82px] whitespace-nowrap">
                Action
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-[var(--line)]">
            {clients.map((client) => {
              const totals = computeClientTotals(client);

              return (
                <tr key={client.id} className="group hover:bg-[var(--frost-100)] align-top">
                  <td className="sticky left-0 z-10 bg-[var(--card)] group-hover:bg-[var(--sky-200)] px-3 py-3 font-medium text-[var(--ink)] border-r border-[var(--line)] whitespace-nowrap">
                    {client.name}
                  </td>

                  <td className="px-3 py-3 border-r border-[var(--line)] whitespace-nowrap">
                    <div className="inline-flex items-center gap-1 font-mono text-[var(--ink)]">
                      <span>{client.pan}</span>
                      <button
                        type="button"
                        onClick={() => copyValue(`pan-${client.id}`, client.pan)}
                        className={`p-1 text-[var(--muted)] hover:text-[var(--ink)] cursor-pointer min-h-8 min-w-8 inline-flex items-center justify-center ${focusRing}`}
                        title="Copy PAN"
                      >
                        {copiedKey === `pan-${client.id}` ? (
                          <Check className="w-3 h-3 text-[var(--success)]" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                    </div>
                  </td>

                  <td className="px-3 py-3 border-r border-[var(--line)] whitespace-nowrap">
                    <PortalPasswordCell
                      kind="it"
                      id={client.id}
                      hasPassword={!!client.hasPortalPassword}
                    />
                  </td>

                  <td className="px-3 py-3 font-mono text-[var(--muted)] border-r border-[var(--line)] whitespace-nowrap">
                    {client.phone || '—'}
                  </td>

                  <td className="px-3 py-3 font-mono text-[var(--muted)] border-r border-[var(--line)] whitespace-nowrap">
                    {client.referenceNumber || '—'}
                  </td>

                  <td className="px-3 py-3 text-[var(--muted)] border-r border-[var(--line)] max-w-[200px]">
                    <span className="truncate block" title={client.remark}>
                      {client.remark || '—'}
                    </span>
                  </td>

                  {visibleYears.map((year) => {
                    const f = client.filings?.[year];
                    const isCurrentCol = year === currentYear;
                    const tint = isCurrentCol && !showAllYears;
                    return (
                      <td
                        key={year}
                        className={`p-1.5 border-r border-[var(--line)] align-top ${
                          tint ? 'bg-[var(--frost-100)]' : ''
                        }`}
                      >
                        {f ? (
                          <button
                            type="button"
                            onClick={() => onEditCell(client, year, f)}
                            className={`w-full text-left p-2 rounded-lg border border-transparent transition-colors cursor-pointer space-y-0.5 min-h-8 ${focusRing} ${
                              tint
                                ? 'hover:bg-[var(--frost-100)] hover:border-[var(--gold)]'
                                : 'hover:bg-[var(--frost-100)] hover:border-[var(--line)]'
                            }`}
                          >
                            <div className="flex justify-between text-[11px] text-[var(--muted)]">
                              <span>Filed</span>
                              <span className="font-mono text-[var(--ink)]">
                                {formatDisplayDate(f.filingDate)}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-[var(--muted)]">Fees</span>
                              <span className="font-mono font-semibold text-[var(--ink)]">
                                ₹{formatPlainNumber(f.fees)}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-[var(--muted)]">Received</span>
                              <span className="font-mono text-[var(--success)] font-medium">
                                ₹{formatPlainNumber(f.received)}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-[var(--muted)]">Balance</span>
                              <span
                                className={`font-mono font-semibold ${
                                  getFilingBalance(f) > 0
                                    ? 'text-[var(--blue-500)]'
                                    : 'text-[var(--muted)]'
                                }`}
                              >
                                ₹{formatPlainNumber(getFilingBalance(f))}
                              </span>
                            </div>
                            <div className="pt-1 border-t border-[var(--line)] flex justify-between text-[11px] text-[var(--muted)]">
                              <span>{f.paymentType || '—'}</span>
                              <span className="font-mono text-[var(--muted)]">
                                {formatDisplayDate(f.paymentReceiveDate)}
                              </span>
                            </div>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onEditCell(client, year)}
                            className={`w-full min-h-[82px] flex items-center justify-center gap-1 rounded-lg border border-dashed cursor-pointer ${focusRing} ${
                              tint
                                ? 'border-[var(--gold)] text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--frost-100)]'
                                : 'border-transparent hover:border-[var(--line)] text-[var(--muted)] hover:text-[var(--ink)]'
                            }`}
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Add</span>
                          </button>
                        )}
                      </td>
                    );
                  })}

                  <td className="sticky right-[188px] z-10 bg-[var(--card)] group-hover:bg-[var(--frost-100)] px-2.5 py-2.5 text-right font-mono font-semibold text-sm text-[var(--success)] border-l border-r border-[var(--line)] tabular-nums whitespace-nowrap">
                    ₹{formatPlainNumber(totals.totalReceived)}
                  </td>

                  <td
                    className={`sticky right-[82px] z-10 bg-[var(--card)] group-hover:bg-[var(--frost-100)] px-2.5 py-2.5 text-right font-mono font-semibold text-sm border-r border-[var(--line)] tabular-nums whitespace-nowrap ${
                      totals.outstandingTotal > 0 ? 'text-[var(--blue-500)]' : 'text-[var(--ink)]'
                    }`}
                  >
                    ₹{formatPlainNumber(totals.outstandingTotal)}
                  </td>

                  <td className="sticky right-0 z-10 has-[[aria-expanded=true]]:z-50 bg-[var(--card)] group-hover:bg-[var(--frost-100)] px-2.5 py-3 text-right whitespace-nowrap overflow-visible">
                    <CompanyRowMenu
                      onEditDetails={() => onEditClient(client)}
                      onViewHistory={() => onViewHistory(client)}
                      onDelete={() => onDeleteClient(client.id)}
                      deleteLabel="Delete Client"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="px-4 py-3 border-t border-[var(--line)] bg-[var(--frost-100)]">
        {bottomPeriodNav}
      </div>
    </div>
  );
}
