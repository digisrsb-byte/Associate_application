import type { ReactNode } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { formatCurrency, formatPlainNumber } from '../utils/ledgerUtils.ts';
import { LimeSelect } from './LimeSelect.tsx';

export type StatusFilter = 'all' | 'dues' | 'paid' | 'not-filed';
export type SortMode = 'outstanding' | 'billed' | 'received' | 'name';

export function money(n: number): string {
  return formatCurrency(Math.max(0, Math.round(n)));
}

export function moneyPlain(n: number): string {
  return `₹${formatPlainNumber(Math.max(0, Math.round(n)))}`;
}

export function filingStatus(
  fees: number,
  received: number,
  balance: number
): 'paid' | 'part' | 'unpaid' {
  if (fees <= 0) return 'paid';
  if (received <= 0) return 'unpaid';
  if (balance > 0) return 'part';
  return 'paid';
}

export function FilingStatusPill({
  status,
}: {
  status: 'paid' | 'part' | 'unpaid';
}) {
  const styles =
    status === 'paid'
      ? 'bg-[var(--success-15)] text-[var(--success)]'
      : status === 'part'
        ? 'bg-[var(--warning-15)] text-[var(--warning)]'
        : 'bg-[var(--danger-15)] text-[var(--danger)]';
  const label =
    status === 'paid' ? 'Paid' : status === 'part' ? 'Part paid' : 'Unpaid';
  return (
    <span
      className={`inline-flex px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${styles}`}
    >
      {label}
    </span>
  );
}

export function RowStatusBadge({
  outstanding,
  billed,
  filed,
}: {
  outstanding: number;
  billed: number;
  filed: boolean;
}) {
  if (!filed) {
    return (
      <span className="inline-flex px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-[var(--frost-100)] text-[var(--muted)]">
        Not filed
      </span>
    );
  }
  if (outstanding > 0) {
    return (
      <span className="inline-flex px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-[var(--danger-15)] text-[var(--danger)]">
        Due {moneyPlain(outstanding)}
      </span>
    );
  }
  if (billed > 0) {
    return (
      <span className="inline-flex px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-[var(--success-15)] text-[var(--success)]">
        Fully paid
      </span>
    );
  }
  return (
    <span className="inline-flex px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-[var(--frost-100)] text-[var(--muted)]">
      —
    </span>
  );
}

interface ToolbarProps {
  search: string;
  onSearch: (v: string) => void;
  searchPlaceholder: string;
  statusFilter: StatusFilter;
  onStatusFilter: (v: StatusFilter) => void;
  notFiledLabel: string;
  sortMode: SortMode;
  onSortMode: (v: SortMode) => void;
  entityLabel?: string;
}

export function SummaryToolbar({
  search,
  onSearch,
  searchPlaceholder,
  statusFilter,
  onStatusFilter,
  notFiledLabel,
  sortMode,
  onSortMode,
}: ToolbarProps) {
  const chips: { id: StatusFilter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'dues', label: 'Dues pending' },
    { id: 'paid', label: 'Fully paid' },
    { id: 'not-filed', label: notFiledLabel },
  ];

  return (
    <div className="flex flex-col xl:flex-row xl:items-center gap-3">
      <div className="relative flex-1 min-w-0">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted)]" />
        <input
          type="search"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder={searchPlaceholder}
          className="w-full pl-10 pr-4 py-2.5 text-sm bg-[var(--card)] border border-[var(--line)] rounded-full shadow-sm placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--blue-500)]/30 focus:border-[var(--blue-500)]"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {chips.map((chip) => (
          <button
            key={chip.id}
            type="button"
            onClick={() => onStatusFilter(chip.id)}
            className={`px-3.5 py-2 rounded-full text-xs font-semibold cursor-pointer transition-colors border ${
              statusFilter === chip.id
                ? 'bg-[var(--navy-900)] text-white border-[var(--navy-900)]'
                : 'bg-[var(--card)] text-[var(--muted)] border-[var(--line)] hover:bg-[var(--frost-100)]'
            }`}
          >
            {chip.label}
          </button>
        ))}
      </div>

      <label className="inline-flex items-center gap-2 text-xs text-[var(--muted)] shrink-0">
        <span className="font-medium">Sort</span>
        <LimeSelect
          value={sortMode}
          onChange={(v) => onSortMode(v as SortMode)}
          ariaLabel="Sort rows"
          className="w-[180px]"
          buttonClassName="py-2 px-3 text-xs"
          options={[
            { value: 'outstanding', label: 'Most outstanding' },
            { value: 'billed', label: 'Highest billed' },
            { value: 'received', label: 'Highest received' },
            { value: 'name', label: 'Name A–Z' },
          ]}
        />
      </label>
    </div>
  );
}

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPage: (p: number) => void;
  onPageSize: (n: number) => void;
  entityPlural: string;
}

