import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  LayoutGrid,
  Plus,
} from 'lucide-react';
import type { ClientRecord, FilingRecord } from '../types/ledger.ts';
import { PAYMENT_TYPES } from '../types/ledger.ts';
import {
  computeBalance,
  computeClientTotals,
  extractYearOrderKey,
  formatDisplayDate,
  formatPlainNumber,
  getNextAssessmentYear,
  normalizeAssessmentYearLabel,
  sortAssessmentYears,
} from '../utils/ledgerUtils.ts';
import { PortalPasswordCell } from './PortalPasswordCell.tsx';
import { CompanyRowMenu } from './CompanyRowMenu.tsx';
import { LimeSelect } from './LimeSelect.tsx';
import {
  BottomPeriodNavigator,
  TopPeriodNavigator,
} from './shared/PeriodNavigator.tsx';
import {
  SimpleTableToolbar,
  TableFooterBar,
} from './shared/SheetTableToolbar.tsx';
import { TABLE_FOCUS_RING } from './shared/tableStyles.ts';
import { useIsCompactLayout } from '../hooks/useMediaQuery.ts';
import { ItClientMobileList } from './mobile/ItClientMobileList.tsx';
import { ConfirmDangerButton } from './mobile/ConfirmDangerButton.tsx';

interface SimpleClientTableProps {
  clients: ClientRecord[];
  availableYears: string[];
  onEditClient: (client: ClientRecord) => void;
  onViewHistory: (client: ClientRecord) => void;
  onDeleteClient: (clientId: string) => Promise<void>;
  onSaveFiling: (clientId: string, filing: FilingRecord) => Promise<void>;
  onDeleteFiling: (clientId: string, year: string) => Promise<void>;
  onOpenQuickEdit: (client: ClientRecord, year: string, existing?: FilingRecord) => void;
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

function shortAyLabel(year: string): string {
  const match = year.match(/(\d{4})\s*[-/]\s*(\d{2})/);
  if (match) return `${match[1].slice(2)}-${match[2]}`;
  return year.replace(/^AY\s+/i, '');
}

const focusRing = TABLE_FOCUS_RING;

export function SimpleClientTable({
  clients,
  availableYears,
  onEditClient,
  onViewHistory,
  onDeleteClient,
  onSaveFiling,
  onDeleteFiling,
  onOpenQuickEdit,
  onAddClientClick,
}: SimpleClientTableProps) {
  const isCompact = useIsCompactLayout();
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [showAllYears, setShowAllYears] = useState(false);
  const [yearMenuOpen, setYearMenuOpen] = useState(false);
  const yearMenuRef = useRef<HTMLDivElement | null>(null);

  const [inlineDrafts, setInlineDrafts] = useState<
    Record<
      string,
      {
        year: string;
        filingDate: string;
        fees: string;
        received: string;
        paymentType: string;
        paymentReceiveDate: string;
      }
    >
  >({});
  const [savingClientId, setSavingClientId] = useState<string | null>(null);
  /** Inline Fees/Received edits — key = `${clientId}::${year}`. */
  const [moneyEdits, setMoneyEdits] = useState<
    Record<string, { fees: string; received: string }>
  >({});
  const [savingMoneyKey, setSavingMoneyKey] = useState<string | null>(null);

  const moneyKey = (clientId: string, year: string) => `${clientId}::${year}`;

  const getMoneyEdit = (clientId: string, year: string, filing: FilingRecord) => {
    const key = moneyKey(clientId, year);
    return (
      moneyEdits[key] ?? {
        fees: String(filing.fees ?? 0),
        received: String(filing.received ?? 0),
      }
    );
  };

  const updateMoneyEdit = (
    clientId: string,
    year: string,
    filing: FilingRecord,
    field: 'fees' | 'received',
    value: string
  ) => {
    const key = moneyKey(clientId, year);
    setMoneyEdits((prev) => ({
      ...prev,
      [key]: {
        ...(prev[key] ?? {
          fees: String(filing.fees ?? 0),
          received: String(filing.received ?? 0),
        }),
        [field]: value,
      },
    }));
  };

  const isMoneyDirty = (
    clientId: string,
    year: string,
    filing: FilingRecord
  ) => {
    const edit = moneyEdits[moneyKey(clientId, year)];
    if (!edit) return false;
    return (
      Math.max(0, Number(edit.fees) || 0) !== Math.max(0, Number(filing.fees) || 0) ||
      Math.max(0, Number(edit.received) || 0) !==
        Math.max(0, Number(filing.received) || 0)
    );
  };

  const handleSaveMoney = async (
    client: ClientRecord,
    year: string,
    filing: FilingRecord,
    override?: { fees: number; received: number }
  ) => {
    const edit = getMoneyEdit(client.id, year, filing);
    const fees = override
      ? override.fees
      : Math.max(0, Number(edit.fees) || 0);
    const received = override
      ? override.received
      : Math.max(0, Number(edit.received) || 0);
    const key = moneyKey(client.id, year);
    setSavingMoneyKey(key);
    try {
      await onSaveFiling(client.id, {
        assessmentYear: year,
        filingDate: filing.filingDate || '',
        fees,
        received,
        balance: computeBalance(fees, received),
        paymentType: filing.paymentType || 'GPay',
        paymentReceiveDate: filing.paymentReceiveDate || '',
      });
      setMoneyEdits((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    } finally {
      setSavingMoneyKey(null);
    }
  };

  const inlineNumClass =
    'w-[68px] px-1.5 py-1 text-[11px] font-mono text-right bg-[var(--card)] border border-[var(--line)] rounded-lg focus:outline-none focus:border-[var(--blue-500)]';
  const inlineDateClass =
    'w-[114px] px-1.5 py-1 text-[11px] font-mono bg-[var(--card)] border border-[var(--line)] rounded-lg focus:outline-none focus:border-[var(--blue-500)]';

  const sortedYears = useMemo(
    () => sortAssessmentYears(availableYears),
    [availableYears]
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
  const prevYear = canGoPrev ? sortedYears[activeYearIndex - 1] : '';
  const nextYear = canGoNext ? sortedYears[activeYearIndex + 1] : '';

  const yearsNewestFirst = useMemo(
    () => [...sortedYears].reverse(),
    [sortedYears]
  );

  const yearsWithDue = useMemo(() => {
    const due = new Set<string>();
    for (const year of sortedYears) {
      for (const client of clients) {
        const f = client.filings?.[year];
        if (f && (Number(f.balance) || 0) > 0) {
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

  const goPrev = () => {
    if (!canGoPrev) return;
    setShowAllYears(false);
    setSelectedYear(sortedYears[activeYearIndex - 1]);
    setYearMenuOpen(false);
  };

  const goNext = () => {
    if (!canGoNext) return;
    setShowAllYears(false);
    setSelectedYear(sortedYears[activeYearIndex + 1]);
    setYearMenuOpen(false);
  };

  const backToCurrent = () => {
    setShowAllYears(false);
    setSelectedYear(currentYear);
    setYearMenuOpen(false);
  };

  const onYearSelect = (year: string) => {
    if (!year) return;
    setShowAllYears(false);
    setSelectedYear(year);
    setYearMenuOpen(false);
  };

  const toggleExpand = (client: ClientRecord) => {
    setExpandedIds((prev) => {
      const next = !prev[client.id];
      if (next && !inlineDrafts[client.id]) {
        const clientYears = sortAssessmentYears(Object.keys(client.filings || {}));
        const nextYear =
          !showAllYears && activeYear
            ? activeYear
            : getNextAssessmentYear(
                clientYears.length > 0 ? clientYears : availableYears.slice(0, -1)
              );
        setInlineDrafts((d) => ({
          ...d,
          [client.id]: {
            year: nextYear,
            filingDate: '',
            fees: '',
            received: '',
            paymentType: 'GPay',
            paymentReceiveDate: '',
          },
        }));
      }
      return { ...prev, [client.id]: next };
    });
  };

  const updateDraft = (
    clientId: string,
    field: 'year' | 'filingDate' | 'fees' | 'received' | 'paymentType' | 'paymentReceiveDate',
    value: string
  ) => {
    setInlineDrafts((prev) => ({
      ...prev,
      [clientId]: {
        ...(prev[clientId] || {
          year: 'AY 2026-27',
          filingDate: '',
          fees: '',
          received: '',
          paymentType: 'GPay',
          paymentReceiveDate: '',
        }),
        [field]: value,
      },
    }));
  };

  const handleInlineAddFiling = async (e: React.FormEvent, client: ClientRecord) => {
    e.preventDefault();
    const draft = inlineDrafts[client.id];
    if (!draft) return;
    const normalizedYear = normalizeAssessmentYearLabel(draft.year);
    if (!normalizedYear) return;

    const fees = Math.max(0, Number(draft.fees) || 0);
    const received = Math.max(0, Number(draft.received) || 0);

    setSavingClientId(client.id);
    try {
      await onSaveFiling(client.id, {
        assessmentYear: normalizedYear,
        filingDate: draft.filingDate.trim(),
        fees,
        received,
        balance: computeBalance(fees, received),
        paymentType: draft.paymentType.trim(),
        paymentReceiveDate: draft.paymentReceiveDate.trim(),
      });

      const nextYr = getNextAssessmentYear([
        ...Object.keys(client.filings || {}),
        normalizedYear,
      ]);
      setInlineDrafts((prev) => ({
        ...prev,
        [client.id]: {
          year: nextYr,
          filingDate: '',
          fees: '',
          received: '',
          paymentType: 'GPay',
          paymentReceiveDate: '',
        },
      }));
    } finally {
      setSavingClientId(null);
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
          No client records yet
        </h2>
        <p className="mt-1.5 text-sm text-[var(--muted)] max-w-md mx-auto">
          Add your first client with Name, PAN, and Password, then record continuous Filing Date fees, received amounts, balance outstanding, payment type, and payment receive dates.
        </p>
        <button
          type="button"
          onClick={onAddClientClick}
          className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-white bg-[var(--navy-900)] hover:bg-[var(--navy-700)] rounded-xl transition-colors cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Add First Client</span>
        </button>
      </div>
    );
  }

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

  return (
    <div className="bg-[var(--card)] rounded-2xl border border-white shadow-card overflow-hidden">
      <SimpleTableToolbar>
        <TopPeriodNavigator
          layout="split"
          canPrev={canGoPrev}
          canNext={canGoNext}
          showAll={showAllYears}
          isViewingCurrent={isViewingCurrent}
          onPrev={goPrev}
          onNext={goNext}
          onCurrent={backToCurrent}
          onShowAll={() => {
            setShowAllYears(true);
            setYearMenuOpen(false);
          }}
          prevAriaLabel="Previous year"
          nextAriaLabel="Next year"
          allLabel="All years"
          periodSlot={yearDropdown}
        />
      </SimpleTableToolbar>

      {isCompact ? (
        <ItClientMobileList
          clients={clients}
          availableYears={availableYears}
          showAllYears={showAllYears}
          activeYear={activeYear}
          onEditClient={onEditClient}
          onViewHistory={onViewHistory}
          onDeleteClient={onDeleteClient}
          onDeleteFiling={onDeleteFiling}
          onOpenQuickEdit={onOpenQuickEdit}
        />
      ) : (
      <div className="overflow-x-auto ledger-scroll">
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="bg-[var(--navy-900)] text-white text-[11px]">
              <th className="pl-2.5 pr-1 py-3 font-medium w-7" />
              <th className="px-2 py-3 font-medium whitespace-nowrap">Name *</th>
              <th className="px-2 py-3 font-medium whitespace-nowrap">PAN *</th>
              <th className="px-2 py-3 font-medium whitespace-nowrap">Password *</th>
              <th className="px-2 py-3 font-medium whitespace-nowrap">Phone</th>
              <th className="px-2 py-3 font-medium whitespace-nowrap">Ref No</th>
              <th className="px-2 py-3 font-medium whitespace-nowrap">Remark</th>
              <th className="px-2 py-3 font-medium whitespace-nowrap">Years</th>
              <th className="px-2 py-3 font-medium text-right whitespace-nowrap">Total Recd</th>
              <th className="px-2 py-3 font-medium text-right whitespace-nowrap">Outstanding</th>
              <th className="px-2.5 py-3 font-medium text-right whitespace-nowrap">Actions</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-[var(--line)]">
            {clients.map((client) => {
              const isExpanded = Boolean(expandedIds[client.id]);
              const totals = computeClientTotals(client);
              const allClientYears = sortAssessmentYears(Object.keys(client.filings || {}));
              const clientYears =
                !showAllYears && activeYear
                  ? allClientYears.filter((y) => y === activeYear)
                  : allClientYears;
              const draft = inlineDrafts[client.id];
              const draftFees = Math.max(0, Number(draft?.fees) || 0);
              const draftRecd = Math.max(0, Number(draft?.received) || 0);
              const draftBal = computeBalance(draftFees, draftRecd);

              const yearsTitle =
                clientYears.length > 0
                  ? `${clientYears[0]} – ${clientYears[clientYears.length - 1]}`
                  : 'Add filing year';

              return (
                <Fragment key={client.id}>
                  <tr className="group ledger-row-motion hover:bg-[var(--frost-100)]">
                    <td className="pl-2.5 pr-1 py-2.5 text-center">
                      <button
                        type="button"
                        onClick={() => toggleExpand(client)}
                        className="p-0.5 text-[var(--muted)] hover:text-[var(--ink)] rounded cursor-pointer"
                        aria-label={isExpanded ? 'Collapse filing years' : 'Expand filing years'}
                      >
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4" />
                        ) : (
                          <ChevronRight className="w-4 h-4" />
                        )}
                      </button>
                    </td>

                    <td className="px-2 py-2.5 font-medium text-[var(--ink)] whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => toggleExpand(client)}
                        className="hover:text-[var(--blue-500)] hover:underline text-left cursor-pointer"
                      >
                        {client.name}
                      </button>
                    </td>

                    <td className="px-2 py-2.5 whitespace-nowrap">
                      <div className="inline-flex items-center gap-1 font-mono text-[11px] text-[var(--ink)]">
                        <span>{client.pan}</span>
                        <button
                          type="button"
                          onClick={() => copyValue(`pan-${client.id}`, client.pan)}
                          className="p-0.5 text-[var(--muted)] hover:text-[var(--ink)] cursor-pointer"
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

                    <td className="px-2 py-2.5 whitespace-nowrap">
                      <PortalPasswordCell
                        kind="it"
                        id={client.id}
                        hasPassword={!!client.hasPortalPassword}
                      />
                    </td>

                    <td className="px-2 py-2.5 font-mono text-[11px] text-[var(--muted)] tabular-nums whitespace-nowrap">
                      {client.phone || '—'}
                    </td>

                    <td className="px-2 py-2.5 font-mono text-[11px] text-[var(--muted)] whitespace-nowrap">
                      {client.referenceNumber || '—'}
                    </td>

                    <td className="px-2 py-2.5 text-[11px] text-[var(--muted)] max-w-[155px] xl:max-w-[190px]">
                      <span className="truncate block" title={client.remark}>
                        {client.remark || '—'}
                      </span>
                    </td>

                    <td className="px-2 py-2.5 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => toggleExpand(client)}
                        title={yearsTitle}
                        className="text-[11px] font-semibold text-[var(--blue-500)] hover:text-[var(--ink)] hover:underline cursor-pointer"
                      >
                        {clientYears.length === 0
                          ? '+ Add'
                          : `${clientYears.length} ${clientYears.length === 1 ? 'Yr' : 'Yrs'}`}
                      </button>
                    </td>

                    <td className="px-2 py-2.5 text-right font-mono text-xs font-semibold text-[var(--success)] tabular-nums whitespace-nowrap">
                      ₹{formatPlainNumber(totals.totalReceived)}
                    </td>

                    <td
                      className={`px-2 py-2.5 text-right font-mono text-xs font-semibold tabular-nums whitespace-nowrap ${
                        totals.outstandingTotal > 0 ? 'text-[var(--blue-500)]' : 'text-[var(--ink)]'
                      }`}
                    >
                      ₹{formatPlainNumber(totals.outstandingTotal)}
                    </td>

                    <td className="px-2.5 py-2.5 text-right whitespace-nowrap overflow-visible">
                      <CompanyRowMenu
                        onEditDetails={() => onEditClient(client)}
                        onViewHistory={() => onViewHistory(client)}
                        onDelete={() => onDeleteClient(client.id)}
                        deleteLabel="Delete Client"
                      />
                    </td>
                  </tr>

                  {isExpanded && (
                    <tr className="bg-[var(--frost-100)]">
                      <td colSpan={11} className="px-2.5 py-2.5 border-t border-[var(--line)]">
                        <div className="bg-[var(--card)] border border-[var(--line)] rounded-xl overflow-hidden shadow-xs">
                          <p className="px-3 py-2 text-[11px] text-[var(--muted)] border-b border-[var(--line)] bg-[var(--frost-100)]">
                            To record a payment, change{' '}
                            <span className="font-semibold text-[var(--ink)]">Received</span>{' '}
                            in the row (total paid so far) — Balance updates live. Use{' '}
                            <span className="font-semibold text-[var(--ink)]">Receive due</span>{' '}
                            to clear outstanding in one click.
                          </p>
                          <div className="overflow-x-auto">
                          <table className="w-full border-collapse text-left text-[11px] sm:text-xs">
                            <thead>
                              <tr className="bg-[var(--navy-900)] text-white border-b border-[var(--line)]">
                                <th className="px-2 py-2 font-semibold whitespace-nowrap">Year</th>
                                <th className="px-2 py-2 font-semibold whitespace-nowrap">Filing Date</th>
                                <th className="px-2 py-2 font-semibold text-right whitespace-nowrap">Fees (₹)</th>
                                <th className="px-2 py-2 font-semibold text-right whitespace-nowrap">Received (₹)</th>
                                <th className="px-2 py-2 font-semibold text-right whitespace-nowrap">Balance (₹)</th>
                                <th className="px-2 py-2 font-semibold whitespace-nowrap">Pay Type</th>
                                <th className="px-2 py-2 font-semibold whitespace-nowrap">Pay Recv Date</th>
                                <th className="px-2 py-2 font-semibold text-right whitespace-nowrap">Actions</th>
                              </tr>
                            </thead>

                            <tbody className="divide-y divide-[var(--line)]">
                              {clientYears.map((yr) => {
                                const f = client.filings[yr];
                                const edit = getMoneyEdit(client.id, yr, f);
                                const liveFees = Math.max(0, Number(edit.fees) || 0);
                                const liveRecd = Math.max(0, Number(edit.received) || 0);
                                const liveBal = computeBalance(liveFees, liveRecd);
                                const dirty = isMoneyDirty(client.id, yr, f);
                                const rowSaving =
                                  savingMoneyKey === moneyKey(client.id, yr);
                                return (
                                  <tr key={yr} className="hover:bg-[var(--frost-100)]">
                                    <td className="px-2 py-2 font-mono font-semibold text-[var(--ink)] whitespace-nowrap">
                                      {yr}
                                    </td>
                                    <td className="px-2 py-2 font-mono text-[var(--muted)] tabular-nums whitespace-nowrap">
                                      {formatDisplayDate(f.filingDate)}
                                    </td>
                                    <td className="px-1.5 py-2 text-right">
                                      <input
                                        type="number"
                                        min={0}
                                        value={edit.fees}
                                        onChange={(e) =>
                                          updateMoneyEdit(
                                            client.id,
                                            yr,
                                            f,
                                            'fees',
                                            e.target.value
                                          )
                                        }
                                        className={inlineNumClass}
                                        aria-label={`${yr} fees`}
                                      />
                                    </td>
                                    <td className="px-1.5 py-2 text-right">
                                      <input
                                        type="number"
                                        min={0}
                                        value={edit.received}
                                        onChange={(e) =>
                                          updateMoneyEdit(
                                            client.id,
                                            yr,
                                            f,
                                            'received',
                                            e.target.value
                                          )
                                        }
                                        className={inlineNumClass}
                                        aria-label={`${yr} received`}
                                      />
                                    </td>
                                    <td
                                      className={`px-2 py-2 text-right font-mono font-semibold tabular-nums whitespace-nowrap ${
                                        liveBal > 0
                                          ? 'text-[var(--blue-500)]'
                                          : 'text-[var(--muted)]'
                                      }`}
                                    >
                                      ₹{formatPlainNumber(liveBal)}
                                    </td>
                                    <td className="px-2 py-2 text-[var(--ink)] whitespace-nowrap">
                                      {f.paymentType || '—'}
                                    </td>
                                    <td className="px-2 py-2 font-mono text-[var(--muted)] tabular-nums whitespace-nowrap">
                                      {formatDisplayDate(f.paymentReceiveDate)}
                                    </td>
                                    <td className="px-2 py-2 text-right whitespace-nowrap">
                                      <div className="inline-flex flex-col items-end gap-1">
                                        {dirty ? (
                                          <button
                                            type="button"
                                            disabled={rowSaving}
                                            onClick={() =>
                                              void handleSaveMoney(client, yr, f)
                                            }
                                            className="inline-flex items-center px-2.5 py-1 text-[11px] font-bold text-white bg-[var(--navy-900)] hover:bg-[var(--navy-700)] rounded-lg cursor-pointer disabled:opacity-60"
                                          >
                                            {rowSaving ? 'Saving…' : 'Save'}
                                          </button>
                                        ) : null}
                                        {liveBal > 0 ? (
                                          <button
                                            type="button"
                                            disabled={rowSaving}
                                            title="Set Received = Fees (clear outstanding)"
                                            onClick={() =>
                                              void handleSaveMoney(client, yr, f, {
                                                fees: liveFees,
                                                received: liveFees,
                                              })
                                            }
                                            className="px-1.5 py-0.5 text-[11px] font-semibold text-[var(--success)] hover:underline cursor-pointer disabled:opacity-60"
                                          >
                                            Receive due
                                          </button>
                                        ) : null}
                                        <button
                                          type="button"
                                          onClick={() => onOpenQuickEdit(client, yr, f)}
                                          className="px-1.5 py-0.5 text-[11px] font-semibold text-[var(--blue-500)] hover:underline cursor-pointer"
                                          title="Open payment details for this year"
                                        >
                                          Pay
                                        </button>
                                        <ConfirmDangerButton
                                          label="Remove"
                                          onConfirm={() => onDeleteFiling(client.id, yr)}
                                          className="!min-h-8 text-[11px]"
                                        />
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}

                              <tr className="bg-[var(--frost-100)] border-t border-[var(--line)]">
                                <td className="px-1.5 py-2">
                                  <input
                                    type="text"
                                    list="inline-years-list"
                                    value={draft?.year || ''}
                                    onChange={(e) => updateDraft(client.id, 'year', e.target.value)}
                                    placeholder="AY 2026-27"
                                    className="w-[88px] px-1.5 py-1 text-[11px] font-mono bg-[var(--card)] border border-[var(--line)] rounded-lg focus:outline-none focus:border-[var(--blue-500)]"
                                  />
                                </td>
                                <td className="px-1.5 py-2">
                                  <input
                                    type="date"
                                    value={draft?.filingDate || ''}
                                    onChange={(e) =>
                                      updateDraft(client.id, 'filingDate', e.target.value)
                                    }
                                    className={inlineDateClass}
                                  />
                                </td>
                                <td className="px-1.5 py-2 text-right">
                                  <input
                                    type="number"
                                    min={0}
                                    value={draft?.fees || ''}
                                    onChange={(e) => updateDraft(client.id, 'fees', e.target.value)}
                                    placeholder="Fees"
                                    className={inlineNumClass}
                                  />
                                </td>
                                <td className="px-1.5 py-2 text-right">
                                  <input
                                    type="number"
                                    min={0}
                                    value={draft?.received || ''}
                                    onChange={(e) =>
                                      updateDraft(client.id, 'received', e.target.value)
                                    }
                                    placeholder="Recd"
                                    className={inlineNumClass}
                                  />
                                </td>
                                <td className="px-2 py-2 text-right font-mono font-semibold text-[var(--ink)] tabular-nums whitespace-nowrap">
                                  ₹{formatPlainNumber(draftBal)}
                                </td>
                                <td className="px-1.5 py-2">
                                  <LimeSelect
                                    value={draft?.paymentType || 'GPay'}
                                    options={PAYMENT_TYPES}
                                    onChange={(value) =>
                                      updateDraft(client.id, 'paymentType', value)
                                    }
                                    ariaLabel="Payment type"
                                    className="w-[110px]"
                                    buttonClassName="py-1 px-2 text-[11px]"
                                  />
                                </td>
                                <td className="px-1.5 py-2">
                                  <input
                                    type="date"
                                    value={draft?.paymentReceiveDate || ''}
                                    onChange={(e) =>
                                      updateDraft(client.id, 'paymentReceiveDate', e.target.value)
                                    }
                                    className={inlineDateClass}
                                  />
                                </td>
                                <td className="px-1.5 py-2 text-right">
                                  <button
                                    type="button"
                                    disabled={savingClientId === client.id}
                                    onClick={(e) => void handleInlineAddFiling(e, client)}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-white bg-[var(--navy-900)] hover:bg-[var(--navy-700)] rounded-lg whitespace-nowrap cursor-pointer disabled:opacity-60"
                                  >
                                    <Plus className="w-3 h-3" />
                                    <span>{savingClientId === client.id ? 'Saving...' : 'Save Year'}</span>
                                  </button>
                                </td>
                              </tr>
                            </tbody>
                          </table>
                          </div>
                          <datalist id="inline-years-list">
                            {availableYears.map((y) => (
                              <option key={y} value={y} />
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
      )}

      <TableFooterBar>
        <BottomPeriodNavigator
          canPrev={canGoPrev}
          canNext={canGoNext}
          showAll={showAllYears}
          onPrev={goPrev}
          onNext={goNext}
          prevText={`‹ Previous${prevYear ? ` · ${shortAyLabel(prevYear)}` : ''}`}
          nextText={`Next${nextYear ? ` · ${shortAyLabel(nextYear)}` : ''} ›`}
        />
      </TableFooterBar>
    </div>
  );
}
