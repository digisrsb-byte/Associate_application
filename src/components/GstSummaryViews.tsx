import {
  Fragment,
  useEffect,
  useMemo,
  useState,
  type KeyboardEvent,
} from 'react';
import { Check, ChevronDown, ChevronRight, Copy } from 'lucide-react';
import type { GstClientRecord } from '../types/ledger.ts';
import {
  computeGstFilingTotal,
  sortGstMonths,
} from '../utils/ledgerUtils.ts';
import { computeGstClientSummaries } from '../utils/summaryUtils.ts';
import {
  GST_OUTSTANDING_UNALLOCATED_EXPLAIN,
  GST_UNALLOCATED_LABEL,
} from '../utils/gstCopy.ts';
import { LimeSelect } from './LimeSelect.tsx';
import { PortalPasswordCell } from './PortalPasswordCell.tsx';
import {
  PaginationBar,
  SummaryCard,
  SummaryToolbar,
  moneyPlain,
} from './SummaryShared.tsx';
import { useIsCompactLayout } from '../hooks/useMediaQuery.ts';
import { GstSummaryMobileCards } from './mobile/SummaryMobileCards.tsx';

interface GstSummaryProps {
  clients: GstClientRecord[];
  months: string[];
}

type GstFilter = 'all' | 'dues' | 'paid' | 'not-filed';
type GstSort = 'outstanding' | 'billed' | 'name' | 'latest';

const COL_COUNT = 10;

function shortMonth(m: string): string {
  const parts = m.trim().split(/\s+/);
  return parts.length >= 2 ? `${parts[0].slice(0, 3)} ${parts[1].slice(2)}` : m;
}

function dash(value: string | undefined | null): string {
  const v = (value || '').trim();
  return v || '—';
}

function toggleId(set: Set<string>, id: string): Set<string> {
  const next = new Set(set);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  if (!value.trim()) return null;
  return (
    <button
      type="button"
      title="Copy"
      onClick={(e) => {
        e.stopPropagation();
        void navigator.clipboard?.writeText(value).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1200);
        });
      }}
      className="inline-flex items-center justify-center w-6 h-6 rounded-md text-[var(--muted)] hover:bg-[var(--frost-100)] hover:text-[var(--ink)] shrink-0"
    >
      {copied ? (
        <Check className="w-3.5 h-3.5 text-[var(--success)]" />
      ) : (
        <Copy className="w-3.5 h-3.5" />
      )}
    </button>
  );
}

