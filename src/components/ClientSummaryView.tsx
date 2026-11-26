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
import { computeClientSummaries } from '../utils/summaryUtils.ts';
import { LimeSelect } from './LimeSelect.tsx';
import {
  PaginationBar,
  SummaryCard,
  SummaryToolbar,
  moneyPlain,
} from './SummaryShared.tsx';
import { useIsCompactLayout } from '../hooks/useMediaQuery.ts';
import { ClientSummaryMobileCards } from './mobile/SummaryMobileCards.tsx';

interface ClientSummaryViewProps {
  clients: ClientRecord[];
  years: string[];
}

type ClientFilter = 'all' | 'dues' | 'paid' | 'not-filed';
type ClientSort = 'outstanding' | 'billed' | 'name' | 'latest';
type YearStatus = 'paid' | 'part' | 'unpaid';

const COL_COUNT = 13;

function ayShort(ay: string): string {
  return ay.replace(/^AY\s*/i, '');
}

function resolveCurrentAy(years: string[]): string {
  const now = new Date();
  const thisYear = now.getFullYear();
  const month = now.getMonth(); // April = 3
  const startYear = month >= 3 ? thisYear : thisYear - 1;
  const label = `AY ${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`;
  const sorted = sortAssessmentYears(years);
  if (sorted.includes(label)) return label;
  const candidates = sorted.filter((y) => {
    const m = y.match(/(\d{4})/);
    return m ? Number(m[1]) <= startYear : false;
  });
  return candidates[candidates.length - 1] || sorted[sorted.length - 1] || label;
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

function StatusBadge({ kind }: { kind: YearStatus }) {
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

function dash(value: string | undefined | null): string {
  const v = (value || '').trim();
  return v || '—';
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
      <p className="px-3 py-4 text-center text-[12px] text-[var(--muted)]">
        No filings yet
      </p>
    );
  }

  return (
    <div className="max-w-full overflow-x-auto overscroll-x-contain rounded-xl border border-[var(--line)] bg-[var(--card)]">
      <table className="w-full min-w-[560px] text-[12px] border-collapse">
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
                <StatusBadge kind={d.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ClientSummaryView({ clients, years }: ClientSummaryViewProps) {
  const isCompact = useIsCompactLayout();
  const currentYear = useMemo(() => resolveCurrentAy(years), [years]);
  const currentYearShort = ayShort(currentYear);

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<ClientFilter>('all');
  const [sortMode, setSortMode] = useState<ClientSort>('outstanding');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set());

  const clientsById = useMemo(() => {
    const map = new Map<string, ClientRecord>();
    for (const c of clients) map.set(c.id, c);
    return map;
  }, [clients]);

  const rows = useMemo(() => {
    let list = computeClientSummaries(clients, years);

    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((r) => {
        const client = clientsById.get(r.id);
        return (
          r.name.toLowerCase().includes(q) ||
          r.pan.toLowerCase().includes(q) ||
          r.mobile.toLowerCase().includes(q) ||
          (client?.otherMobiles || '').toLowerCase().includes(q) ||
          (client?.nameVariants || '').toLowerCase().includes(q)
        );
      });
    }

    list = list.filter((r) => {
      if (filter === 'dues') return r.outstanding > 0;
      if (filter === 'paid') return r.outstanding === 0 && r.yearsFiled > 0;
      if (filter === 'not-filed') return r.yearBilled[currentYear] == null;
      return true;
    });

    list = [...list].sort((a, b) => {
      if (sortMode === 'billed') return b.totalBilled - a.totalBilled;
      if (sortMode === 'name') return a.name.localeCompare(b.name);
      if (sortMode === 'latest') {
        const aKey = a.lastAy === '—' ? '' : a.lastAy;
        const bKey = b.lastAy === '—' ? '' : b.lastAy;
        return bKey.localeCompare(aKey) || a.name.localeCompare(b.name);
      }
      return b.outstanding - a.outstanding || a.name.localeCompare(b.name);
    });

    return list;
  }, [clients, years, filter, sortMode, currentYear, search, clientsById]);

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

  const filterOptions: { id: ClientFilter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'dues', label: 'Dues pending' },
    { id: 'paid', label: 'Fully paid' },
    { id: 'not-filed', label: `Not filed ${currentYearShort}` },
  ];

  return (
    <SummaryCard
      title="Client Summary"
      subtitle="Expand a client to see assessment-year fees, received, and balance."
      toolbar={
        <SummaryToolbar
          search={search}
          onSearch={setSearch}
          searchPlaceholder="Search name, PAN, mobile…"
          filterOptions={filterOptions}
          filter={filter}
          onFilter={setFilter}
          countLabel={`${rows.length} clients`}
          sortControl={
            <label className="flex items-center gap-2 text-[11px] text-[var(--muted)]">
              <span className="font-medium">Sort</span>
              <LimeSelect
                value={sortMode}
                onChange={(v) => setSortMode(v as ClientSort)}
                ariaLabel="Sort clients"
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
          entityPlural="clients"
          onPage={setPage}
          onPageSize={setPageSize}
        />
      }
    >
      {isCompact ? (
        <ClientSummaryMobileCards
          rows={pageRows}
          openIds={openIds}
          onToggle={(id) => setOpenIds((prev) => toggleId(prev, id))}
          renderExpanded={(row) => {
            const client = clientsById.get(row.id);
            return client ? (
              <YearHistory client={client} />
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
              <th className="px-3 py-3 font-medium whitespace-nowrap">
                Client ID (PAN)
              </th>
              <th className="px-3 py-3 font-medium sticky left-0 z-10 bg-[var(--navy-900)] whitespace-nowrap">
                Client Name
              </th>
              <th className="px-3 py-3 font-medium whitespace-nowrap">Mobile</th>
              <th className="px-3 py-3 font-medium whitespace-nowrap hidden lg:table-cell">
                Other Mobile(s)
              </th>
              <th className="px-3 py-3 font-medium whitespace-nowrap hidden lg:table-cell">
                Name Variants
              </th>
              <th className="px-3 py-3 font-medium text-right whitespace-nowrap">
                Years
              </th>
              <th className="px-3 py-3 font-medium text-right whitespace-nowrap hidden lg:table-cell">
                Entries
              </th>
              <th className="px-3 py-3 font-medium whitespace-nowrap hidden sm:table-cell">
                First AY
              </th>
              <th className="px-3 py-3 font-medium whitespace-nowrap hidden sm:table-cell">
                Last AY
              </th>
              <th className="px-3 py-3 font-medium text-right">Billed</th>
              <th className="px-3 py-3 font-medium text-right hidden sm:table-cell">
                Received
              </th>
              <th className="px-3 py-3 font-medium text-right">Outstanding</th>
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
                  <p className="font-medium text-[var(--ink)]">No clients match</p>
                  <p className="mt-1 text-[12px]">
                    Clear the search or filter to see more clients.
                  </p>
                </td>
              </tr>
            ) : (
              pageRows.map((row) => {
                const open = openIds.has(row.id);
                const client = clientsById.get(row.id);
                const otherMobiles = client?.otherMobiles || '';
                const nameVariants = client?.nameVariants || '';

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
                      <td className="px-3 py-3.5 whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <span className="font-mono text-[var(--ink)]">
                            {dash(row.pan)}
                          </span>
                          {row.pan ? <CopyButton value={row.pan} /> : null}
                        </div>
                      </td>
                      <td className="px-3 py-3.5 sticky left-0 z-10 bg-[var(--card)] group-hover:bg-[var(--sky-200)] whitespace-nowrap">
                        <span className="font-semibold text-[13px] text-[var(--ink)]">
                          {row.name}
                        </span>
                      </td>
                      <td className="px-3 py-3.5 whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <span className="font-mono text-[var(--ink)]">
                            {dash(row.mobile)}
                          </span>
                          {row.mobile ? (
                            <CopyButton value={row.mobile} />
                          ) : null}
                        </div>
                      </td>
                      <td className="px-3 py-3.5 font-mono text-[var(--muted)] whitespace-nowrap hidden lg:table-cell">
                        {dash(otherMobiles)}
                      </td>
                      <td className="px-3 py-3.5 text-[var(--muted)] max-w-[160px] truncate hidden lg:table-cell">
                        {dash(nameVariants)}
                      </td>
                      <td className="px-3 py-3.5 text-right font-mono tabular-nums">
                        {row.yearsFiled}
                      </td>
                      <td className="px-3 py-3.5 text-right font-mono tabular-nums hidden lg:table-cell">
                        {row.totalEntries}
                      </td>
                      <td className="px-3 py-3.5 font-mono whitespace-nowrap hidden sm:table-cell">
                        {row.firstAy === '—' ? '—' : row.firstAy}
                      </td>
                      <td className="px-3 py-3.5 font-mono whitespace-nowrap hidden sm:table-cell">
                        {row.lastAy === '—' ? '—' : row.lastAy}
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
                      <td className="px-3 py-3.5 text-center text-[var(--muted)]">
                        {open ? (
                          <ChevronDown className="w-4 h-4 inline-block" />
                        ) : (
                          <ChevronRight className="w-4 h-4 inline-block" />
                        )}
                      </td>
                    </tr>
                    {open && client ? (
                      <tr className="bg-[var(--frost-100)]">
                        <td
                          colSpan={COL_COUNT}
                          className="px-4 pb-4 pt-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <YearHistory client={client} />
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
                <td className="px-3 py-3" colSpan={2}>
                  Total ({rows.length} clients)
                </td>
                <td className="px-3 py-3" />
                <td className="px-3 py-3 hidden lg:table-cell" />
                <td className="px-3 py-3 hidden lg:table-cell" />
                <td className="px-3 py-3" />
                <td className="px-3 py-3 hidden lg:table-cell" />
                <td className="px-3 py-3 hidden sm:table-cell" />
                <td className="px-3 py-3 hidden sm:table-cell" />
                <td className="px-3 py-3 text-right font-mono tabular-nums">
                  {moneyPlain(totals.billed)}
                </td>
                <td className="px-3 py-3 text-right font-mono tabular-nums text-[var(--success)] hidden sm:table-cell">
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
