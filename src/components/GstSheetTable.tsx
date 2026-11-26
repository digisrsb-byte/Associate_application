import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  CalendarPlus,
  Check,
  ChevronDown,
  Copy,
  LayoutGrid,
  Plus,
} from 'lucide-react';
import type { GstClientRecord, GstMonthlyFiling } from '../types/ledger.ts';
import {
  computeGstClientTotals,
  computeGstFilingOutstanding,
  computeGstFilingReceived,
  extractMonthOrderKey,
  formatPlainNumber,
  getGstFilingCollectibleTotal,
  gstFilingHasOverReceipt,
  sortGstMonths,
} from '../utils/ledgerUtils.ts';
import {
  GST_OUTSTANDING_UNALLOCATED_EXPLAIN,
  GST_UNALLOCATED_LABEL,
} from '../utils/gstCopy.ts';
import { CompanyRowMenu } from './CompanyRowMenu.tsx';
import { PortalPasswordCell } from './PortalPasswordCell.tsx';
import {
  BottomPeriodNavigator,
  TopPeriodNavigator,
} from './shared/PeriodNavigator.tsx';
import {
  SheetTableToolbar,
  TableFooterBar,
} from './shared/SheetTableToolbar.tsx';
import { TABLE_FOCUS_RING } from './shared/tableStyles.ts';
import { useIsCompactLayout } from '../hooks/useMediaQuery.ts';
import { MobileSheetUnavailable } from './mobile/MobileSheetUnavailable.tsx';

interface GstSheetTableProps {
  clients: GstClientRecord[];
  months: string[];
  onEditCell: (company: GstClientRecord, month: string, existing?: GstMonthlyFiling) => void;
  onEditCompany: (company: GstClientRecord) => void;
  onViewHistory: (company: GstClientRecord) => void;
  onDeleteCompany: (companyId: string) => Promise<void>;
  onAddMonthColumn: (monthLabel: string) => Promise<void>;
  suggestedNextMonth: string;
  onAddCompanyClick: () => void;
  /** Switch to Simple / mobile list when Sheet View is selected on a narrow screen. */
  onPreferSimpleView?: () => void;
}

const MONTH_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

function resolveCurrentGstMonth(months: string[], now = new Date()): string {
  if (months.length === 0) return '';
  const target = `${MONTH_SHORT[now.getMonth()]} ${now.getFullYear()}`;
  if (months.includes(target)) return target;

  const targetKey = extractMonthOrderKey(target);
  const sorted = sortGstMonths(months);
  const candidates = sorted.filter((m) => extractMonthOrderKey(m) <= targetKey);
  if (candidates.length > 0) return candidates[candidates.length - 1];
  return sorted[sorted.length - 1];
}

function getFilingTotal(f: GstMonthlyFiling): number {
  return getGstFilingCollectibleTotal(f);
}

function shortMonthLabel(month: string): string {
  const match = month.trim().match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (match) return `${match[1].slice(0, 3)} ${match[2].slice(2)}`;
  return month;
}

const focusRing = TABLE_FOCUS_RING;

