import { useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Pencil,
  Plus,
} from 'lucide-react';
import type { GstClientRecord, GstMonthlyFiling } from '../../types/ledger.ts';
import {
  computeGstClientTotals,
  computeGstFilingOutstanding,
  computeGstFilingReceived,
  formatPlainNumber,
  getNextGstMonth,
  sortGstMonths,
} from '../../utils/ledgerUtils.ts';
import {
  GST_OUTSTANDING_UNALLOCATED_EXPLAIN,
  GST_UNALLOCATED_LABEL,
  gstFilingDeleteWarning,
} from '../../utils/gstCopy.ts';
import { CompanyRowMenu } from '../CompanyRowMenu.tsx';
import { PortalPasswordCell } from '../PortalPasswordCell.tsx';
import { ConfirmDangerButton } from './ConfirmDangerButton.tsx';

export type GstQuickEditFocus = 'charges' | 'payment';

export interface GstCompanyMobileListProps {
  companies: GstClientRecord[];
  availableMonths: string[];
  showAllMonths: boolean;
  activeMonth: string;
  onEditCompany: (company: GstClientRecord) => void;
  onViewHistory: (company: GstClientRecord) => void;
  onDeleteCompany: (companyId: string) => Promise<void>;
  onDeleteFiling: (companyId: string, month: string) => Promise<void>;
  onOpenQuickEdit: (
    company: GstClientRecord,
    month: string,
    existing?: GstMonthlyFiling,
    focus?: GstQuickEditFocus
  ) => void;
}

