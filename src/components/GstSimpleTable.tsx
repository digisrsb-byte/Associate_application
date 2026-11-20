import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  LayoutGrid,
  Plus,
  RotateCcw,
} from 'lucide-react';
import type { GstClientRecord, GstMonthlyFiling } from '../types/ledger.ts';
import {
  computeGstClientTotals,
  computeGstFilingTotal,
  extractMonthOrderKey,
  formatPlainNumber,
  getNextGstMonth,
  normalizeGstMonthLabel,
  sortGstMonths,
} from '../utils/ledgerUtils.ts';
import { CompanyRowMenu } from './CompanyRowMenu.tsx';
import { PortalPasswordCell } from './PortalPasswordCell.tsx';

interface GstSimpleTableProps {
  clients: GstClientRecord[];
  availableMonths: string[];
  onEditCompany: (company: GstClientRecord) => void;
  onViewHistory: (company: GstClientRecord) => void;
  onDeleteCompany: (companyId: string) => Promise<void>;
  onSaveFiling: (companyId: string, filing: GstMonthlyFiling) => Promise<void>;
  onDeleteFiling: (companyId: string, month: string) => Promise<void>;
  onOpenQuickEdit: (company: GstClientRecord, month: string, existing?: GstMonthlyFiling) => void;
  onAddCompanyClick: () => void;
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

function shortMonthLabel(month: string): string {
  const match = month.trim().match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (match) return `${match[1].slice(0, 3)} ${match[2].slice(2)}`;
  return month;
}

const focusRing =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--blue-500)]';

const pillBtn =
  'inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[var(--ink)] bg-[var(--card)] border border-[var(--line)] rounded-full hover:bg-[var(--frost-100)] cursor-pointer min-h-8 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm';