export function GstSheetTable({
  clients,
  months,
  onEditCell,
  onEditCompany,
  onViewHistory,
  onDeleteCompany,
  onAddMonthColumn,
  suggestedNextMonth,
  onAddCompanyClick,
  onPreferSimpleView,
}: GstSheetTableProps) {
  const isCompact = useIsCompactLayout();
  const uid = useId();
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [addingMonth, setAddingMonth] = useState(false);
  const [newMonthInput, setNewMonthInput] = useState(suggestedNextMonth);
  const [savingMonth, setSavingMonth] = useState(false);
  const [showAllMonths, setShowAllMonths] = useState(false);
  const [monthMenuOpen, setMonthMenuOpen] = useState(false);
  const monthMenuRef = useRef<HTMLDivElement | null>(null);
  const newMonthInputRef = useRef<HTMLInputElement>(null);

  const sortedMonths = useMemo(() => sortGstMonths(months), [months]);

  const currentMonth = useMemo(
    () => resolveCurrentGstMonth(sortedMonths),
    [sortedMonths]
  );

  const [selectedMonth, setSelectedMonth] = useState(currentMonth);

  useEffect(() => {
    if (!selectedMonth || !sortedMonths.includes(selectedMonth)) {
      setSelectedMonth(currentMonth || sortedMonths[sortedMonths.length - 1] || '');
    }
  }, [sortedMonths, currentMonth, selectedMonth]);

  const activeMonth = sortedMonths.includes(selectedMonth)
    ? selectedMonth
    : currentMonth || sortedMonths[sortedMonths.length - 1] || '';

  const activeMonthIndex = sortedMonths.indexOf(activeMonth);
  const canGoPrev = activeMonthIndex > 0;
  const canGoNext = activeMonthIndex >= 0 && activeMonthIndex < sortedMonths.length - 1;
  const isViewingCurrent = activeMonth === currentMonth;

  const visibleMonths = showAllMonths ? sortedMonths : activeMonth ? [activeMonth] : [];

  const monthsNewestFirst = useMemo(
    () => [...sortedMonths].reverse(),
    [sortedMonths]
  );

  const monthsWithBilled = useMemo(() => {
    const billed = new Set<string>();
    for (const month of sortedMonths) {
      for (const company of clients) {
        const f = company.filings?.[month];
        if (f && getFilingTotal(f) > 0) {
          billed.add(month);
          break;
        }
      }
    }
    return billed;
  }, [clients, sortedMonths]);

  useEffect(() => {
    if (!monthMenuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!monthMenuRef.current?.contains(event.target as Node)) {
        setMonthMenuOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMonthMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [monthMenuOpen]);

  useEffect(() => {
    if (!addingMonth) return;
    const frame = window.requestAnimationFrame(() => {
      newMonthInputRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [addingMonth]);

  const copyValue = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey((c) => (c === key ? null : c)), 1400);
    } catch {
      // Clipboard blocked
    }
  };

  const handleConfirmAddMonth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMonthInput.trim()) return;
    setSavingMonth(true);
    try {
      await onAddMonthColumn(newMonthInput.trim());
      setAddingMonth(false);
    } finally {
      setSavingMonth(false);
    }
  };

  const goPrev = () => {
    if (!canGoPrev) return;
    setShowAllMonths(false);
    setSelectedMonth(sortedMonths[activeMonthIndex - 1]);
  };

  const goNext = () => {
    if (!canGoNext) return;
    setShowAllMonths(false);
    setSelectedMonth(sortedMonths[activeMonthIndex + 1]);
  };

  const backToCurrent = () => {
    setShowAllMonths(false);
    setSelectedMonth(currentMonth);
  };

  const onMonthSelect = (month: string) => {
    if (!month) return;
    setShowAllMonths(false);
    setSelectedMonth(month);
    setMonthMenuOpen(false);
  };

  const monthDropdown = (
    <div className="relative" ref={monthMenuRef}>
      <button
        type="button"
        onClick={() => setMonthMenuOpen((open) => !open)}
        aria-expanded={monthMenuOpen}
        aria-haspopup="listbox"
        className={`inline-flex items-center gap-1.5 pl-4 pr-3 py-2 rounded-full bg-[var(--navy-900)] text-white text-xs font-bold font-mono min-h-8 cursor-pointer shadow-sm ${focusRing}`}
      >
        <span>
          {showAllMonths ? 'All months' : shortMonthLabel(activeMonth) || '—'}
        </span>
        <ChevronDown className="w-3.5 h-3.5" />
      </button>

      {monthMenuOpen && (
        <div
          role="listbox"
          aria-label="GST months"
          className="absolute left-0 top-[calc(100%+6px)] z-40 w-[168px] rounded-2xl border border-[var(--line)] bg-[var(--card)] shadow-card overflow-hidden"
        >
          <button
            type="button"
            onClick={() => {
              setShowAllMonths(true);
              setMonthMenuOpen(false);
            }}
            className={`w-full flex items-center gap-2 px-3.5 py-2.5 text-left text-xs font-semibold text-[var(--ink)] hover:bg-[var(--frost-100)] border-b border-[var(--line)] cursor-pointer ${focusRing}`}
          >
            <LayoutGrid className="w-3.5 h-3.5 text-[var(--muted)]" />
            <span>All months</span>
          </button>

          <div className="max-h-64 overflow-y-auto py-1.5 px-1.5">
            {monthsNewestFirst.map((month) => {
              const selected = !showAllMonths && month === activeMonth;
              const isNow = month === currentMonth;
              const hasBilled = monthsWithBilled.has(month);
              return (
                <button
                  key={month}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => onMonthSelect(month)}
                  className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-left text-xs font-bold font-mono cursor-pointer ${focusRing} ${
                    selected
                      ? 'bg-[var(--navy-900)] text-white'
                      : 'text-[var(--ink)] hover:bg-[var(--frost-100)]'
                  }`}
                >
                  <span>
                    {shortMonthLabel(month)}
                    {isNow ? ' · now' : ''}
                  </span>
                  {hasBilled && (
                    <span
                      className="w-2 h-2 rounded-full bg-[var(--danger)] shrink-0"
                      aria-label="Has billed amount"
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

  const prevMonth = canGoPrev ? sortedMonths[activeMonthIndex - 1] : '';
  const nextMonth = canGoNext ? sortedMonths[activeMonthIndex + 1] : '';

  const topPeriodNav = (
    <TopPeriodNavigator
      layout="inline"
      canPrev={canGoPrev}
      canNext={canGoNext}
      showAll={showAllMonths}
      isViewingCurrent={isViewingCurrent}
      onPrev={goPrev}
      onNext={goNext}
      onCurrent={backToCurrent}
      onShowAll={() => {
        setShowAllMonths(true);
        setMonthMenuOpen(false);
      }}
      prevAriaLabel="Previous month"
      nextAriaLabel="Next month"
      allLabel="All months"
      periodSlot={monthDropdown}
    />
  );

  const bottomPeriodNav = (
    <BottomPeriodNavigator
      canPrev={canGoPrev}
      canNext={canGoNext}
      showAll={showAllMonths}
      onPrev={goPrev}
      onNext={goNext}
      prevText={`‹ Previous${prevMonth ? ` · ${shortMonthLabel(prevMonth)}` : ''}`}
      nextText={`Next${nextMonth ? ` · ${shortMonthLabel(nextMonth)}` : ''} ›`}
    />
  );

  if (isCompact) {
    return (
      <MobileSheetUnavailable
        title="GST Sheet View needs a desktop screen"
        onUseMobileList={() => onPreferSimpleView?.()}
      />
    );
  }

  if (clients.length === 0) {
    return (
      <div className="bg-[var(--card)] rounded-2xl border border-white shadow-card px-6 py-14 text-center">
        <h2 className="font-display text-lg font-semibold text-[var(--ink)]">
          Your GST sheet is empty
        </h2>
        <p className="mt-1.5 text-sm text-[var(--muted)]">
          Add your GST company to record Monthly Filing columns (Fees, Inter, Tax, Total).
        </p>
        <button
          type="button"
          onClick={onAddCompanyClick}
          className={`mt-5 inline-flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-white bg-[var(--navy-900)] hover:bg-[var(--navy-700)] rounded-xl cursor-pointer min-h-8 ${focusRing}`}
        >
          <Plus className="w-4 h-4" />
          <span>Add GST Company</span>
        </button>
      </div>
    );
  }

  const addMonthTrailing = addingMonth ? (
    <form onSubmit={handleConfirmAddMonth} className="flex items-center gap-1.5 ml-auto">
      <label htmlFor={`${uid}-new-month`} className="sr-only">
        New GST month
      </label>
      <input
        id={`${uid}-new-month`}
        ref={newMonthInputRef}
        type="text"
        value={newMonthInput}
        onChange={(e) => setNewMonthInput(e.target.value)}
        placeholder="Apr 2027"
        className={`px-2.5 py-1.5 text-xs font-mono border border-[var(--line)] rounded-lg bg-[var(--card)] w-28 focus:outline-none focus:border-[var(--blue-500)] min-h-8 ${focusRing}`}
      />
      <button
        type="submit"
        disabled={savingMonth}
        className={`px-3 py-1.5 text-xs font-bold bg-[var(--navy-900)] text-white rounded-lg hover:bg-[var(--navy-700)] cursor-pointer min-h-8 ${focusRing}`}
      >
        Add
      </button>
      <button
        type="button"
        onClick={() => setAddingMonth(false)}
        className={`px-2 py-1.5 text-xs text-[var(--muted)] cursor-pointer min-h-8 ${focusRing}`}
      >
        Cancel
      </button>
    </form>
  ) : (
    <button
      type="button"
      onClick={() => {
        setNewMonthInput(suggestedNextMonth);
        setAddingMonth(true);
      }}
      className={`ml-auto inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-[var(--ink)] bg-[var(--card)] border border-[var(--line)] rounded-lg hover:bg-[var(--frost-100)] cursor-pointer min-h-8 ${focusRing}`}
    >
      <CalendarPlus className="w-3.5 h-3.5 text-[var(--blue-500)]" />
      <span>New Month</span>
    </button>
  );

  return (
    <div className="bg-[var(--card)] rounded-2xl border border-white shadow-card overflow-hidden">
      <SheetTableToolbar
        periodNav={topPeriodNav}
        trailing={addMonthTrailing}
        hint="Jump months from the dropdown, step with Previous / Next, or open All months."
      />

      <div className="overflow-x-auto ledger-scroll">
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="bg-[var(--navy-900)] text-white">
              <th className="sticky left-0 z-20 bg-[var(--navy-900)] px-3 py-2 font-medium border-r border-white/15 min-w-[155px] whitespace-nowrap">
                Company Name *
              </th>
              <th className="px-3 py-2 font-medium border-r border-white/15 min-w-[120px] whitespace-nowrap">
                User ID *
              </th>
              <th className="px-3 py-2 font-medium border-r border-white/15 min-w-[130px] whitespace-nowrap">
                Password *
              </th>
              <th className="px-3 py-2 font-medium border-r border-white/15 min-w-[110px] whitespace-nowrap">
                Phone
              </th>
              <th className="px-3 py-2 font-medium border-r border-white/15 min-w-[95px] whitespace-nowrap">
                Ref No
              </th>
              <th className="px-3 py-2 font-medium border-r border-white/25 min-w-[140px] whitespace-nowrap">
                Remark
              </th>
              {visibleMonths.map((month) => {
                const isCurrentCol = month === currentMonth;
                return (
                  <th
                    key={month}
                    className={`px-2.5 py-2 font-medium border-r min-w-[152px] whitespace-nowrap ${
                      isCurrentCol && !showAllMonths
                        ? 'bg-[var(--navy-900)] text-white border-[var(--gold)]'
                        : 'bg-[var(--navy-700)] text-[var(--sidebar-text)] border-white/15'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[11px]">{month}</span>
                      {isCurrentCol && (
                        <span
                          className="px-1.5 py-0.5 rounded-full text-[10px] font-bold tracking-wide bg-[var(--navy-900)] text-white"
                        >
                          CURRENT
                        </span>
                      )}
                    </div>
                  </th>
                );
              })}
              <th className="sticky right-[188px] z-20 bg-[var(--navy-900)] px-2.5 py-2 font-medium text-right border-l border-r border-white/15 min-w-[110px] whitespace-nowrap">
                Total Received
              </th>
              <th className="sticky right-[82px] z-20 bg-[var(--navy-900)] px-2.5 py-2 font-medium text-right border-r border-white/15 min-w-[106px] whitespace-nowrap">
                Outstanding
              </th>
              <th className="sticky right-0 z-20 bg-[var(--navy-900)] px-2.5 py-2 font-medium text-right min-w-[82px] whitespace-nowrap">
                Action
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-[var(--line)]">
            {clients.map((company) => {
              const totals = computeGstClientTotals(company);

              return (
                <tr key={company.id} className="group hover:bg-[var(--frost-100)] align-top">
                  <td className="sticky left-0 z-10 bg-[var(--card)] group-hover:bg-[var(--sky-200)] px-3 py-3 font-medium text-[var(--ink)] border-r border-[var(--line)] whitespace-nowrap">
                    {company.companyName}
                  </td>

                  <td className="px-3 py-3 border-r border-[var(--line)] whitespace-nowrap">
                    <div className="inline-flex items-center gap-1 font-mono text-[var(--ink)]">
                      <span>{company.userId}</span>
                      <button
                        type="button"
                        onClick={() => copyValue(`guid-${company.id}`, company.userId)}
                        className={`p-1 text-[var(--muted)] hover:text-[var(--ink)] cursor-pointer min-h-8 min-w-8 inline-flex items-center justify-center ${focusRing}`}
                        title="Copy User ID"
                      >
                        {copiedKey === `guid-${company.id}` ? (
                          <Check className="w-3 h-3 text-[var(--success)]" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                    </div>
                  </td>

                  <td className="px-3 py-3 border-r border-[var(--line)] whitespace-nowrap">
                    <PortalPasswordCell
                      kind="gst"
                      id={company.id}
                      hasPassword={!!company.hasPortalPassword}
                    />
                  </td>

                  <td className="px-3 py-3 font-mono text-[var(--muted)] border-r border-[var(--line)] whitespace-nowrap">
                    {company.phone || '—'}
                  </td>

                  <td className="px-3 py-3 font-mono text-[var(--muted)] border-r border-[var(--line)] whitespace-nowrap">
                    {company.referenceNumber || '—'}
                  </td>

                  <td className="px-3 py-3 text-[var(--muted)] border-r border-[var(--line)] max-w-[200px]">
                    <span className="truncate block" title={company.remark}>
                      {company.remark || '—'}
                    </span>
                  </td>

                  {visibleMonths.map((month) => {
                    const f = company.filings?.[month];
                    const isCurrentCol = month === currentMonth;
                    const tint = isCurrentCol && !showAllMonths;
                    return (
                      <td
                        key={month}
                        className={`p-1.5 border-r border-[var(--line)] align-top ${
                          tint ? 'bg-[var(--frost-100)]' : ''
                        }`}
                      >
                        {f ? (
                          <button
                            type="button"
                            onClick={() => onEditCell(company, month, f)}
                            className={`w-full text-left p-2 rounded-lg border border-transparent transition-colors cursor-pointer space-y-0.5 min-h-8 ${focusRing} ${
                              tint
                                ? 'hover:bg-[var(--frost-100)] hover:border-[var(--gold)]'
                                : 'hover:bg-[var(--frost-100)] hover:border-[var(--line)]'
                            }`}
                          >
                            <div className="flex justify-between">
                              <span className="text-[var(--muted)]">fees</span>
                              <span className="font-mono text-[var(--ink)]">
                                ₹{formatPlainNumber(f.fees)}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-[var(--muted)]">inter</span>
                              <span className="font-mono text-[var(--muted)]">
                                ₹{formatPlainNumber(f.interest)}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-[var(--muted)]">tax</span>
                              <span className="font-mono text-[var(--muted)]">
                                ₹{formatPlainNumber(f.tax)}
                              </span>
                            </div>
                            <div className="flex justify-between border-t border-[var(--line)] pt-0.5 font-semibold">
                              <span className="text-[var(--ink)]">total</span>
                              <span className="font-mono text-[var(--ink)]">
                                ₹{formatPlainNumber(getFilingTotal(f))}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-[var(--muted)]">recd</span>
                              <span className="font-mono text-[var(--success)]">
                                ₹{formatPlainNumber(computeGstFilingReceived(f))}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-[var(--muted)]">out</span>
                              <span className="font-mono text-[var(--blue-500)]">
                                ₹{formatPlainNumber(computeGstFilingOutstanding(f))}
                              </span>
                            </div>
                            {gstFilingHasOverReceipt(f) && (
                              <div className="text-[10px] text-amber-800 pt-0.5">
                                Recd exceeds Total
                              </div>
                            )}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onEditCell(company, month)}
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

                  <td className="sticky right-[188px] z-10 bg-[var(--card)] group-hover:bg-[var(--frost-100)] px-2.5 py-3 text-right font-mono font-semibold text-sm text-[var(--success)] border-l border-r border-[var(--line)] tabular-nums whitespace-nowrap">
                    <div>₹{formatPlainNumber(totals.totalReceived)}</div>
                    {totals.unallocatedReceived > 0 && (
                      <div className="text-[10px] font-medium text-[var(--muted)] normal-case tracking-normal whitespace-normal">
                        {GST_UNALLOCATED_LABEL} ₹
                        {formatPlainNumber(totals.unallocatedReceived)}
                      </div>
                    )}
                  </td>

                  <td
                    className={`sticky right-[82px] z-10 bg-[var(--card)] group-hover:bg-[var(--frost-100)] px-2.5 py-3 text-right font-mono font-semibold text-sm border-r border-[var(--line)] tabular-nums whitespace-nowrap ${
                      totals.outstandingTotal > 0 ? 'text-[var(--blue-500)]' : 'text-[var(--ink)]'
                    }`}
                  >
                    <div>₹{formatPlainNumber(totals.outstandingTotal)}</div>
                    {totals.unallocatedReceived > 0 && (
                      <div
                        className="text-[10px] font-medium text-[var(--muted)] normal-case tracking-normal whitespace-normal text-right"
                        title={GST_OUTSTANDING_UNALLOCATED_EXPLAIN}
                      >
                        Incl. unallocated in company total
                      </div>
                    )}
                  </td>

                  <td className="sticky right-0 z-10 has-[[aria-expanded=true]]:z-50 bg-[var(--card)] group-hover:bg-[var(--frost-100)] px-2.5 py-3 text-right whitespace-nowrap overflow-visible">
                    <CompanyRowMenu
                      onEditDetails={() => onEditCompany(company)}
                      onViewHistory={() => onViewHistory(company)}
                      onDelete={() => onDeleteCompany(company.id)}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <TableFooterBar>{bottomPeriodNav}</TableFooterBar>
    </div>
  );
}
