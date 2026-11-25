import {
  Fragment,
  useEffect,
  useMemo,
  useState,
  type KeyboardEvent,
} from 'react';
import { Check, ChevronDown, ChevronRight, Copy } from 'lucide-react';
import type { ClientRecord } from '../types/ledger.ts';
import {
  computeBalance,
  formatDisplayDate,
  sortAssessmentYears,
} from '../utils/ledgerUtils.ts';
import {
  computeClientSummaries,
  computeMobileSummaries,
} from '../utils/summaryUtils.ts';
import { LimeSelect } from './LimeSelect.tsx';
import {
  PaginationBar,
  SummaryCard,
  SummaryShowMore,
  SummaryToolbar,
  moneyPlain,
} from './SummaryShared.tsx';
import { useIsCompactLayout } from '../hooks/useMediaQuery.ts';
import { MobileSummaryMobileCards } from './mobile/SummaryMobileCards.tsx';

interface MobileSummaryViewProps {
  clients: ClientRecord[];
  years: string[];
}

type MobileFilter = 'all' | 'dues' | 'paid' | 'multi';
type MobileSort = 'outstanding' | 'billed' | 'pans' | 'mobile';
type YearStatus = 'paid' | 'part' | 'unpaid';

const COL_COUNT = 12;
const LINKED_PAGE_SIZE = 50;

function ayShort(ay: string): string {
  return ay.replace(/^AY\s*/i, '');
}

function phoneGroupKey(phone: string): string {
  return (phone || '').trim() || 'No Mobile';
}

function openKey(mobile: string): string {
  if (!mobile || mobile === 'No Mobile') return '__none__';
  return mobile;
}