export function SummaryPagination({
  page,
  pageSize,
  total,
  onPage,
  onPageSize,
  entityPlural,
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const from = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const to = Math.min(total, safePage * pageSize);

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 border-t border-[var(--line)] bg-[var(--card)] text-xs text-[var(--muted)]">
      <p>
        Showing {from}–{to} of {total} {entityPlural}
      </p>
      <div className="flex items-center gap-2">
        <label className="inline-flex items-center gap-1.5">
          <span>Per page</span>
          <select
            value={pageSize}
            onChange={(e) => onPageSize(Number(e.target.value))}
            className="px-2 py-1.5 rounded-lg border border-[var(--line)] bg-[var(--card)] font-semibold text-[var(--ink)] cursor-pointer"
          >
            {[5, 10, 20, 50].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={safePage <= 1}
          onClick={() => onPage(safePage - 1)}
          className="px-3 py-1.5 rounded-lg border border-[var(--line)] bg-[var(--card)] font-semibold text-[var(--ink)] disabled:opacity-40 cursor-pointer"
        >
          Prev
        </button>
        <button
          type="button"
          disabled={safePage >= totalPages}
          onClick={() => onPage(safePage + 1)}
          className="px-3 py-1.5 rounded-lg border border-[var(--line)] bg-[var(--card)] font-semibold text-[var(--ink)] disabled:opacity-40 cursor-pointer"
        >
          Next
        </button>
      </div>
    </div>
  );
}

export function ExpandChevron({ open }: { open: boolean }) {
  return (
    <ChevronDown
      className={`w-4 h-4 text-[var(--muted)] transition-transform ${
        open ? 'rotate-180' : ''
      }`}
    />
  );
}

export function SummaryShell({
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
    <div className="space-y-3">
      {toolbar}
      <div className="bg-[var(--card)] rounded-2xl border border-[var(--line)] shadow-card overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--line)]">
          <h2 className="font-display text-sm font-semibold text-[var(--ink)]">
            {title}
          </h2>
          <p className="text-xs text-[var(--muted)] mt-0.5">{subtitle}</p>
        </div>
        {children}
        {footer}
        {pagination}
      </div>
    </div>
  );
}

export function matchesStatusFilter(
  filter: StatusFilter,
  outstanding: number,
  billed: number,
  filedCurrentPeriod: boolean
): boolean {
  if (filter === 'all') return true;
  if (filter === 'dues') return outstanding > 0;
  if (filter === 'paid') return billed > 0 && outstanding <= 0;
  if (filter === 'not-filed') return !filedCurrentPeriod;
  return true;
}

export function sortByMode<T>(
  rows: T[],
  mode: SortMode,
  getters: {
    outstanding: (r: T) => number;
    billed: (r: T) => number;
    received: (r: T) => number;
    name: (r: T) => string;
  }
): T[] {
  const list = [...rows];
  list.sort((a, b) => {
    if (mode === 'outstanding')
      return getters.outstanding(b) - getters.outstanding(a);
    if (mode === 'billed') return getters.billed(b) - getters.billed(a);
    if (mode === 'received') return getters.received(b) - getters.received(a);
    return getters.name(a).localeCompare(getters.name(b));
  });
  return list;
}