function MonthHistory({ company }: { company: GstClientRecord }) {
  const history = useMemo(() => {
    const filed = sortGstMonths(Object.keys(company.filings || {}));
    return [...filed].reverse().map((month) => {
      const f = company.filings[month];
      const fees = Math.max(0, Number(f?.fees) || 0);
      const interest = Math.max(0, Number(f?.interest) || 0);
      const tax = Math.max(0, Number(f?.tax) || 0);
      const total =
        typeof f?.total === 'number' && Number.isFinite(f.total)
          ? Math.max(0, f.total)
          : computeGstFilingTotal(fees, interest, tax);
      return { month, fees, interest, tax, total };
    });
  }, [company]);

  if (history.length === 0) {
    return (
      <p className="px-3 py-4 text-center text-[12px] text-[var(--muted)]">
        No monthly filings yet
      </p>
    );
  }

  return (
    <div className="max-w-full overflow-x-auto overscroll-x-contain rounded-xl border border-[var(--line)] bg-[var(--card)]">
      <table className="w-full min-w-[420px] text-[12px] border-collapse">
        <thead>
          <tr className="bg-[var(--navy-900)] text-white">
            <th className="px-3 py-2 text-left font-semibold">Month</th>
            <th className="px-3 py-2 text-right font-semibold">Fees</th>
            <th className="px-3 py-2 text-right font-semibold">Interest</th>
            <th className="px-3 py-2 text-right font-semibold">Tax</th>
            <th className="px-3 py-2 text-right font-semibold">Total</th>
          </tr>
        </thead>
        <tbody>
          {history.map((d) => (
            <tr key={d.month} className="border-t border-[var(--line)]">
              <td className="px-3 py-2.5 font-mono font-medium whitespace-nowrap">
                {d.month}
              </td>
              <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                {moneyPlain(d.fees)}
              </td>
              <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                {moneyPlain(d.interest)}
              </td>
              <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                {moneyPlain(d.tax)}
              </td>
              <td className="px-3 py-2.5 text-right font-mono tabular-nums font-semibold">
                {moneyPlain(d.total)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function GstClientSummaryView({ clients, months }: GstSummaryProps) {
  const isCompact = useIsCompactLayout();
  const sortedMonths = useMemo(() => sortGstMonths(months), [months]);
  const currentMonth = sortedMonths[sortedMonths.length - 1] || '';
  const currentLabel = currentMonth ? shortMonth(currentMonth) : 'current';

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<GstFilter>('all');
  const [sortMode, setSortMode] = useState<GstSort>('outstanding');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set());
  const companiesById = useMemo(() => {
    const map = new Map<string, GstClientRecord>();
    for (const c of clients) map.set(c.id, c);
    return map;
  }, [clients]);

  const rows = useMemo(() => {
    let list = computeGstClientSummaries(clients, sortedMonths).map((r) => {
      const company = companiesById.get(r.id);
      const filed = sortGstMonths(Object.keys(company?.filings || {}));
      return {
        ...r,
        hasPortalPassword: !!company?.hasPortalPassword,
        firstMonth: filed[0] || '—',
        lastMonth: filed[filed.length - 1] || '—',
        filedCurrent: currentMonth
          ? r.monthTotals[currentMonth] != null
          : false,
      };
    });

    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) =>
          r.companyName.toLowerCase().includes(q) ||
          r.userId.toLowerCase().includes(q) ||
          r.phone.toLowerCase().includes(q) ||
          r.referenceNumber.toLowerCase().includes(q) ||
          r.remark.toLowerCase().includes(q)
      );
    }

    list = list.filter((r) => {
      if (filter === 'dues') return r.outstanding > 0;
      if (filter === 'paid') return r.outstanding === 0 && r.monthsFiled > 0;
      if (filter === 'not-filed') return !r.filedCurrent;
      return true;
    });

    list = [...list].sort((a, b) => {
      if (sortMode === 'billed') return b.totalBilled - a.totalBilled;
      if (sortMode === 'name') return a.companyName.localeCompare(b.companyName);
      if (sortMode === 'latest') {
        const aKey = a.lastMonth === '—' ? '' : a.lastMonth;
        const bKey = b.lastMonth === '—' ? '' : b.lastMonth;
        return (
          bKey.localeCompare(aKey) || a.companyName.localeCompare(b.companyName)
        );
      }
      return (
        b.outstanding - a.outstanding ||
        a.companyName.localeCompare(b.companyName)
      );
    });

    return list;
  }, [clients, sortedMonths, search, filter, sortMode, currentMonth, companiesById]);

  useEffect(() => {
    setPage(1);
  }, [clients, filter, sortMode, pageSize, search]);

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  const pageRows = rows.slice((safePage - 1) * pageSize, safePage * pageSize);

  const totals = useMemo(
    () => ({
      billed: rows.reduce((s, r) => s + r.totalBilled, 0),
      received: rows.reduce((s, r) => s + r.totalReceived, 0),
      outstanding: rows.reduce((s, r) => s + r.outstanding, 0),
    }),
    [rows]
  );

  const onRowKey = (e: KeyboardEvent, id: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setOpenIds((prev) => toggleId(prev, id));
    }
  };

  const filterOptions: { id: GstFilter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'dues', label: 'Dues pending' },
    { id: 'paid', label: 'Fully paid' },
    { id: 'not-filed', label: `Not filed ${currentLabel}` },
  ];

  return (
    <SummaryCard
      title="Company Summary"
      subtitle="Expand a company to see month-wise fees, interest, tax, and total."
      toolbar={
        <SummaryToolbar
          search={search}
          onSearch={setSearch}
          searchPlaceholder="Search company, user ID, phone, ref…"
          filterOptions={filterOptions}
          filter={filter}
          onFilter={setFilter}
          countLabel={`${rows.length} companies`}
          sortControl={
            <label className="flex items-center gap-2 text-[11px] text-[var(--muted)]">
              <span className="font-medium">Sort</span>
              <LimeSelect
                value={sortMode}
                onChange={(v) => setSortMode(v as GstSort)}
                ariaLabel="Sort companies"
                className="w-[168px]"
                buttonClassName="py-1.5 px-2.5 text-[11px]"
                options={[
                  { value: 'outstanding', label: 'Most outstanding' },
                  { value: 'billed', label: 'Highest billed' },
                  { value: 'name', label: 'Name A–Z' },
                  { value: 'latest', label: 'Latest filing' },
                ]}
              />
            </label>
          }
        />
      }
      pagination={
        <PaginationBar
          page={safePage}
          pageSize={pageSize}
          total={rows.length}
          entityPlural="companies"
          onPage={setPage}
          onPageSize={setPageSize}
        />
      }
    >
      {isCompact ? (
        <GstSummaryMobileCards
          rows={pageRows}
          openIds={openIds}
          onToggle={(id) => setOpenIds((prev) => toggleId(prev, id))}
          renderExpanded={(row) => {
            const company = companiesById.get(row.id);
            return company ? (
              <MonthHistory company={company} />
            ) : (
              <p className="text-xs text-[var(--muted)]">Details unavailable.</p>
            );
          }}
        />
      ) : (
      <div className="overflow-x-auto ledger-scroll">
        <table className="w-full border-collapse text-left text-[12px] min-w-[1100px]">
          <thead>
            <tr className="bg-[var(--navy-900)] text-white text-[11px]">
              <th className="px-3 py-3 font-medium sticky left-0 z-10 bg-[var(--navy-900)] whitespace-nowrap">
                Company Name *
              </th>
              <th className="px-3 py-3 font-medium whitespace-nowrap">
                User ID *
              </th>
              <th className="px-3 py-3 font-medium whitespace-nowrap">
                Password *
              </th>
              <th className="px-3 py-3 font-medium whitespace-nowrap">Phone</th>
              <th className="px-3 py-3 font-medium whitespace-nowrap">
                Ref No
              </th>
              <th className="px-3 py-3 font-medium whitespace-nowrap">
                Remark
              </th>
              <th className="px-3 py-3 font-medium whitespace-nowrap">
                Monthly Filing
              </th>
              <th className="px-3 py-3 font-medium text-right whitespace-nowrap">
                Total Recd
              </th>
              <th className="px-3 py-3 font-medium text-right whitespace-nowrap">
                Outstanding
              </th>
              <th className="px-3 py-3 font-medium text-center w-10">Action</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr>
                <td
                  colSpan={COL_COUNT}
                  className="px-4 py-14 text-center text-[var(--muted)]"
                >
                  <p className="font-medium text-[var(--ink)]">
                    No companies match
                  </p>
                  <p className="mt-1 text-[12px]">
                    Clear the search or filter to see more companies.
                  </p>
                </td>
              </tr>
            ) : (
              pageRows.map((row) => {
                const open = openIds.has(row.id);
                const company = companiesById.get(row.id);
                const filingLabel =
                  row.monthsFiled > 0
                    ? `${row.monthsFiled} Month${
                        row.monthsFiled === 1 ? '' : 's'
                      } · ${moneyPlain(row.totalBilled)}`
                    : '—';

                return (
                  <Fragment key={row.id}>
                    <tr
                      tabIndex={0}
                      role="button"
                      aria-expanded={open}
                      className="border-t border-[var(--line)] hover:bg-[var(--frost-100)] cursor-pointer outline-none focus-visible:bg-[var(--frost-100)] group"
                      onClick={() =>
                        setOpenIds((prev) => toggleId(prev, row.id))
                      }
                      onKeyDown={(e) => onRowKey(e, row.id)}
                    >
                      <td className="px-3 py-3.5 sticky left-0 z-10 bg-[var(--card)] group-hover:bg-[var(--sky-200)] whitespace-nowrap">
                        <span className="font-semibold text-[13px] text-[var(--ink)]">
                          {row.companyName}
                        </span>
                      </td>
                      <td className="px-3 py-3.5 whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <span className="font-mono text-[var(--ink)]">
                            {dash(row.userId)}
                          </span>
                          {row.userId ? (
                            <CopyButton value={row.userId} />
                          ) : null}
                        </div>
                      </td>
                      <td
                        className="px-3 py-3.5 whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <PortalPasswordCell
                          kind="gst"
                          id={row.id}
                          hasPassword={!!row.hasPortalPassword}
                        />
                      </td>
                      <td className="px-3 py-3.5 whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <span className="font-mono text-[var(--ink)]">
                            {dash(row.phone)}
                          </span>
                          {row.phone ? (
                            <CopyButton value={row.phone} />
                          ) : null}
                        </div>
                      </td>
                      <td className="px-3 py-3.5 font-mono text-[var(--muted)] whitespace-nowrap">
                        {dash(row.referenceNumber)}
                      </td>
                      <td className="px-3 py-3.5 text-[var(--muted)] max-w-[200px] truncate">
                        {dash(row.remark)}
                      </td>
                      <td className="px-3 py-3.5 whitespace-nowrap font-semibold text-[var(--blue-500)]">
                        {filingLabel}
                      </td>
                      <td className="px-3 py-3.5 text-right font-mono tabular-nums text-[var(--success)]">
                        <div>{moneyPlain(row.totalReceived)}</div>
                        {row.unallocatedReceived > 0 && (
                          <div className="text-[10px] font-medium text-[var(--muted)]">
                            {GST_UNALLOCATED_LABEL}{' '}
                            {moneyPlain(row.unallocatedReceived)}
                          </div>
                        )}
                      </td>
                      <td
                        className={`px-3 py-3.5 text-right font-mono tabular-nums font-semibold ${
                          row.outstanding > 0
                            ? 'text-[var(--blue-500)]'
                            : 'text-[var(--ink)]'
                        }`}
                      >
                        <div>{moneyPlain(row.outstanding)}</div>
                        {row.unallocatedReceived > 0 && (
                          <div
                            className="text-[10px] font-medium text-[var(--muted)]"
                            title={GST_OUTSTANDING_UNALLOCATED_EXPLAIN}
                          >
                            Incl. unallocated in company total
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3.5 text-center text-[var(--muted)]">
                        {open ? (
                          <ChevronDown className="w-4 h-4 inline-block" />
                        ) : (
                          <ChevronRight className="w-4 h-4 inline-block" />
                        )}
                      </td>
                    </tr>
                    {open && company ? (
                      <tr className="bg-[var(--frost-100)]">
                        <td
                          colSpan={COL_COUNT}
                          className="px-4 pb-4 pt-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MonthHistory company={company} />
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })
            )}
          </tbody>
          {rows.length > 0 ? (
            <tfoot>
              <tr className="bg-[var(--frost-100)] border-t border-[var(--line)] text-xs font-semibold text-[var(--ink)]">
                <td className="px-3 py-3" colSpan={6}>
                  Total ({rows.length} companies)
                </td>
                <td className="px-3 py-3 font-mono tabular-nums text-[var(--blue-500)]">
                  {moneyPlain(totals.billed)}
                </td>
                <td className="px-3 py-3 text-right font-mono tabular-nums text-[var(--success)]">
                  {moneyPlain(totals.received)}
                </td>
                <td className="px-3 py-3 text-right font-mono tabular-nums text-[var(--blue-500)]">
                  {moneyPlain(totals.outstanding)}
                </td>
                <td className="px-3 py-3" />
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
      )}
    </SummaryCard>
  );
}