function toggleId(set: Set<string>, id: string): Set<string> {
  const next = new Set(set);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

function yearStatus(fees: number, received: number, balance: number): YearStatus {
  if (fees <= 0 || balance <= 0) return 'paid';
  if (received <= 0) return 'unpaid';
  return 'part';
}

function dash(value: string | undefined | null): string {
  const v = (value || '').trim();
  return v || '—';
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

function YearStatusBadge({ kind }: { kind: YearStatus }) {
  if (kind === 'paid') {
    return (
      <span className="inline-flex px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-[var(--success-15)] text-[var(--success)]">
        Paid
      </span>
    );
  }
  if (kind === 'part') {
    return (
      <span className="inline-flex px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-[var(--warning-15)] text-[var(--warning)]">
        Part paid
      </span>
    );
  }
  return (
    <span className="inline-flex px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-[var(--danger-15)] text-[var(--danger)]">
      Unpaid
    </span>
  );
}

function RowStatusBadge({
  outstanding,
  yearsFiled,
}: {
  outstanding: number;
  yearsFiled: number;
}) {
  if (yearsFiled <= 0) {
    return (
      <span className="inline-flex px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-[var(--frost-100)] text-[var(--muted)]">
        —
      </span>
    );
  }
  if (outstanding > 0) {
    return (
      <span className="inline-flex px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-[var(--danger-15)] text-[var(--danger)] whitespace-nowrap">
        Due {moneyPlain(outstanding)}
      </span>
    );
  }
  return (
    <span className="inline-flex px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-[var(--success-15)] text-[var(--success)]">
      Clear
    </span>
  );
}

function YearHistory({ client }: { client: ClientRecord }) {
  const history = useMemo(() => {
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
        status: yearStatus(fees, received, balance),
      };
    });
  }, [client]);

  if (history.length === 0) {
    return (
      <p className="px-3 py-3 text-center text-[12px] text-[var(--muted)]">
        No filings yet
      </p>
    );
  }

  return (
    <div className="mt-2 max-w-full overflow-x-auto overscroll-x-contain rounded-xl border border-[var(--line)] bg-[var(--card)]">
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
              Payment mode · date
            </th>
            <th className="px-3 py-2 text-left font-semibold">Status</th>
          </tr>
        </thead>
        <tbody>
          {history.map((d) => (
            <tr key={d.year} className="border-t border-[var(--line)]">
              <td className="px-3 py-2.5 font-mono font-medium whitespace-nowrap">
                {ayShort(d.year)}
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
                <YearStatusBadge kind={d.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LinkedClientRow({
  client,
  years,
}: {
  client: ClientRecord;
  years: string[];
}) {
  const [yearsOpen, setYearsOpen] = useState(false);
  const summary = useMemo(() => {
    const rows = computeClientSummaries([client], years);
    return rows[0];
  }, [client, years]);

  if (!summary) return null;

  return (
    <tr className="border-t border-[var(--line)] align-top">
      <td className="px-3 py-2.5 whitespace-nowrap">
        <div className="flex items-center gap-1">
          <span className="font-mono">{dash(summary.pan)}</span>
          {summary.pan ? <CopyButton value={summary.pan} /> : null}
        </div>
      </td>
      <td className="px-3 py-2.5">
        <p className="font-medium text-[var(--ink)]">{summary.name}</p>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setYearsOpen((v) => !v);
          }}
          className="mt-1 text-[11px] font-semibold text-[var(--blue-500)] hover:underline"
        >
          Years {yearsOpen ? '▾' : '▸'}
        </button>
        {yearsOpen ? <YearHistory client={client} /> : null}
      </td>
      <td className="px-3 py-2.5 text-right font-mono tabular-nums">
        {summary.yearsFiled}
      </td>
      <td className="px-3 py-2.5 font-mono whitespace-nowrap text-[var(--muted)]">
        {summary.yearsFiled > 0
          ? `${summary.firstAy} → ${summary.lastAy}`
          : '—'}
      </td>
      <td className="px-3 py-2.5 text-right font-mono tabular-nums">
        {moneyPlain(summary.totalBilled)}
      </td>
      <td className="px-3 py-2.5 text-right font-mono tabular-nums text-[var(--success)]">
        {moneyPlain(summary.totalReceived)}
      </td>
      <td
        className={`px-3 py-2.5 text-right font-mono tabular-nums font-semibold ${
          summary.outstanding > 0 ? 'text-[var(--blue-500)]' : 'text-[var(--ink)]'
        }`}
      >
        {moneyPlain(summary.outstanding)}
      </td>
      <td className="px-3 py-2.5">
        <RowStatusBadge
          outstanding={summary.outstanding}
          yearsFiled={summary.yearsFiled}
        />
      </td>
    </tr>
  );
}

function LinkedClientsPanel({
  linked,
  years,
}: {
  linked: ClientRecord[];
  years: string[];
}) {
  const [visible, setVisible] = useState(LINKED_PAGE_SIZE);
  const shown = linked.slice(0, visible);
  const remaining = linked.length - shown.length;

  return (
    <div className="mt-1 rounded-xl border border-[var(--line)] overflow-hidden bg-[var(--card)]">
      <p className="px-3 py-2 text-[11px] font-semibold text-[var(--muted)] bg-[var(--frost-100)]">
        Linked clients ({linked.length})
      </p>
      {linked.length === 0 ? (
        <p className="px-3 py-4 text-center text-[12px] text-[var(--muted)]">
          No linked clients
        </p>
      ) : (
        <>
          <div className="max-w-full overflow-x-auto overscroll-x-contain">
            <table className="w-full text-[12px] border-collapse">
              <thead>
                <tr className="bg-[var(--navy-900)] text-white">
                  <th className="px-3 py-2 text-left font-semibold">PAN</th>
                  <th className="px-3 py-2 text-left font-semibold">Name</th>
                  <th className="px-3 py-2 text-right font-semibold">Years</th>
                  <th className="px-3 py-2 text-left font-semibold whitespace-nowrap">
                    First AY → Last AY
                  </th>
                  <th className="px-3 py-2 text-right font-semibold">Billed</th>
                  <th className="px-3 py-2 text-right font-semibold">Received</th>
                  <th className="px-3 py-2 text-right font-semibold">
                    Outstanding
                  </th>
                  <th className="px-3 py-2 text-left font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((c) => (
                  <LinkedClientRow key={c.id} client={c} years={years} />
                ))}
              </tbody>
            </table>
          </div>
          <SummaryShowMore
            remaining={remaining}
            onShowMore={() => setVisible((v) => v + LINKED_PAGE_SIZE)}
          />
        </>
      )}
    </div>
  );
}