export function GstSimpleTable({
  clients,
  availableMonths,
  onEditCompany,
  onViewHistory,
  onDeleteCompany,
  onSaveFiling,
  onDeleteFiling,
  onOpenQuickEdit,
  onAddCompanyClick,
}: GstSimpleTableProps) {
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [showAllMonths, setShowAllMonths] = useState(false);
  const [monthMenuOpen, setMonthMenuOpen] = useState(false);
  const monthMenuRef = useRef<HTMLDivElement | null>(null);

  const [inlineDrafts, setInlineDrafts] = useState<
    Record<
      string,
      {
        month: string;
        fees: string;
        interest: string;
        tax: string;
      }
    >
  >({});
  const [savingCompanyId, setSavingCompanyId] = useState<string | null>(null);

  const sortedMonths = useMemo(
    () => sortGstMonths(availableMonths),
    [availableMonths]
  );

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
  const prevMonth = canGoPrev ? sortedMonths[activeMonthIndex - 1] : '';
  const nextMonth = canGoNext ? sortedMonths[activeMonthIndex + 1] : '';

  const monthsNewestFirst = useMemo(
    () => [...sortedMonths].reverse(),
    [sortedMonths]
  );

  const monthsWithBilled = useMemo(() => {
    const billed = new Set<string>();
    for (const month of sortedMonths) {
      for (const company of clients) {
        const f = company.filings?.[month];
        if (f && computeGstFilingTotal(Number(f.fees) || 0, Number(f.interest) || 0, Number(f.tax) || 0) > 0) {
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

  const goPrev = () => {
    if (!canGoPrev) return;
    setShowAllMonths(false);
    setSelectedMonth(sortedMonths[activeMonthIndex - 1]);
    setMonthMenuOpen(false);
  };

  const goNext = () => {
    if (!canGoNext) return;
    setShowAllMonths(false);
    setSelectedMonth(sortedMonths[activeMonthIndex + 1]);
    setMonthMenuOpen(false);
  };

  const backToCurrent = () => {
    setShowAllMonths(false);
    setSelectedMonth(currentMonth);
    setMonthMenuOpen(false);
  };

  const onMonthSelect = (month: string) => {
    if (!month) return;
    setShowAllMonths(false);
    setSelectedMonth(month);
    setMonthMenuOpen(false);
  };

  const toggleExpand = (company: GstClientRecord) => {
    setExpandedIds((prev) => {
      const next = !prev[company.id];
      if (next && !inlineDrafts[company.id]) {
        const companyMonths = sortGstMonths(
          Object.keys(company.filings || {}).filter((m) => availableMonths.includes(m))
        );
        const nextMonth =
          !showAllMonths && activeMonth
            ? activeMonth
            : companyMonths.length > 0
              ? getNextGstMonth(companyMonths)
              : availableMonths[0] || 'Apr 2026';
        setInlineDrafts((d) => ({
          ...d,
          [company.id]: {
            month: nextMonth,
            fees: '',
            interest: '',
            tax: '',
          },
        }));
      }
      return { ...prev, [company.id]: next };
    });
  };

  const updateDraft = (
    companyId: string,
    field: 'month' | 'fees' | 'interest' | 'tax',
    value: string
  ) => {
    setInlineDrafts((prev) => ({
      ...prev,
      [companyId]: {
        ...(prev[companyId] || {
          month: 'Apr 2026',
          fees: '',
          interest: '',
          tax: '',
        }),
        [field]: value,
      },
    }));
  };

  const handleInlineAddFiling = async (e: React.FormEvent, company: GstClientRecord) => {
    e.preventDefault();
    const draft = inlineDrafts[company.id];
    if (!draft) return;
    const normalizedMonth = normalizeGstMonthLabel(draft.month);
    if (!normalizedMonth) return;

    const fees = Math.max(0, Number(draft.fees) || 0);
    const interest = Math.max(0, Number(draft.interest) || 0);
    const tax = Math.max(0, Number(draft.tax) || 0);
    const total = computeGstFilingTotal(fees, interest, tax);

    setSavingCompanyId(company.id);
    try {
      await onSaveFiling(company.id, {
        month: normalizedMonth,
        fees,
        interest,
        tax,
        total,
      });

      const nextM = getNextGstMonth([
        ...Object.keys(company.filings || {}),
        normalizedMonth,
      ]);
      setInlineDrafts((prev) => ({
        ...prev,
        [company.id]: {
          month: nextM,
          fees: '',
          interest: '',
          tax: '',
        },
      }));
    } finally {
      setSavingCompanyId(null);
    }
  };

  const copyValue = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey((c) => (c === key ? null : c)), 1400);
    } catch {
      // Clipboard blocked
    }
  };

  if (clients.length === 0) {
    return (
      <div className="bg-[var(--card)] rounded-2xl border border-white shadow-card px-6 py-14 text-center">
        <h2 className="font-display text-lg font-semibold text-[var(--ink)]">
          No GST company records yet
        </h2>
        <p className="mt-1.5 text-sm text-[var(--muted)] max-w-md mx-auto">
          Add your GST company with Company Name, User ID, Password, Ref No, Remark, and Monthly Filing (Fees, Interest, Tax, Total).
        </p>
        <button
          type="button"
          onClick={onAddCompanyClick}
          className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-white bg-[var(--navy-900)] hover:bg-[var(--navy-700)] rounded-xl transition-colors cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Add GST Company</span>
        </button>
      </div>
    );
  }

  return (
    <div className="bg-[var(--card)] rounded-2xl border border-white shadow-card overflow-hidden">
      <div className="px-4 py-3 border-b border-[var(--line)] bg-[var(--frost-100)] flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex items-center gap-1">
          <button
            type="button"
            onClick={goPrev}
            disabled={!canGoPrev || showAllMonths}
            aria-label="Previous month"
            className={`p-2 rounded-full border border-[var(--line)] bg-[var(--card)] text-[var(--ink)] hover:bg-[var(--frost-100)] cursor-pointer min-h-8 min-w-8 inline-flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed shadow-sm ${focusRing}`}
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

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

          <button
            type="button"
            onClick={goNext}
            disabled={!canGoNext || showAllMonths}
            aria-label="Next month"
            className={`p-2 rounded-full border border-[var(--line)] bg-[var(--card)] text-[var(--ink)] hover:bg-[var(--frost-100)] cursor-pointer min-h-8 min-w-8 inline-flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed shadow-sm ${focusRing}`}
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className="inline-flex items-center gap-2">
          <button
            type="button"
            onClick={backToCurrent}
            disabled={isViewingCurrent && !showAllMonths}
            className={`${pillBtn} ${focusRing}`}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Current</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setShowAllMonths(true);
              setMonthMenuOpen(false);
            }}
            aria-pressed={showAllMonths}
            className={`${pillBtn} ${focusRing} ${
              showAllMonths ? 'bg-[var(--navy-900)] text-white border-[var(--navy-900)] hover:bg-[var(--navy-700)]' : ''
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span>All months</span>
          </button>
        </div>
      </div>

      <div className="overflow-x-auto ledger-scroll">
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="bg-[var(--navy-900)] text-white text-[11px]">
              <th className="pl-2.5 pr-1 py-3 font-medium w-7" />
              <th className="px-2.5 py-3 font-medium whitespace-nowrap">Company Name *</th>
              <th className="px-2.5 py-3 font-medium whitespace-nowrap">User ID *</th>
              <th className="px-2.5 py-3 font-medium whitespace-nowrap">Password *</th>
              <th className="px-2.5 py-3 font-medium whitespace-nowrap">Phone</th>
              <th className="px-2.5 py-3 font-medium whitespace-nowrap">Ref No</th>
              <th className="px-2.5 py-3 font-medium whitespace-nowrap">Remark</th>
              <th className="px-2.5 py-3 font-medium whitespace-nowrap">Monthly Filing</th>
              <th className="px-2.5 py-3 font-medium text-right whitespace-nowrap">Total Recd</th>
              <th className="px-2.5 py-3 font-medium text-right whitespace-nowrap">Outstanding</th>
              <th className="px-3 py-3 font-medium text-right whitespace-nowrap">Action</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-[var(--line)]">
            {clients.map((company) => {
              const isExpanded = Boolean(expandedIds[company.id]);
              const totals = computeGstClientTotals(company);
              const allCompanyMonths = sortGstMonths(
                Object.keys(company.filings || {}).filter((m) =>
                  availableMonths.length === 0
                    ? true
                    : availableMonths.includes(m)
                )
              );
              const companyMonths =
                !showAllMonths && activeMonth
                  ? allCompanyMonths.filter((m) => m === activeMonth)
                  : allCompanyMonths;
              const draft = inlineDrafts[company.id];
              const draftFees = Math.max(0, Number(draft?.fees) || 0);
              const draftInt = Math.max(0, Number(draft?.interest) || 0);
              const draftTax = Math.max(0, Number(draft?.tax) || 0);
              const draftTotal = computeGstFilingTotal(draftFees, draftInt, draftTax);

              return (
                <Fragment key={company.id}>
                  <tr className="group ledger-row-motion hover:bg-[var(--frost-100)]">
                    <td className="pl-2.5 pr-1 py-2.5 text-center">
                      <button
                        type="button"
                        onClick={() => toggleExpand(company)}
                        className="p-0.5 text-[var(--muted)] hover:text-[var(--ink)] rounded cursor-pointer"
                        aria-label={isExpanded ? 'Collapse monthly filings' : 'Expand monthly filings'}
                      >
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4" />
                        ) : (
                          <ChevronRight className="w-4 h-4" />
                        )}
                      </button>
                    </td>

                    <td className="px-2.5 py-2.5 font-medium text-[var(--ink)] whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => toggleExpand(company)}
                        className="hover:text-[var(--blue-500)] hover:underline text-left cursor-pointer"
                      >
                        {company.companyName}
                      </button>
                    </td>

                    <td className="px-2.5 py-2.5 whitespace-nowrap">
                      <div className="inline-flex items-center gap-1 font-mono text-[11px] text-[var(--ink)]">
                        <span>{company.userId}</span>
                        <button
                          type="button"
                          onClick={() => copyValue(`uid-${company.id}`, company.userId)}
                          className="p-0.5 text-[var(--muted)] hover:text-[var(--ink)] cursor-pointer"
                          title="Copy User ID"
                        >
                          {copiedKey === `uid-${company.id}` ? (
                            <Check className="w-3 h-3 text-[var(--success)]" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      </div>
                    </td>

                    <td className="px-2.5 py-2.5 whitespace-nowrap">
                      <PortalPasswordCell
                        kind="gst"
                        id={company.id}
                        hasPassword={!!company.hasPortalPassword}
                      />
                    </td>

                    <td className="px-2.5 py-2.5 font-mono text-[11px] text-[var(--muted)] whitespace-nowrap">
                      {company.phone || '—'}
                    </td>

                    <td className="px-2.5 py-2.5 font-mono text-[11px] text-[var(--muted)] whitespace-nowrap">
                      {company.referenceNumber || '—'}
                    </td>

                    <td className="px-2.5 py-2.5 text-[11px] text-[var(--muted)] max-w-[180px]">
                      <span className="truncate block" title={company.remark}>
                        {company.remark || '—'}
                      </span>
                    </td>

                    <td className="px-2.5 py-2.5 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => toggleExpand(company)}
                        className="text-[11px] font-semibold text-[var(--blue-500)] hover:text-[var(--ink)] hover:underline cursor-pointer"
                      >
                        {companyMonths.length === 0
                          ? '+ Add Month'
                          : `${companyMonths.length} ${companyMonths.length === 1 ? 'Month' : 'Months'} · ₹${formatPlainNumber(totals.totalBilled)}`}
                      </button>
                    </td>

                    <td className="px-2.5 py-2.5 text-right font-mono text-xs font-semibold text-[var(--success)] tabular-nums whitespace-nowrap">
                      ₹{formatPlainNumber(totals.totalReceived)}
                    </td>

                    <td
                      className={`px-2.5 py-2.5 text-right font-mono text-xs font-semibold tabular-nums whitespace-nowrap ${
                        totals.outstandingTotal > 0 ? 'text-[var(--blue-500)]' : 'text-[var(--ink)]'
                      }`}
                    >
                      ₹{formatPlainNumber(totals.outstandingTotal)}
                    </td>

                    <td className="relative z-10 has-[[aria-expanded=true]]:z-50 px-3 py-2.5 text-right whitespace-nowrap overflow-visible">
                      <CompanyRowMenu
                        onEditDetails={() => onEditCompany(company)}
                        onViewHistory={() => onViewHistory(company)}
                        onDelete={() => onDeleteCompany(company.id)}
                      />
                    </td>
                  </tr>

                  {isExpanded && (
                    <tr className="bg-[var(--frost-100)]">
                      <td colSpan={11} className="px-3 py-2.5 border-t border-[var(--line)]">
                        <div className="bg-[var(--card)] border border-[var(--line)] rounded-xl overflow-hidden shadow-xs">
                          <div className="overflow-x-auto">
                            <table className="w-full border-collapse text-left text-[11px] sm:text-xs">
                              <thead>
                                <tr className="bg-[var(--navy-900)] text-white border-b border-[var(--line)]">
                                  <th className="px-3 py-2 font-semibold whitespace-nowrap">Month</th>
                                  <th className="px-2.5 py-2 font-semibold text-right whitespace-nowrap">Fees (₹)</th>
                                  <th className="px-2.5 py-2 font-semibold text-right whitespace-nowrap">Interest (₹)</th>
                                  <th className="px-2.5 py-2 font-semibold text-right whitespace-nowrap">Tax (₹)</th>
                                  <th className="px-2.5 py-2 font-semibold text-right whitespace-nowrap">Total (₹)</th>
                                  <th className="px-3 py-2 font-semibold text-right whitespace-nowrap">Action</th>
                                </tr>
                              </thead>

                              <tbody className="divide-y divide-[var(--line)]">
                                {companyMonths.map((m) => {
                                  const f = company.filings[m];
                                  return (
                                    <tr key={m} className="hover:bg-[var(--frost-100)]">
                                      <td className="px-3 py-2 font-mono font-semibold text-[var(--ink)] whitespace-nowrap">
                                        {m}
                                      </td>
                                      <td className="px-2.5 py-2 text-right font-mono text-[var(--ink)] tabular-nums whitespace-nowrap">
                                        ₹{formatPlainNumber(f.fees)}
                                      </td>
                                      <td className="px-2.5 py-2 text-right font-mono text-[var(--muted)] tabular-nums whitespace-nowrap">
                                        ₹{formatPlainNumber(f.interest)}
                                      </td>
                                      <td className="px-2.5 py-2 text-right font-mono text-[var(--muted)] tabular-nums whitespace-nowrap">
                                        ₹{formatPlainNumber(f.tax)}
                                      </td>
                                      <td className="px-2.5 py-2 text-right font-mono font-semibold text-[var(--ink)] tabular-nums whitespace-nowrap">
                                        ₹{formatPlainNumber(f.total)}
                                      </td>
                                      <td className="px-3 py-2 text-right whitespace-nowrap">
                                        <button
                                          type="button"
                                          onClick={() => onOpenQuickEdit(company, m, f)}
                                          className="px-1.5 py-0.5 text-[11px] font-semibold text-[var(--ink)] hover:underline cursor-pointer"
                                        >
                                          Edit
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => void onDeleteFiling(company.id, m)}
                                          className="px-1.5 py-0.5 text-[11px] text-[var(--danger)] hover:underline cursor-pointer"
                                        >
                                          Remove
                                        </button>
                                      </td>
                                    </tr>
                                  );
                                })}

                                <tr className="bg-[var(--frost-100)] border-t border-[var(--line)]">
                                  <td className="px-2 py-2">
                                    <input
                                      type="text"
                                      list="gst-inline-months-list"
                                      value={draft?.month || ''}
                                      onChange={(e) => updateDraft(company.id, 'month', e.target.value)}
                                      placeholder="Apr 2026"
                                      className="w-[90px] px-2 py-1 text-[11px] font-mono bg-[var(--card)] border border-[var(--line)] rounded-lg focus:outline-none focus:border-[var(--blue-500)]"
                                    />
                                  </td>
                                  <td className="px-2 py-2 text-right">
                                    <input
                                      type="number"
                                      min={0}
                                      value={draft?.fees || ''}
                                      onChange={(e) => updateDraft(company.id, 'fees', e.target.value)}
                                      placeholder="Fees"
                                      className="w-[76px] px-2 py-1 text-[11px] font-mono text-right bg-[var(--card)] border border-[var(--line)] rounded-lg focus:outline-none focus:border-[var(--blue-500)]"
                                    />
                                  </td>
                                  <td className="px-2 py-2 text-right">
                                    <input
                                      type="number"
                                      min={0}
                                      value={draft?.interest || ''}
                                      onChange={(e) =>
                                        updateDraft(company.id, 'interest', e.target.value)
                                      }
                                      placeholder="Interest"
                                      className="w-[76px] px-2 py-1 text-[11px] font-mono text-right bg-[var(--card)] border border-[var(--line)] rounded-lg focus:outline-none focus:border-[var(--blue-500)]"
                                    />
                                  </td>
                                  <td className="px-2 py-2 text-right">
                                    <input
                                      type="number"
                                      min={0}
                                      value={draft?.tax || ''}
                                      onChange={(e) => updateDraft(company.id, 'tax', e.target.value)}
                                      placeholder="Tax"
                                      className="w-[76px] px-2 py-1 text-[11px] font-mono text-right bg-[var(--card)] border border-[var(--line)] rounded-lg focus:outline-none focus:border-[var(--blue-500)]"
                                    />
                                  </td>
                                  <td className="px-2.5 py-2 text-right font-mono font-semibold text-[var(--ink)] tabular-nums whitespace-nowrap">
                                    ₹{formatPlainNumber(draftTotal)}
                                  </td>
                                  <td className="px-2 py-2 text-right">
                                    <button
                                      type="button"
                                      disabled={savingCompanyId === company.id}
                                      onClick={(e) => void handleInlineAddFiling(e, company)}
                                      className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-white bg-[var(--navy-900)] hover:bg-[var(--navy-700)] rounded-lg whitespace-nowrap cursor-pointer disabled:opacity-60"
                                    >
                                      <Plus className="w-3 h-3" />
                                      <span>
                                        {savingCompanyId === company.id ? 'Saving...' : 'Save Month'}
                                      </span>
                                    </button>
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                          <datalist id="gst-inline-months-list">
                            {availableMonths.map((m) => (
                              <option key={m} value={m} />
                            ))}
                          </datalist>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="px-4 py-3 border-t border-[var(--line)] bg-[var(--frost-100)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={goPrev}
            disabled={!canGoPrev || showAllMonths}
            className={`${pillBtn} ${focusRing}`}
          >
            <span>‹ Previous{prevMonth ? ` · ${shortMonthLabel(prevMonth)}` : ''}</span>
          </button>

          <button
            type="button"
            onClick={goNext}
            disabled={!canGoNext || showAllMonths}
            className={`${pillBtn} ${focusRing}`}
          >
            <span>Next{nextMonth ? ` · ${shortMonthLabel(nextMonth)}` : ''} ›</span>
          </button>
        </div>
      </div>
    </div>
  );
}
