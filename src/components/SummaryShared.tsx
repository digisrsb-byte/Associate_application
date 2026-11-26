import { useMemo, useState, type ReactNode } from 'react';
import { Search } from 'lucide-react';
import type { ClientRecord } from '../types/ledger.ts';
import {
  computeBalance,
  formatDisplayDate,
  formatPlainNumber,
  sortAssessmentYears,
} from '../utils/ledgerUtils.ts';

export function moneyPlain(n: number): string {
  return `₹${formatPlainNumber(Math.max(0, Math.round(n)))}`;
}

export type RowStatusKind = 'due' | 'clear' | 'none';
export type YearStatusKind = 'paid' | 'part' | 'unpaid';

export function StatusBadge({
  kind,
  dueAmount,
}: {
  kind: RowStatusKind | YearStatusKind;
  dueAmount?: number;
}) {
  if (kind === 'due') {
    return (
      <span className="inline-flex px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-[var(--warning-15)] text-[var(--warning)] whitespace-nowrap">
        Due {moneyPlain(dueAmount ?? 0)}
      </span>
    );
  }
  if (kind === 'clear') {
    return (
      <span className="inline-flex px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-[var(--success-15)] text-[var(--success)]">
        Clear
      </span>
    );
  }
  if (kind === 'paid') {
    return (
      <span className="inline-flex px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-[var(--success-15)] text-[var(--success)]">
        Paid
      </span>
    );
  }
  if (kind === 'part') {
    return (
      <span className="inline-flex px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-[var(--blue-15)] text-[var(--blue-500)]">
        Part paid
      </span>
    );
  }
  if (kind === 'unpaid') {
    return (
      <span className="inline-flex px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-[var(--danger-15)] text-[var(--danger)]">
        Unpaid
      </span>
    );
  }
  return (
    <span className="inline-flex px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-[var(--frost-100)] text-[var(--muted)]">
      —
    </span>
  );
}

export function rowStatus(
  outstanding: number,
  yearsFiled: number
): RowStatusKind {
  if (yearsFiled <= 0) return 'none';
  if (outstanding > 0) return 'due';
  return 'clear';
}

export function yearStatus(
  fees: number,
  received: number,
  balance: number
): YearStatusKind {
  if (fees <= 0 || balance <= 0) return 'paid';
  if (received <= 0) return 'unpaid';
  return 'part';
}

export interface FilterChipOption<T extends string> {
  id: T;
  label: string;
}