export function GstCompanyMobileList({
  companies,
  availableMonths,
  showAllMonths,
  activeMonth,
  onEditCompany,
  onViewHistory,
  onDeleteCompany,
  onDeleteFiling,
  onOpenQuickEdit,
}: GstCompanyMobileListProps) {
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const copyValue = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey((c) => (c === key ? null : c)), 1400);
    } catch {
      // Clipboard blocked
    }
  };

  const toggleExpand = (companyId: string) => {
    setExpandedIds((prev) => ({ ...prev, [companyId]: !prev[companyId] }));
  };

  const suggestMonthForAdd = (company: GstClientRecord): string => {
    const companyMonths = sortGstMonths(Object.keys(company.filings || {}));
    if (!showAllMonths && activeMonth && !company.filings?.[activeMonth]) {
      return activeMonth;
    }
    return getNextGstMonth(
      companyMonths.length > 0 ? companyMonths : availableMonths.slice(0, -1)
    );
  };

  const companyTotalsFiltered = !showAllMonths && Boolean(activeMonth);

  if (companies.length === 0) {
    return (
      <div className="px-4 py-10 text-center">
        <p className="font-display text-base font-semibold text-[var(--ink)]">
          No companies match
        </p>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Adjust search or period filters, or add a new company.
        </p>
      </div>
    );
  }

  return (
    <ul className="space-y-2.5 list-none m-0 p-3 bg-[var(--frost-100)]/60">
      {companies.map((company) => {
        const isExpanded = Boolean(expandedIds[company.id]);
        const totals = computeGstClientTotals(company);
        const allMonths = sortGstMonths(Object.keys(company.filings || {}));
        const months =
          !showAllMonths && activeMonth
            ? allMonths.filter((m) => m === activeMonth)
            : allMonths;
        const periodHint =
          months.length === 0
            ? 'No filings'
            : showAllMonths
              ? `${months.length} ${months.length === 1 ? 'month' : 'months'}`
              : activeMonth || `${months.length} months`;
        const statusHint =
          totals.outstandingTotal > 0
            ? 'Outstanding'
            : totals.totalBilled > 0
              ? 'Settled'
              : 'No billing';

        return (
          <li
            key={company.id}
            className="rounded-2xl border border-[var(--line)] bg-[var(--card)] shadow-sm overflow-hidden"
          >
            <div className="p-3.5">
              <div className="flex items-start gap-2">
                <button
                  type="button"
                  onClick={() => toggleExpand(company.id)}
                  className="mt-0.5 inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl bg-[var(--frost-100)] text-[var(--muted)] hover:text-[var(--ink)] cursor-pointer shrink-0"
                  aria-expanded={isExpanded}
                  aria-label={isExpanded ? 'Hide filings' : 'Show filings'}
                >
                  {isExpanded ? (
                    <ChevronDown className="w-5 h-5" />
                  ) : (
                    <ChevronRight className="w-5 h-5" />
                  )}
                </button>

                <div className="min-w-0 flex-1 space-y-2">
                  <button
                    type="button"
                    onClick={() => toggleExpand(company.id)}
                    className="text-left w-full cursor-pointer"
                  >
                    <p className="font-display text-[15px] font-bold text-[var(--ink)] leading-snug break-words">
                      {company.companyName}
                    </p>
                  </button>

                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="inline-flex items-center gap-1 rounded-lg bg-[var(--frost-100)] px-2 py-1 font-mono text-[11px] font-semibold text-[var(--ink)]">
                      {company.userId || '—'}
                      {company.userId ? (
                        <button
                          type="button"
                          onClick={() =>
                            void copyValue(`uid-${company.id}`, company.userId)
                          }
                          className="inline-flex min-h-8 min-w-8 items-center justify-center rounded-md text-[var(--muted)] hover:text-[var(--ink)] cursor-pointer"
                          aria-label="Copy User ID"
                        >
                          {copiedKey === `uid-${company.id}` ? (
                            <Check className="w-3.5 h-3.5 text-[var(--success)]" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      ) : null}
                    </span>
                    {company.phone ? (
                      <span className="text-[11px] font-mono text-[var(--muted)]">
                        {company.phone}
                      </span>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-lg border border-[var(--line)] px-2 py-1 text-[11px] font-semibold text-[var(--muted)]">
                      {periodHint}
                    </span>
                    <span className="rounded-lg border border-[var(--line)] px-2 py-1 text-[11px] font-semibold text-[var(--muted)]">
                      {statusHint}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-xl border border-[var(--line)] bg-[var(--frost-100)] px-2.5 py-2">
                      <p className="text-[10px] font-semibold text-[var(--muted)] leading-snug">
                        {companyTotalsFiltered
                          ? 'Company Received'
                          : 'Received'}
                      </p>
                      <p className="mt-0.5 font-mono text-[12px] font-bold tabular-nums text-[var(--success)]">
                        ₹{formatPlainNumber(totals.totalReceived)}
                      </p>
                    </div>
                    <div className="rounded-xl border border-[var(--line)] bg-[var(--frost-100)] px-2.5 py-2">
                      <p className="text-[10px] font-semibold text-[var(--muted)] leading-snug">
                        {companyTotalsFiltered
                          ? 'Company Outstanding'
                          : 'Outstanding'}
                      </p>
                      <p
                        className={`mt-0.5 font-mono text-[12px] font-bold tabular-nums ${
                          totals.outstandingTotal > 0
                            ? 'text-[var(--blue-500)]'
                            : 'text-[var(--ink)]'
                        }`}
                      >
                        ₹{formatPlainNumber(totals.outstandingTotal)}
                      </p>
                    </div>
                  </div>
                  {totals.unallocatedReceived > 0 && (
                    <p
                      className="text-[11px] text-[var(--muted)] leading-snug"
                      title={GST_OUTSTANDING_UNALLOCATED_EXPLAIN}
                    >
                      {GST_UNALLOCATED_LABEL} ₹
                      {formatPlainNumber(totals.unallocatedReceived)}. Company
                      Outstanding includes unallocated; monthly Outstanding does
                      not.
                    </p>
                  )}
                </div>

                <div className="shrink-0">
                  <CompanyRowMenu
                    onEditDetails={() => onEditCompany(company)}
                    onViewHistory={() => onViewHistory(company)}
                    onDelete={() => onDeleteCompany(company.id)}
                    deleteLabel="Delete Company"
                  />
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => onEditCompany(company)}
                  className="min-h-11 inline-flex items-center justify-center gap-1.5 rounded-xl border border-[var(--line)] bg-[var(--frost-100)] text-xs font-bold text-[var(--ink)] cursor-pointer"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => toggleExpand(company.id)}
                  className="min-h-11 inline-flex items-center justify-center gap-1.5 rounded-xl border border-[var(--line)] text-xs font-bold text-[var(--navy-900)] cursor-pointer"
                >
                  {isExpanded ? 'Hide details' : 'View filings'}
                </button>
              </div>
            </div>

            {isExpanded && (
              <div className="border-t border-[var(--line)] bg-[var(--frost-100)]/50 px-3.5 py-3 space-y-2.5">
                <p className="rounded-xl border border-[var(--line)] bg-[var(--card)] px-3 py-2.5 text-[11px] text-[var(--muted)] leading-relaxed">
                  <span className="font-semibold text-[var(--ink)]">
                    Save Charges
                  </span>{' '}
                  = updates filing charges.{' '}
                  <span className="font-semibold text-[var(--ink)]">Pay</span> =
                  records money received. Received is calculated from recorded
                  payments. Outstanding = Total − Received (minimum zero).
                </p>

                <div className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="text-[var(--muted)] font-medium">
                    Portal password
                  </span>
                  <PortalPasswordCell
                    kind="gst"
                    id={company.id}
                    hasPassword={!!company.hasPortalPassword}
                  />
                </div>
                {company.referenceNumber ? (
                  <p className="text-[11px] text-[var(--muted)]">
                    Ref{' '}
                    <span className="font-mono text-[var(--ink)]">
                      {company.referenceNumber}
                    </span>
                  </p>
                ) : null}
                {company.remark ? (
                  <p className="text-[11px] text-[var(--muted)] break-words leading-relaxed">
                    {company.remark}
                  </p>
                ) : null}

                {months.length === 0 ? (
                  <p className="text-xs text-[var(--muted)] py-2 text-center">
                    No filings for this period.
                  </p>
                ) : (
                  <ul className="space-y-2 list-none m-0 p-0">
                    {months.map((m) => {
                      const f = company.filings[m];
                      if (!f) return null;
                      const monthRecd = computeGstFilingReceived(f);
                      const monthOut = computeGstFilingOutstanding(f);
                      const payCount = Array.isArray(f.payments)
                        ? f.payments.length
                        : 0;
                      return (
                        <li
                          key={m}
                          className="rounded-xl border border-[var(--line)] bg-[var(--card)] px-3 py-3"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="font-mono text-xs font-bold text-[var(--ink)]">
                              {m}
                            </p>
                            <span className="rounded-lg bg-[var(--frost-100)] px-2 py-1 font-mono text-[11px] font-bold tabular-nums text-[var(--ink)]">
                              Total ₹{formatPlainNumber(f.total)}
                            </span>
                          </div>
                          <div className="mt-2 grid grid-cols-3 gap-1.5 text-[10px] font-mono tabular-nums">
                            <div className="rounded-lg bg-[var(--frost-100)] px-1.5 py-1.5 text-center">
                              <p className="text-[var(--muted)]">Fees</p>
                              <p className="font-semibold text-[var(--ink)]">
                                {formatPlainNumber(f.fees)}
                              </p>
                            </div>
                            <div className="rounded-lg bg-[var(--frost-100)] px-1.5 py-1.5 text-center">
                              <p className="text-[var(--muted)]">Interest</p>
                              <p className="font-semibold text-[var(--ink)]">
                                {formatPlainNumber(f.interest)}
                              </p>
                            </div>
                            <div className="rounded-lg bg-[var(--frost-100)] px-1.5 py-1.5 text-center">
                              <p className="text-[var(--muted)]">Tax</p>
                              <p className="font-semibold text-[var(--ink)]">
                                {formatPlainNumber(f.tax)}
                              </p>
                            </div>
                          </div>
                          <div className="mt-1.5 grid grid-cols-2 gap-1.5 text-[10px] font-mono tabular-nums">
                            <div className="rounded-lg bg-[var(--frost-100)] px-1.5 py-1.5 text-center">
                              <p className="text-[var(--muted)]">Received</p>
                              <p className="font-semibold text-[var(--success)]">
                                ₹{formatPlainNumber(monthRecd)}
                              </p>
                            </div>
                            <div className="rounded-lg bg-[var(--frost-100)] px-1.5 py-1.5 text-center">
                              <p className="text-[var(--muted)]">Outstanding</p>
                              <p
                                className={`font-semibold ${
                                  monthOut > 0
                                    ? 'text-[var(--blue-500)]'
                                    : 'text-[var(--ink)]'
                                }`}
                              >
                                ₹{formatPlainNumber(monthOut)}
                              </p>
                            </div>
                          </div>
                          {payCount > 0 ? (
                            <p className="mt-2 text-[11px] text-[var(--muted)]">
                              Payment history: {payCount}{' '}
                              {payCount === 1 ? 'entry' : 'entries'} — open{' '}
                              <span className="font-semibold text-[var(--ink)]">
                                Pay
                              </span>{' '}
                              to view, edit or delete.
                            </p>
                          ) : (
                            <p className="mt-2 text-[11px] text-[var(--muted)]">
                              No payments yet — use{' '}
                              <span className="font-semibold text-[var(--ink)]">
                                Pay
                              </span>{' '}
                              to record and see payment history.
                            </p>
                          )}
                          <div className="mt-2.5 flex flex-col gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                onOpenQuickEdit(company, m, f, 'charges')
                              }
                              className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-[var(--line)] bg-[var(--card)] text-xs font-bold text-[var(--ink)] cursor-pointer"
                            >
                              Edit Charges
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                onOpenQuickEdit(company, m, f, 'payment')
                              }
                              className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-[var(--navy-900)] text-xs font-bold text-white cursor-pointer"
                            >
                              Pay
                            </button>
                            <ConfirmDangerButton
                              label="Remove filing"
                              confirmLabel="Delete filing & payments"
                              warning={gstFilingDeleteWarning(payCount)}
                              onConfirm={() => onDeleteFiling(company.id, m)}
                            />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}

                <button
                  type="button"
                  onClick={() =>
                    onOpenQuickEdit(
                      company,
                      suggestMonthForAdd(company),
                      undefined,
                      'charges'
                    )
                  }
                  className="inline-flex w-full min-h-11 items-center justify-center gap-2 rounded-xl bg-[var(--navy-900)] px-3 text-xs font-bold text-white cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  Add filing
                </button>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
