import { useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Pencil,
  Plus,
} from 'lucide-react';
import type { ClientRecord, FilingRecord } from '../../types/ledger.ts';
import {
  computeClientTotals,
  formatDisplayDate,
  formatPlainNumber,
  getNextAssessmentYear,
  sortAssessmentYears,
} from '../../utils/ledgerUtils.ts';
import { CompanyRowMenu } from '../CompanyRowMenu.tsx';
import { PortalPasswordCell } from '../PortalPasswordCell.tsx';
import { ConfirmDangerButton } from './ConfirmDangerButton.tsx';

export interface ItClientMobileListProps {
  clients: ClientRecord[];
  availableYears: string[];
  showAllYears: boolean;
  activeYear: string;
  onEditClient: (client: ClientRecord) => void;
  onViewHistory: (client: ClientRecord) => void;
  onDeleteClient: (clientId: string) => Promise<void>;
  onDeleteFiling: (clientId: string, year: string) => Promise<void>;
  onOpenQuickEdit: (
    client: ClientRecord,
    year: string,
    existing?: FilingRecord
  ) => void;
}

export function ItClientMobileList({
  clients,
  availableYears,
  showAllYears,
  activeYear,
  onEditClient,
  onViewHistory,
  onDeleteClient,
  onDeleteFiling,
  onOpenQuickEdit,
}: ItClientMobileListProps) {
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

  const toggleExpand = (clientId: string) => {
    setExpandedIds((prev) => ({ ...prev, [clientId]: !prev[clientId] }));
  };

  const suggestYearForAdd = (client: ClientRecord): string => {
    const clientYears = sortAssessmentYears(Object.keys(client.filings || {}));
    if (!showAllYears && activeYear && !client.filings?.[activeYear]) {
      return activeYear;
    }
    return getNextAssessmentYear(
      clientYears.length > 0 ? clientYears : availableYears.slice(0, -1)
    );
  };

  if (clients.length === 0) {
    return (
      <div className="px-4 py-10 text-center">
        <p className="font-display text-base font-semibold text-[var(--ink)]">
          No clients match
        </p>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Adjust search or period filters, or add a new client.
        </p>
      </div>
    );
  }

  return (
    <ul className="space-y-2.5 list-none m-0 p-3 bg-[var(--frost-100)]/60">
      {clients.map((client) => {
        const isExpanded = Boolean(expandedIds[client.id]);
        const totals = computeClientTotals(client);
        const allClientYears = sortAssessmentYears(Object.keys(client.filings || {}));
        const clientYears =
          !showAllYears && activeYear
            ? allClientYears.filter((y) => y === activeYear)
            : allClientYears;
        const periodHint =
          clientYears.length === 0
            ? 'No filings'
            : showAllYears
              ? `${clientYears.length} ${clientYears.length === 1 ? 'year' : 'years'}`
              : activeYear || `${clientYears.length} years`;

        return (
          <li
            key={client.id}
            className="rounded-2xl border border-[var(--line)] bg-[var(--card)] shadow-sm overflow-hidden"
          >
            <div className="p-3.5">
              <div className="flex items-start gap-2">
                <button
                  type="button"
                  onClick={() => toggleExpand(client.id)}
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
                    onClick={() => toggleExpand(client.id)}
                    className="text-left w-full cursor-pointer"
                  >
                    <p className="font-display text-[15px] font-bold text-[var(--ink)] leading-snug break-words">
                      {client.name}
                    </p>
                  </button>

                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="inline-flex items-center gap-1 rounded-lg bg-[var(--frost-100)] px-2 py-1 font-mono text-[11px] font-semibold text-[var(--ink)]">
                      {client.pan || '—'}
                      {client.pan ? (
                        <button
                          type="button"
                          onClick={() => void copyValue(`pan-${client.id}`, client.pan)}
                          className="inline-flex min-h-8 min-w-8 items-center justify-center rounded-md text-[var(--muted)] hover:text-[var(--ink)] cursor-pointer"
                          aria-label="Copy PAN"
                        >
                          {copiedKey === `pan-${client.id}` ? (
                            <Check className="w-3.5 h-3.5 text-[var(--success)]" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      ) : null}
                    </span>
                    {client.phone ? (
                      <span className="text-[11px] font-mono text-[var(--muted)]">
                        {client.phone}
                      </span>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-lg border border-[var(--line)] px-2 py-1 text-[11px] font-semibold text-[var(--muted)]">
                      {periodHint}
                    </span>
                    <span
                      className={`rounded-lg px-2.5 py-1 font-mono text-[12px] font-bold tabular-nums ${
                        totals.outstandingTotal > 0
                          ? 'bg-[var(--navy-900)] text-white'
                          : 'bg-[var(--success-15)] text-[var(--success)]'
                      }`}
                    >
                      {totals.outstandingTotal > 0 ? 'Due ' : ''}₹
                      {formatPlainNumber(totals.outstandingTotal)}
                    </span>
                  </div>
                </div>

                <div className="shrink-0">
                  <CompanyRowMenu
                    onEditDetails={() => onEditClient(client)}
                    onViewHistory={() => onViewHistory(client)}
                    onDelete={() => onDeleteClient(client.id)}
                    deleteLabel="Delete Client"
                  />
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => onEditClient(client)}
                  className="min-h-11 inline-flex items-center justify-center gap-1.5 rounded-xl border border-[var(--line)] bg-[var(--frost-100)] text-xs font-bold text-[var(--ink)] cursor-pointer"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => toggleExpand(client.id)}
                  className="min-h-11 inline-flex items-center justify-center gap-1.5 rounded-xl border border-[var(--line)] text-xs font-bold text-[var(--navy-900)] cursor-pointer"
                >
                  {isExpanded ? 'Hide details' : 'View filings'}
                </button>
              </div>
            </div>

            {isExpanded && (
              <div className="border-t border-[var(--line)] bg-[var(--frost-100)]/50 px-3.5 py-3 space-y-2.5">
                <div className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="text-[var(--muted)] font-medium">Portal password</span>
                  <PortalPasswordCell
                    kind="it"
                    id={client.id}
                    hasPassword={!!client.hasPortalPassword}
                  />
                </div>
                {client.referenceNumber ? (
                  <p className="text-[11px] text-[var(--muted)]">
                    Ref{' '}
                    <span className="font-mono text-[var(--ink)]">
                      {client.referenceNumber}
                    </span>
                  </p>
                ) : null}
                {client.remark ? (
                  <p className="text-[11px] text-[var(--muted)] break-words leading-relaxed">
                    {client.remark}
                  </p>
                ) : null}

                {clientYears.length === 0 ? (
                  <p className="text-xs text-[var(--muted)] py-2 text-center">
                    No filings for this period.
                  </p>
                ) : (
                  <ul className="space-y-2 list-none m-0 p-0">
                    {clientYears.map((yr) => {
                      const f = client.filings[yr];
                      if (!f) return null;
                      return (
                        <li
                          key={yr}
                          className="rounded-xl border border-[var(--line)] bg-[var(--card)] px-3 py-3"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="font-mono text-xs font-bold text-[var(--ink)]">
                                {yr}
                              </p>
                              <p className="mt-0.5 text-[11px] text-[var(--muted)]">
                                Filed {formatDisplayDate(f.filingDate)}
                                {f.paymentType ? ` · ${f.paymentType}` : ''}
                              </p>
                            </div>
                            <span
                              className={`shrink-0 rounded-lg px-2 py-1 font-mono text-[11px] font-bold tabular-nums ${
                                f.balance > 0
                                  ? 'bg-[var(--navy-900)] text-white'
                                  : 'bg-[var(--success-15)] text-[var(--success)]'
                              }`}
                            >
                              Bal ₹{formatPlainNumber(f.balance)}
                            </span>
                          </div>
                          <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] font-mono tabular-nums">
                            <div className="rounded-lg bg-[var(--frost-100)] px-2 py-1.5">
                              <p className="text-[var(--muted)] text-[10px]">Fees</p>
                              <p className="font-semibold text-[var(--ink)]">
                                ₹{formatPlainNumber(f.fees)}
                              </p>
                            </div>
                            <div className="rounded-lg bg-[var(--frost-100)] px-2 py-1.5">
                              <p className="text-[var(--muted)] text-[10px]">Received</p>
                              <p className="font-semibold text-[var(--success)]">
                                ₹{formatPlainNumber(f.received)}
                              </p>
                            </div>
                          </div>
                          <div className="mt-2.5 flex flex-col gap-2">
                            <button
                              type="button"
                              onClick={() => onOpenQuickEdit(client, yr, f)}
                              className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-[var(--line)] bg-[var(--card)] text-xs font-bold text-[var(--ink)] cursor-pointer"
                            >
                              Edit filing
                            </button>
                            <ConfirmDangerButton
                              onConfirm={() => onDeleteFiling(client.id, yr)}
                            />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}

                <button
                  type="button"
                  onClick={() => onOpenQuickEdit(client, suggestYearForAdd(client))}
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