export function FilterChips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: FilterChipOption<T>[];
  value: T;
  onChange: (next: T) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {options.map((opt) => {
        const selected = opt.id === value;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            className={`px-3 py-1.5 rounded-full text-[11px] font-semibold transition-colors ${
              selected
                ? 'bg-[var(--navy-900)] text-white'
                : 'bg-[var(--card)] text-[var(--ink)] border border-[var(--line)] hover:border-[var(--navy-900)]'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Shared search + filter chips + sort slot + result count for IT/GST/Mobile summaries.
 * Domain filter/sort options stay in each parent view.
 */
export function SummaryToolbar<T extends string>({
  search,
  onSearch,
  searchPlaceholder,
  filterOptions,
  filter,
  onFilter,
  sortControl,
  countLabel,
}: {
  search: string;
  onSearch: (next: string) => void;
  searchPlaceholder: string;
  filterOptions: FilterChipOption<T>[];
  filter: T;
  onFilter: (next: T) => void;
  sortControl: ReactNode;
  countLabel: string;
}) {
  return (
    <div className="space-y-3">
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--sidebar-text)]" />
        <input
          type="search"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder={searchPlaceholder}
          className="w-full rounded-xl border border-[var(--line)] bg-[var(--frost-100)] pl-9 pr-3 py-2.5 text-[12px] text-[var(--ink)] placeholder:text-[var(--sidebar-text)] outline-none focus:border-[var(--blue-500)] focus:bg-[var(--card)]"
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <FilterChips
            options={filterOptions}
            value={filter}
            onChange={onFilter}
          />
          {sortControl}
        </div>
        <p className="text-[12px] font-semibold text-[var(--ink)]">{countLabel}</p>
      </div>
    </div>
  );
}

/** Linked-list "show more" chrome (Mobile summary expand panels). */
export function SummaryShowMore({
  remaining,
  onShowMore,
}: {
  remaining: number;
  onShowMore: () => void;
}) {
  if (remaining <= 0) return null;
  return (
    <div className="px-3 py-2 border-t border-[var(--line)]">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onShowMore();
        }}
        className="text-[11px] font-semibold text-[var(--blue-500)] hover:underline"
      >
        Show more ({remaining} remaining)
      </button>
    </div>
  );
}

export function PaginationBar({
  page,
  pageSize,
  total,
  entityPlural,
  onPage,
  onPageSize,
}: {
  page: number;
  pageSize: number;
  total: number;
  entityPlural: string;
  onPage: (page: number) => void;
  onPageSize: (size: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const from = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const to = Math.min(safePage * pageSize, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-[var(--frost-100)] border-t border-[var(--line)] text-xs text-[var(--muted)]">
      <p>
        Showing{' '}
        <span className="font-semibold text-[var(--ink)]">
          {from}–{to}
        </span>{' '}
        of <span className="font-semibold text-[var(--ink)]">{total}</span>{' '}
        {entityPlural}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2">
          <span>Per page</span>
          <select
            value={pageSize}
            onChange={(e) => onPageSize(Number(e.target.value))}
            className="rounded-lg border border-[var(--line)] bg-[var(--card)] px-2 py-1.5 text-xs font-medium text-[var(--ink)] outline-none focus:border-[var(--blue-500)]"
          >
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </label>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            disabled={safePage <= 1}
            onClick={() => onPage(safePage - 1)}
            className="px-3 py-1.5 rounded-lg border border-[var(--line)] bg-[var(--card)] text-xs font-semibold text-[var(--ink)] disabled:opacity-40 disabled:cursor-not-allowed hover:border-[var(--navy-900)]"
          >
            Prev
          </button>
          <button
            type="button"
            disabled={safePage >= totalPages}
            onClick={() => onPage(safePage + 1)}
            className="px-3 py-1.5 rounded-lg border border-[var(--line)] bg-[var(--card)] text-xs font-semibold text-[var(--ink)] disabled:opacity-40 disabled:cursor-not-allowed hover:border-[var(--navy-900)]"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}

export function ClientYearHistory({
  client,
  years,
}: {
  client: ClientRecord;
  years: string[];
}) {
  const rows = useMemo(() => {
    // List every year that has a filing (matches All Data); `years` kept for API parity.
    void years;
    const filed = sortAssessmentYears(Object.keys(client.filings || {}));
    return [...filed].reverse().map((yr) => {
      const f = client.filings[yr];
      const fees = Number(f?.fees) || 0;
      const received = Number(f?.received) || 0;
      const balance =
        typeof f?.balance === 'number' && !Number.isNaN(f.balance)
          ? Math.max(0, f.balance)
          : computeBalance(fees, received);
      return {
        year: yr,
        filingDate: f?.filingDate || '',
        fees,
        received,
        balance,
        paymentType: f?.paymentType || '',
        paymentReceiveDate: f?.paymentReceiveDate || '',
      };
    });
  }, [client, years]);

  if (rows.length === 0) {
    return (
      <p className="px-3 py-4 text-center text-[12px] text-[var(--muted)]">
        No filings yet
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12px] border-collapse">
        <thead>
          <tr className="bg-[var(--navy-900)] text-white">
            <th className="px-3 py-2 text-left font-semibold">AY</th>
            <th className="px-3 py-2 text-left font-semibold whitespace-nowrap">
              Filing date
            </th>
            <th className="px-3 py-2 text-right font-semibold">Fees</th>
            <th className="px-3 py-2 text-right font-semibold">Received</th>
            <th className="px-3 py-2 text-right font-semibold">Balance</th>
            <th className="px-3 py-2 text-left font-semibold whitespace-nowrap">
              Payment mode / date
            </th>
            <th className="px-3 py-2 text-left font-semibold">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((d) => (
            <tr key={d.year} className="border-t border-[var(--line)]">
              <td className="px-3 py-2.5 font-mono font-medium whitespace-nowrap">
                {d.year.replace(/^AY\s*/i, '')}
              </td>
              <td className="px-3 py-2.5 whitespace-nowrap text-[var(--muted)]">
                {formatDisplayDate(d.filingDate)}
              </td>
              <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                {moneyPlain(d.fees)}
              </td>
              <td className="px-3 py-2.5 text-right font-mono tabular-nums text-[var(--success)]">
                {moneyPlain(d.received)}
              </td>
              <td className="px-3 py-2.5 text-right font-mono tabular-nums text-[var(--blue-500)]">
                {moneyPlain(d.balance)}
              </td>
              <td className="px-3 py-2.5 text-[var(--muted)]">
                {[d.paymentType, formatDisplayDate(d.paymentReceiveDate)]
                  .filter((x) => x && x !== '—')
                  .join(' · ') || '—'}
              </td>
              <td className="px-3 py-2.5">
                <StatusBadge
                  kind={yearStatus(d.fees, d.received, d.balance)}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SummaryCard({
  title,
  subtitle,
  toolbar,
  children,
  footer,
  pagination,
}: {
  title: string;
  subtitle: string;
  toolbar: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  pagination?: ReactNode;
}) {
  return (
    <section className="bg-[var(--card)] rounded-2xl border border-white shadow-card overflow-hidden">
      <div className="px-5 pt-5 pb-3">
        <h2 className="text-[17px] font-semibold text-[var(--ink)]">{title}</h2>
        <p className="text-[12px] text-[var(--muted)] mt-0.5">{subtitle}</p>
      </div>
      <div className="px-5 pb-4">{toolbar}</div>
      {children}
      {footer}
      {pagination}
    </section>
  );
}

export function YearsToggle({
  client,
  years,
}: {
  client: ClientRecord;
  years: string[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="text-[11px] font-semibold text-[var(--blue-500)] hover:underline"
      >
        Years {open ? '▾' : '▸'}
      </button>
      {open && (
        <div className="mt-2 rounded-xl border border-[var(--line)] overflow-hidden bg-[var(--card)]">
          <ClientYearHistory client={client} years={years} />
        </div>
      )}
    </div>
  );
}