export function MobileSummaryView({ clients, years }: MobileSummaryViewProps) {
  const isCompact = useIsCompactLayout();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<MobileFilter>('all');
  const [sortMode, setSortMode] = useState<MobileSort>('outstanding');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set());

  const clientsByPhone = useMemo(() => {
    const map = new Map<string, ClientRecord[]>();
    for (const c of clients) {
      const key = phoneGroupKey(c.phone);
      const list = map.get(key) || [];
      list.push(c);
      map.set(key, list);
    }
    return map;
  }, [clients]);

  const rows = useMemo(() => {
    let list = computeMobileSummaries(clients, years);

    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) =>
          r.mobile.toLowerCase().includes(q) ||
          r.namesLinked.some((n) => n.toLowerCase().includes(q)) ||
          r.pansLinked.some((p) => p.toLowerCase().includes(q)) ||
          r.remark.toLowerCase().includes(q)
      );
    }

    list = list.filter((r) => {
      if (filter === 'dues') return r.outstanding > 0;
      if (filter === 'paid') return r.outstanding === 0 && r.yearsFiled > 0;
      if (filter === 'multi') return r.clientsCount > 1;
      return true;
    });

    list = [...list].sort((a, b) => {
      if (sortMode === 'billed') return b.totalBilled - a.totalBilled;
      if (sortMode === 'pans') {
        return (
          b.clientsCount - a.clientsCount || a.mobile.localeCompare(b.mobile)
        );
      }
      if (sortMode === 'mobile') return a.mobile.localeCompare(b.mobile);
      return b.outstanding - a.outstanding || a.mobile.localeCompare(b.mobile);
    });

    return list;
  }, [clients, years, filter, sortMode, search]);

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

  const onRowKey = (e: KeyboardEvent, key: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setOpenIds((prev) => toggleId(prev, key));
    }
  };

  const filterOptions: { id: MobileFilter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'dues', label: 'Dues pending' },
    { id: 'paid', label: 'Fully paid' },
    { id: 'multi', label: 'Multiple PANs' },
  ];

  return (
    <SummaryCard
      title="Mobile Summary"
      subtitle="Expand a mobile to see linked clients and assessment-year details."
      toolbar={
        <SummaryToolbar
          search={search}
          onSearch={setSearch}
          searchPlaceholder="Search mobile, name, PAN, note…"
          filterOptions={filterOptions}
          filter={filter}
          onFilter={setFilter}
          countLabel={`${rows.length} mobile numbers`}
          sortControl={
            <label className="flex items-center gap-2 text-[11px] text-[var(--muted)]">
              <span className="font-medium">Sort</span>
              <LimeSelect
                value={sortMode}
                onChange={(v) => setSortMode(v as MobileSort)}
                ariaLabel="Sort mobile numbers"
                className="w-[168px]"
                buttonClassName="py-1.5 px-2.5 text-[11px]"
                options={[
                  { value: 'outstanding', label: 'Most outstanding' },
                  { value: 'billed', label: 'Highest billed' },
                  { value: 'pans', label: 'Most PANs' },
                  { value: 'mobile', label: 'Mobile number' },
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
          entityPlural="mobile numbers"
          onPage={setPage}
          onPageSize={setPageSize}
        />
      }
    >
      {isCompact ? (
        <MobileSummaryMobileCards
          rows={pageRows}
          openIds={openIds}
          onToggle={(key) => setOpenIds((prev) => toggleId(prev, key))}
          renderExpanded={(row) => {
            const linked = clientsByPhone.get(row.mobile) || [];
            return <LinkedClientsPanel linked={linked} years={years} />;
          }}
        />
      ) : (
      <div className="overflow-x-auto ledger-scroll">
        <table className="w-full border-collapse text-left text-[12px] min-w-[1200px]">
          <thead>
            <tr className="bg-[var(--navy-900)] text-white text-[11px]">
              <th className="px-3 py-3 font-medium sticky left-0 z-10 bg-[var(--navy-900)] whitespace-nowrap">
                Mobile Number
              </th>
              <th className="px-3 py-3 font-medium text-right whitespace-nowrap">
                PANs Linked
              </th>
              <th className="px-3 py-3 font-medium whitespace-nowrap">
                Names Linked
              </th>
              <th className="px-3 py-3 font-medium text-right whitespace-nowrap hidden sm:table-cell">
                Years Filed
              </th>
              <th className="px-3 py-3 font-medium whitespace-nowrap hidden lg:table-cell">
                First AY
              </th>
              <th className="px-3 py-3 font-medium whitespace-nowrap hidden lg:table-cell">
                Last AY
              </th>
              <th className="px-3 py-3 font-medium text-right whitespace-nowrap hidden lg:table-cell">
                Entries
              </th>
              <th className="px-3 py-3 font-medium text-right">Billed</th>
              <th className="px-3 py-3 font-medium text-right hidden sm:table-cell">
                Received
              </th>
              <th className="px-3 py-3 font-medium text-right">Outstanding</th>
              <th className="px-3 py-3 font-medium whitespace-nowrap hidden lg:table-cell">
                Note
              </th>
              <th className="px-3 py-3 font-medium text-center w-10">More</th>
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
                    No mobile numbers match
                  </p>
                  <p className="mt-1 text-[12px]">
                    Clear the search or filter to see more records.
                  </p>
                </td>
              </tr>
            ) : (
              pageRows.map((row) => {
                const key = openKey(row.mobile);
                const open = openIds.has(key);
                const noMobile =
                  !row.mobile || row.mobile === 'No Mobile';
                const namesFull = row.namesLinked.join(', ');
                const namesPreview =
                  row.namesLinked.length === 0
                    ? '—'
                    : row.namesLinked.length <= 2
                      ? namesFull
                      : `${row.namesLinked.slice(0, 2).join(', ')} +${row.namesLinked.length - 2} more`;
                const linked = clientsByPhone.get(row.mobile) || [];

                return (
                  <Fragment key={key}>
                    <tr
                      tabIndex={0}
                      role="button"
                      aria-expanded={open}
                      className="border-t border-[var(--line)] hover:bg-[var(--frost-100)] cursor-pointer outline-none focus-visible:bg-[var(--frost-100)] group"
                      onClick={() =>
                        setOpenIds((prev) => toggleId(prev, key))
                      }
                      onKeyDown={(e) => onRowKey(e, key)}
                    >
                      <td className="px-3 py-3.5 sticky left-0 z-10 bg-[var(--card)] group-hover:bg-[var(--sky-200)] whitespace-nowrap">
                        {noMobile ? (
                          <span className="italic text-[var(--muted)]">
                            No mobile number
                          </span>
                        ) : (
                          <div className="flex items-center gap-1">
                            <span className="font-mono font-bold text-[var(--ink)]">
                              {row.mobile}
                            </span>
                            <CopyButton value={row.mobile} />
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3.5 text-right font-mono tabular-nums">
                        {row.clientsCount}
                      </td>
                      <td
                        className="px-3 py-3.5 max-w-[260px] truncate"
                        title={namesFull || undefined}
                      >
                        <span className="text-[var(--ink)]">
                          {row.namesLinked.length <= 2 ? (
                            namesPreview
                          ) : (
                            <>
                              {row.namesLinked.slice(0, 2).join(', ')}{' '}
                              <span className="text-[var(--muted)]">
                                +{row.namesLinked.length - 2} more
                              </span>
                            </>
                          )}
                        </span>
                      </td>
                      <td className="px-3 py-3.5 text-right font-mono tabular-nums hidden sm:table-cell">
                        {row.yearsFiled}
                      </td>
                      <td className="px-3 py-3.5 font-mono whitespace-nowrap hidden lg:table-cell">
                        {row.firstAy === '—' ? '—' : row.firstAy}
                      </td>
                      <td className="px-3 py-3.5 font-mono whitespace-nowrap hidden lg:table-cell">
                        {row.lastAy === '—' ? '—' : row.lastAy}
                      </td>
                      <td className="px-3 py-3.5 text-right font-mono tabular-nums hidden lg:table-cell">
                        {row.totalEntries}
                      </td>
                      <td className="px-3 py-3.5 text-right font-mono tabular-nums">
                        {moneyPlain(row.totalBilled)}
                      </td>
                      <td className="px-3 py-3.5 text-right font-mono tabular-nums text-[var(--success)] hidden sm:table-cell">
                        {moneyPlain(row.totalReceived)}
                      </td>
                      <td
                        className={`px-3 py-3.5 text-right font-mono tabular-nums font-semibold ${
                          row.outstanding > 0
                            ? 'text-[var(--blue-500)]'
                            : 'text-[var(--ink)]'
                        }`}
                      >
                        {moneyPlain(row.outstanding)}
                      </td>
                      <td
                        className="px-3 py-3.5 text-[var(--muted)] max-w-[200px] truncate hidden lg:table-cell"
                        title={row.remark || undefined}
                      >
                        {dash(row.remark)}
                      </td>
                      <td className="px-3 py-3.5 text-center text-[var(--muted)]">
                        {open ? (
                          <ChevronDown className="w-4 h-4 inline-block" />
                        ) : (
                          <ChevronRight className="w-4 h-4 inline-block" />
                        )}
                      </td>
                    </tr>
                    {open ? (
                      <tr className="bg-[var(--frost-100)]">
                        <td
                          colSpan={COL_COUNT}
                          className="px-4 pb-4 pt-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <LinkedClientsPanel
                            linked={linked}
                            years={years}
                          />
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
                <td className="px-3 py-3 sticky left-0 z-10 bg-[var(--frost-100)]" colSpan={2}>
                  Total ({rows.length} mobile numbers)
                </td>
                <td className="px-3 py-3" />
                <td className="px-3 py-3 hidden sm:table-cell" />
                <td className="px-3 py-3 hidden lg:table-cell" />
                <td className="px-3 py-3 hidden lg:table-cell" />
                <td className="px-3 py-3 hidden lg:table-cell" />
                <td className="px-3 py-3 text-right font-mono tabular-nums">
                  {moneyPlain(totals.billed)}
                </td>
                <td className="px-3 py-3 text-right font-mono tabular-nums text-[var(--success)] hidden sm:table-cell">
                  {moneyPlain(totals.received)}
                </td>
                <td className="px-3 py-3 text-right font-mono tabular-nums text-[var(--blue-500)]">
                  {moneyPlain(totals.outstanding)}
                </td>
                <td className="px-3 py-3 hidden lg:table-cell" />
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
