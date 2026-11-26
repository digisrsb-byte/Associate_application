import type { ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { ClientSummaryRow, GstClientSummaryRow, MobileSummaryRow } from '../../utils/summaryUtils.ts';
import {
  GST_OUTSTANDING_UNALLOCATED_EXPLAIN,
  GST_UNALLOCATED_LABEL,
} from '../../utils/gstCopy.ts';
import { moneyPlain } from '../SummaryShared.tsx';

export function SummaryMobileEmpty({ message }: { message: string }) {
  return (
    <div className="px-4 py-12 text-center">
      <p className="text-sm text-[var(--muted)]">{message}</p>
    </div>
  );
}

export function ClientSummaryMobileCards({
  rows,
  openIds,
  onToggle,
  renderExpanded,
}: {
  rows: ClientSummaryRow[];
  openIds: Set<string>;
  onToggle: (id: string) => void;
  renderExpanded: (row: ClientSummaryRow) => ReactNode;
}) {
  if (rows.length === 0) {
    return <SummaryMobileEmpty message="No clients match these filters." />;
  }

  return (
    <ul className="space-y-2.5 list-none m-0 p-3 bg-[var(--frost-100)]/50">
      {rows.map((row) => {
        const open = openIds.has(row.id);
        return (
          <li
            key={row.id}
            className="rounded-2xl border border-[var(--line)] bg-[var(--card)] shadow-sm overflow-hidden"
          >
            <button
              type="button"
              onClick={() => onToggle(row.id)}
              className="w-full text-left p-3.5 flex items-start gap-2.5 cursor-pointer"
              aria-expanded={open}
            >
              <span className="mt-0.5 inline-flex min-h-10 min-w-10 items-center justify-center rounded-xl bg-[var(--frost-100)] text-[var(--muted)] shrink-0">
                {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </span>
              <span className="min-w-0 flex-1 space-y-1.5">
                <span className="block font-display text-[15px] font-bold text-[var(--ink)] break-words">
                  {row.name}
                </span>
                <span className="flex flex-wrap gap-x-2 gap-y-1 text-[11px] font-mono text-[var(--muted)]">
                  <span className="text-[var(--ink)] font-semibold">{row.pan}</span>
                  {row.mobile ? <span>· {row.mobile}</span> : null}
                </span>
                <span className="flex flex-wrap gap-2">
                  <span className="rounded-lg border border-[var(--line)] px-2 py-1 text-[11px] font-semibold text-[var(--muted)]">
                    {row.yearsFiled} filed · {row.firstAy}–{row.lastAy}
                  </span>
                  <span
                    className={`rounded-lg px-2.5 py-1 font-mono text-[12px] font-bold tabular-nums ${
                      row.outstanding > 0
                        ? 'bg-[var(--navy-900)] text-white'
                        : 'bg-[var(--success-15)] text-[var(--success)]'
                    }`}
                  >
                    {row.outstanding > 0 ? 'Due ' : ''}
                    {moneyPlain(row.outstanding)}
                  </span>
                </span>
                <span className="grid grid-cols-2 gap-2 pt-1">
                  <span className="rounded-lg bg-[var(--frost-100)] px-2 py-1.5">
                    <span className="block text-[10px] text-[var(--muted)]">Billed</span>
                    <span className="font-mono text-[11px] font-semibold tabular-nums text-[var(--ink)]">
                      {moneyPlain(row.totalBilled)}
                    </span>
                  </span>
                  <span className="rounded-lg bg-[var(--frost-100)] px-2 py-1.5">
                    <span className="block text-[10px] text-[var(--muted)]">Received</span>
                    <span className="font-mono text-[11px] font-semibold tabular-nums text-[var(--success)]">
                      {moneyPlain(row.totalReceived)}
                    </span>
                  </span>
                </span>
              </span>
            </button>
            {open ? (
              <div className="border-t border-[var(--line)] bg-[var(--frost-100)]/40 px-3 py-3">
                {renderExpanded(row)}
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

export function MobileSummaryMobileCards({
  rows,
  openIds,
  onToggle,
  renderExpanded,
}: {
  rows: MobileSummaryRow[];
  openIds: Set<string>;
  onToggle: (key: string) => void;
  renderExpanded: (row: MobileSummaryRow) => ReactNode;
}) {
  if (rows.length === 0) {
    return <SummaryMobileEmpty message="No mobile groups match these filters." />;
  }

  return (
    <ul className="space-y-2.5 list-none m-0 p-3 bg-[var(--frost-100)]/50">
      {rows.map((row) => {
        const key =
          !row.mobile || row.mobile === 'No Mobile' ? '__none__' : row.mobile;
        const open = openIds.has(key);
        return (
          <li
            key={key}
            className="rounded-2xl border border-[var(--line)] bg-[var(--card)] shadow-sm overflow-hidden"
          >
            <button
              type="button"
              onClick={() => onToggle(key)}
              className="w-full text-left p-3.5 flex items-start gap-2.5 cursor-pointer"
              aria-expanded={open}
            >
              <span className="mt-0.5 inline-flex min-h-10 min-w-10 items-center justify-center rounded-xl bg-[var(--frost-100)] text-[var(--muted)] shrink-0">
                {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </span>
              <span className="min-w-0 flex-1 space-y-1.5">
                <span className="block font-mono text-[15px] font-bold text-[var(--ink)]">
                  {!row.mobile || row.mobile === 'No Mobile'
                    ? 'No mobile'
                    : row.mobile}
                </span>
                <span className="block text-[11px] text-[var(--muted)] break-words">
                  {row.clientsCount}{' '}
                  {row.clientsCount === 1 ? 'client' : 'clients'} ·{' '}
                  {row.namesLinked.slice(0, 2).join(', ')}
                  {row.namesLinked.length > 2 ? '…' : ''}
                </span>
                <span className="flex flex-wrap gap-2">
                  <span className="rounded-lg border border-[var(--line)] px-2 py-1 text-[11px] font-semibold text-[var(--muted)]">
                    {row.yearsFiled} years filed
                  </span>
                  <span
                    className={`rounded-lg px-2.5 py-1 font-mono text-[12px] font-bold tabular-nums ${
                      row.outstanding > 0
                        ? 'bg-[var(--navy-900)] text-white'
                        : 'bg-[var(--success-15)] text-[var(--success)]'
                    }`}
                  >
                    {row.outstanding > 0 ? 'Due ' : ''}
                    {moneyPlain(row.outstanding)}
                  </span>
                </span>
              </span>
            </button>
            {open ? (
              <div className="border-t border-[var(--line)] bg-[var(--frost-100)]/40 px-3 py-3">
                {renderExpanded(row)}
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

export function GstSummaryMobileCards({
  rows,
  openIds,
  onToggle,
  renderExpanded,
}: {
  rows: Array<GstClientSummaryRow & { hasPortalPassword?: boolean }>;
  openIds: Set<string>;
  onToggle: (id: string) => void;
  renderExpanded: (row: GstClientSummaryRow) => ReactNode;
}) {
  if (rows.length === 0) {
    return <SummaryMobileEmpty message="No companies match these filters." />;
  }

  return (
    <ul className="space-y-2.5 list-none m-0 p-3 bg-[var(--frost-100)]/50">
      {rows.map((row) => {
        const open = openIds.has(row.id);
        return (
          <li
            key={row.id}
            className="rounded-2xl border border-[var(--line)] bg-[var(--card)] shadow-sm overflow-hidden"
          >
            <button
              type="button"
              onClick={() => onToggle(row.id)}
              className="w-full text-left p-3.5 flex items-start gap-2.5 cursor-pointer"
              aria-expanded={open}
            >
              <span className="mt-0.5 inline-flex min-h-10 min-w-10 items-center justify-center rounded-xl bg-[var(--frost-100)] text-[var(--muted)] shrink-0">
                {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </span>
              <span className="min-w-0 flex-1 space-y-1.5">
                <span className="block font-display text-[15px] font-bold text-[var(--ink)] break-words">
                  {row.companyName}
                </span>
                <span className="flex flex-wrap gap-x-2 gap-y-1 text-[11px] font-mono text-[var(--muted)]">
                  <span className="text-[var(--ink)] font-semibold">{row.userId}</span>
                  {row.phone ? <span>· {row.phone}</span> : null}
                </span>
                <span className="flex flex-wrap gap-2">
                  <span className="rounded-lg border border-[var(--line)] px-2 py-1 text-[11px] font-semibold text-[var(--muted)]">
                    {row.monthsFiled} months filed
                  </span>
                  <span
                    className={`rounded-lg px-2.5 py-1 font-mono text-[12px] font-bold tabular-nums ${
                      row.outstanding > 0
                        ? 'bg-[var(--navy-900)] text-white'
                        : 'bg-[var(--success-15)] text-[var(--success)]'
                    }`}
                  >
                    {row.outstanding > 0 ? 'Due ' : ''}
                    {moneyPlain(row.outstanding)}
                  </span>
                </span>
                <span className="grid grid-cols-2 gap-2 pt-1">
                  <span className="rounded-lg bg-[var(--frost-100)] px-2 py-1.5">
                    <span className="block text-[10px] text-[var(--muted)]">Billed</span>
                    <span className="font-mono text-[11px] font-semibold tabular-nums text-[var(--ink)]">
                      {moneyPlain(row.totalBilled)}
                    </span>
                  </span>
                  <span className="rounded-lg bg-[var(--frost-100)] px-2 py-1.5">
                    <span className="block text-[10px] text-[var(--muted)]">Received</span>
                    <span className="font-mono text-[11px] font-semibold tabular-nums text-[var(--success)]">
                      {moneyPlain(row.totalReceived)}
                    </span>
                  </span>
                </span>
                {row.unallocatedReceived > 0 ? (
                  <span
                    className="block text-[10px] text-[var(--muted)] leading-snug"
                    title={GST_OUTSTANDING_UNALLOCATED_EXPLAIN}
                  >
                    {GST_UNALLOCATED_LABEL} {moneyPlain(row.unallocatedReceived)}.
                    Company Outstanding includes unallocated; monthly does not.
                  </span>
                ) : null}
              </span>
            </button>
            {open ? (
              <div className="border-t border-[var(--line)] bg-[var(--frost-100)]/40 px-3 py-3">
                {renderExpanded(row)}
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
