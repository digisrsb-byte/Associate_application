import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import type { ClientRecord, GstClientRecord } from '../types/ledger.ts';
import {
  computeBalance,
  computeGstClientTotals,
  formatCurrency,
} from '../utils/ledgerUtils.ts';
import {
  computeGstMonthSummary,
  computeYearSummary,
} from '../utils/summaryUtils.ts';
import { fadeUp, springSoft, staggerContainer } from '../motion/presets.ts';
import {
  buildBillingHoverTipLines,
  buildGstHoverTipLines,
  DashboardHoverTip,
  shortAyLabel,
  type HoverTipModel,
} from './shared/DashboardHoverTip.tsx';
import { useIsCompactLayout } from '../hooks/useMediaQuery.ts';
import { MobileDashboard } from './mobile/MobileDashboard.tsx';

interface OverallDashboardProps {
  itClients: ClientRecord[];
  assessmentYears: string[];
  gstClients: GstClientRecord[];
  gstMonths: string[];
  onAddClient: () => void;
  onAddCompany: () => void;
  onExportCsv: () => void;
  onOpenItAllData: () => void;
  onOpenGstAllData: () => void;
}

function inr(n: number): string {
  return formatCurrency(Math.max(0, Math.round(n)));
}

const shortAy = shortAyLabel;

function shortMonth(m: string): string {
  const parts = m.trim().split(/\s+/);
  if (parts.length >= 2) return `${parts[0].slice(0, 3)} ${parts[1].slice(2)}`;
  return m;
}

/** Rounded top corners only — used for the top stack segment of a column. */
function roundedTopRect(
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): string {
  if (h <= 0 || w <= 0) return '';
  const rr = Math.min(r, w / 2, h);
  if (rr <= 0) {
    return `M${x} ${y + h}H${x + w}V${y}H${x}Z`;
  }
  return `M${x} ${y + h}V${y + rr}Q${x} ${y} ${x + rr} ${y}H${x + w - rr}Q${x + w} ${y} ${x + w} ${y + rr}V${y + h}Z`;
}

const BILLING_RECEIVED = 'var(--navy-900)';
const BILLING_OUTSTANDING = 'var(--ice)';
const GST_TREND = '#2a78d6';
const GST_MONTH_NAMES = [
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

function parseGstMonthLabel(
  label: string
): { y: number; m: number } | null {
  const parts = label.trim().split(/\s+/);
  if (parts.length < 2) return null;
  const mi = GST_MONTH_NAMES.findIndex(
    (x) => x.toLowerCase() === parts[0].slice(0, 3).toLowerCase()
  );
  const y = Number(parts[1]);
  if (mi < 0 || !Number.isFinite(y)) return null;
  return { y, m: mi };
}

function gstMonthIndex(label: string): number {
  const p = parseGstMonthLabel(label);
  return p ? p.y * 12 + p.m : 0;
}

/** Monotone cubic with tension 0.25 — does not overshoot extrema. */
function monotonePath(pts: [number, number][], tension = 0.25): string {
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M${pts[0][0]} ${pts[0][1]}`;
  const n = pts.length;
  const dx: number[] = [];
  const dy: number[] = [];
  const m: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(pts[i + 1][0] - pts[i][0]);
    dy.push(pts[i + 1][1] - pts[i][1]);
    m.push(dy[i] / (dx[i] || 1e-6));
  }
  const slopes = new Array<number>(n);
  slopes[0] = m[0];
  slopes[n - 1] = m[n - 2];
  for (let i = 1; i < n - 1; i++) {
    slopes[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
  }
  for (let i = 0; i < n - 1; i++) {
    if (Math.abs(m[i]) < 1e-12) {
      slopes[i] = 0;
      slopes[i + 1] = 0;
    } else {
      const a = slopes[i] / m[i];
      const b = slopes[i + 1] / m[i];
      const s = a * a + b * b;
      if (s > 9) {
        const t = 3 / Math.sqrt(s);
        slopes[i] = t * a * m[i];
        slopes[i + 1] = t * b * m[i];
      }
    }
  }
  let d = `M${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    const h = dx[i];
    d += `C${x0 + h * tension} ${y0 + slopes[i] * h * tension} ${
      x1 - h * tension
    } ${y1 - slopes[i + 1] * h * tension} ${x1} ${y1}`;
  }
  return d;
}

function niceGstMax(n: number): number {
  if (n <= 0) return 100_000;
  const raw = n * 1.08;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  for (const s of [1, 1.25, 1.5, 2, 2.5, 5, 7.5, 10]) {
    if (s * pow >= raw) return s * pow;
  }
  return 10 * pow;
}

function formatGstK(n: number): string {
  if (n <= 0) return '0';
  const k = n / 1000;
  return Number.isInteger(k) ? `${k}k` : `${k.toFixed(k >= 10 ? 0 : 1)}k`;
}

/** Compact ₹ for tight UI (donut): ₹12.5k, ₹2.4L, ₹1.2Cr */
function compactInr(n: number): string {
  const v = Math.max(0, n);
  if (v < 1000) return `₹${Math.round(v)}`;
  if (v < 100_000) {
    const k = v / 1000;
    return `₹${k >= 100 ? k.toFixed(0) : k.toFixed(1).replace(/\.0$/, '')}k`;
  }
  if (v < 10_000_000) {
    const lakh = v / 100_000;
    return `₹${lakh.toFixed(1)}L`.replace(
      /\.0L$/,
      'L'
    );
  }
  const cr = v / 10_000_000;
  return `₹${cr.toFixed(1).replace(/\.0$/, '')}Cr`;
}

const FILED_YEAR_BUCKETS = [
  { id: '1-2', label: '1 to 2 years', min: 1, max: 2 },
  { id: '3-5', label: '3 to 5 years', min: 3, max: 5 },
  { id: '6-8', label: '6 to 8 years', min: 6, max: 8 },
  { id: '9+', label: '9+ years', min: 9, max: Infinity },
] as const;

const FILED_MONTH_BUCKETS = [
  { id: '1-2', label: '1 to 2 months', min: 1, max: 2 },
  { id: '3-5', label: '3 to 5 months', min: 3, max: 5 },
  { id: '6-8', label: '6 to 8 months', min: 6, max: 8 },
  { id: '9+', label: '9+ months', min: 9, max: Infinity },
] as const;

function gstAxisTickLabel(month: string, index: number): string {
  const p = parseGstMonthLabel(month);
  if (!p) return shortMonth(month);
  const mon = GST_MONTH_NAMES[p.m];
  if (index === 0 || p.m === 3) return `${mon} '${String(p.y).slice(2)}`;
  return mon;
}

function gstPeakLabel(month: string, total: number): string {
  const p = parseGstMonthLabel(month);
  if (!p) return `${shortMonth(month)} · ${formatGstK(total)}`;
  return `${GST_MONTH_NAMES[p.m]} '${String(p.y).slice(2)} · ${formatGstK(total)}`;
}

function useInViewOnce<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { threshold: 0.12 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return { ref, visible };
}

function CountUp({ value, plain }: { value: number; plain?: boolean }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      setN(value);
      return;
    }
    const start = performance.now();
    const dur = 1400;
    let raf = 0;
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / dur);
      const e = 1 - Math.pow(1 - p, 4);
      setN(value * e);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{plain ? Math.round(n).toLocaleString('en-IN') : inr(n)}</>;
}

export function OverallDashboard({
  itClients,
  assessmentYears,
  gstClients,
  gstMonths,
  onAddClient,
  onAddCompany,
  onExportCsv,
  onOpenItAllData,
  onOpenGstAllData,
}: OverallDashboardProps) {
  const isCompact = useIsCompactLayout();
  const itSummary = useMemo(
    () => computeYearSummary(itClients, assessmentYears),
    [itClients, assessmentYears]
  );
  const gstSummary = useMemo(
    () => computeGstMonthSummary(gstClients, gstMonths),
    [gstClients, gstMonths]
  );

  /** Company-wide GST (incl. unallocated) — overall dashboard stays all-time. */
  const gstCompanyWide = useMemo(() => {
    let totalReceived = 0;
    let totalOutstanding = 0;
    let totalBilled = 0;
    let totalEntries = 0;
    for (const c of gstClients) {
      const t = computeGstClientTotals(c);
      totalReceived += t.totalReceived;
      totalOutstanding += t.outstandingTotal;
      totalBilled += t.totalBilled;
      totalEntries += Object.keys(c.filings || {}).length;
    }
    return { totalReceived, totalOutstanding, totalBilled, totalEntries };
  }, [gstClients]);

  const totalReceived =
    itSummary.totalReceived + gstCompanyWide.totalReceived;
  const totalBilled = itSummary.totalBilled + gstCompanyWide.totalBilled;
  const totalOutstanding =
    itSummary.totalOutstanding + gstCompanyWide.totalOutstanding;
  const collectionPct =
    totalBilled > 0 ? Math.min(100, (totalReceived / totalBilled) * 100) : 0;
  const outstandingPct =
    totalBilled > 0 ? Math.min(100, (totalOutstanding / totalBilled) * 100) : 0;
  const accounts = itClients.length + gstClients.length;
  const filings = itSummary.totalEntries + gstCompanyWide.totalEntries;
  const periods = assessmentYears.length + gstMonths.length;

  const kpi = useInViewOnce<HTMLElement>();
  const itBlock = useInViewOnce<HTMLElement>();
  const gstBlock = useInViewOnce<HTMLElement>();

  const [billingRange, setBillingRange] = useState<'5' | '8' | 'all'>('8');
  const [billingHideEmpty, setBillingHideEmpty] = useState(true);
  const [billingHoverYear, setBillingHoverYear] = useState<string | null>(null);
  const [gstPeriod, setGstPeriod] = useState<'12' | 'fy25-26' | 'fy26-27'>('12');
  const [gstHoverIdx, setGstHoverIdx] = useState<number | null>(null);
  const [yearWindow, setYearWindow] = useState<'3' | '5' | 'all'>('5');
  const [hideEmpty, setHideEmpty] = useState(true);
  const [openYear, setOpenYear] = useState<string | null>(null);
  const [tip, setTip] = useState<HoverTipModel | null>(null);

  const itRowsFiltered = useMemo(() => {
    let rows = [...itSummary.rows].reverse();
    if (hideEmpty) rows = rows.filter((r) => r.entries > 0);
    if (yearWindow !== 'all') rows = rows.slice(0, Number(yearWindow));
    return rows;
  }, [itSummary.rows, hideEmpty, yearWindow]);

  const billingChartYears = useMemo(() => {
    let rows = itSummary.rows.map((r) => {
      const billed = r.amountBilled;
      const received = r.received;
      const outstanding =
        typeof r.outstanding === 'number'
          ? Math.max(0, r.outstanding)
          : Math.max(0, billed - received);
      return {
        assessmentYear: r.year,
        billed,
        received,
        outstanding,
        collectionPct: billed > 0 ? (received / billed) * 100 : 0,
      };
    });
    if (billingHideEmpty) rows = rows.filter((r) => r.billed > 0);
    if (billingRange !== 'all') {
      rows = rows.slice(-Number(billingRange));
    }
    return rows;
  }, [itSummary.rows, billingHideEmpty, billingRange]);

  const billingChartMax = Math.max(
    1,
    ...billingChartYears.map((r) => r.billed)
  );

  const filedYearBuckets = useMemo(() => {
    const counts = FILED_YEAR_BUCKETS.map(() => 0);
    for (const client of itClients) {
      const yearsFiled = Object.keys(client.filings || {}).length;
      if (yearsFiled <= 0) continue;
      const idx = FILED_YEAR_BUCKETS.findIndex(
        (b) => yearsFiled >= b.min && yearsFiled <= b.max
      );
      if (idx >= 0) counts[idx] += 1;
    }
    const peak = Math.max(1, ...counts);
    return FILED_YEAR_BUCKETS.map((b, i) => ({
      ...b,
      count: counts[i],
      pct: (counts[i] / peak) * 100,
    }));
  }, [itClients]);

  const filedMonthBuckets = useMemo(() => {
    const counts = FILED_MONTH_BUCKETS.map(() => 0);
    for (const company of gstClients) {
      const monthsFiled = Object.keys(company.filings || {}).filter((m) => {
        const f = company.filings[m];
        return f && (Number(f.total) || 0) > 0;
      }).length;
      if (monthsFiled <= 0) continue;
      const idx = FILED_MONTH_BUCKETS.findIndex(
        (b) => monthsFiled >= b.min && monthsFiled <= b.max
      );
      if (idx >= 0) counts[idx] += 1;
    }
    const peak = Math.max(1, ...counts);
    return FILED_MONTH_BUCKETS.map((b, i) => ({
      ...b,
      count: counts[i],
      pct: (counts[i] / peak) * 100,
    }));
  }, [gstClients]);

  const gstCollectionPct =
    gstCompanyWide.totalBilled > 0
      ? Math.min(
          100,
          (gstCompanyWide.totalReceived / gstCompanyWide.totalBilled) * 100
        )
      : 0;

  const gstTrendRows = useMemo(() => {
    const now = new Date();
    const nowIdx = now.getFullYear() * 12 + now.getMonth();
    let rows = gstSummary.rows.filter((r) => {
      const idx = gstMonthIndex(r.month);
      // Drop empty future months
      if (idx > nowIdx && r.totalBilled <= 0) return false;
      return true;
    });
    if (gstPeriod === 'fy25-26') {
      const a = gstMonthIndex('Apr 2025');
      const b = gstMonthIndex('Mar 2026');
      rows = rows.filter((r) => {
        const i = gstMonthIndex(r.month);
        return i >= a && i <= b;
      });
    } else if (gstPeriod === 'fy26-27') {
      const a = gstMonthIndex('Apr 2026');
      const b = gstMonthIndex('Mar 2027');
      rows = rows.filter((r) => {
        const i = gstMonthIndex(r.month);
        return i >= a && i <= b;
      });
    } else {
      rows = rows.slice(-12);
    }
    return rows.map((r) => ({
      month: r.month,
      tax: r.tax,
      fees: r.fees,
      interest: r.interest,
      total: r.totalBilled,
      feesInterestPct:
        r.totalBilled > 0
          ? ((r.fees + r.interest) / r.totalBilled) * 100
          : 0,
    }));
  }, [gstSummary.rows, gstPeriod]);

  const gstTrendMax = niceGstMax(
    Math.max(0, ...gstTrendRows.map((r) => r.total))
  );
  const gstTrendKpis = useMemo(() => {
    const totalFiled = gstTrendRows.reduce((s, r) => s + r.total, 0);
    const feesInterest = gstTrendRows.reduce(
      (s, r) => s + r.fees + r.interest,
      0
    );
    let peak = gstTrendRows[0] ?? null;
    for (const r of gstTrendRows) {
      if (!peak || r.total > peak.total) peak = r;
    }
    return {
      totalFiled,
      feesInterest,
      feesInterestPct: totalFiled > 0 ? (feesInterest / totalFiled) * 100 : 0,
      peak,
    };
  }, [gstTrendRows]);
  const gstTrendFirst = gstTrendRows[0]?.month || '—';
  const gstTrendLast =
    gstTrendRows[gstTrendRows.length - 1]?.month || '—';

  const W = 700;
  const H = 220;
  const L = 42;
  const R = 12;
  const T = 12;
  const B = 26;

  const showTip = (e: React.MouseEvent, lines: HoverTipModel['lines']) => {
    setTip({
      lines,
      x: Math.min(e.clientX + 14, window.innerWidth - 200),
      y: e.clientY - 70,
    });
  };

  if (isCompact) {
    return (
      <MobileDashboard
        itClients={itClients}
        assessmentYears={assessmentYears}
        gstClients={gstClients}
        gstMonths={gstMonths}
        onAddClient={onAddClient}
        onAddCompany={onAddCompany}
        onExportCsv={onExportCsv}
        onOpenItAllData={onOpenItAllData}
        onOpenGstAllData={onOpenGstAllData}
      />
    );
  }

  return (
    <div id="top" className="space-y-4 font-[family-name:var(--font-display)]">
      <motion.header
        className="flex flex-wrap gap-3 justify-between items-end"
        variants={staggerContainer}
        initial="hidden"
        animate="show"
      >
        <motion.div variants={fadeUp} custom={0}>
          <h1 className="text-[clamp(22px,2.4vw,28px)] font-bold tracking-[-0.02em] leading-[1.15] text-[var(--ink)]">
            Hey, here’s your money picture
          </h1>
          <p className="text-[var(--muted)] mt-1 text-xs sm:text-sm">
            {itClients.length} {itClients.length === 1 ? 'client' : 'clients'} and{' '}
            {gstClients.length}{' '}
            {gstClients.length === 1 ? 'company' : 'companies'}, all amounts in ₹
          </p>
        </motion.div>
        <motion.div className="flex flex-wrap gap-2" variants={fadeUp} custom={1}>
          <motion.button
            type="button"
            onClick={onAddClient}
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.97 }}
            transition={springSoft}
            className="px-3.5 py-2 rounded-full text-xs font-semibold bg-[var(--navy-900)] text-white border border-[var(--navy-900)] cursor-pointer"
          >
            + Add client
          </motion.button>
          <motion.button
            type="button"
            onClick={onAddCompany}
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.97 }}
            transition={springSoft}
            className="px-3.5 py-2 rounded-full text-xs font-semibold bg-[var(--gold)] text-[var(--ink)] border border-[var(--gold)] cursor-pointer"
          >
            + Add GST company
          </motion.button>
          <motion.button
            type="button"
            onClick={onExportCsv}
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.97 }}
            transition={springSoft}
            className="px-3.5 py-2 rounded-full text-xs font-semibold bg-[var(--card)] text-[var(--ink)] border border-[var(--line)] cursor-pointer"
          >
            Export CSV
          </motion.button>
        </motion.div>
      </motion.header>

      {/* KPI strip */}
      <motion.section
        ref={kpi.ref}
        className="grid grid-cols-1 md:grid-cols-12 gap-3"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.12, duration: 0.45 }}
      >
        <div className="md:col-span-5 relative overflow-hidden rounded-2xl bg-grad-navy text-white p-4 flex justify-between items-center gap-3 shadow-card motion-lift">
          <div
            aria-hidden
            className="absolute w-[160px] h-[160px] rounded-full bg-white/10 -right-12 -top-14"
          />
          <div className="relative">
            <p className="text-xs text-white/75">Collected so far</p>
            <p className="text-[clamp(22px,2.4vw,28px)] font-bold tracking-[-0.02em] tabular-nums leading-tight mt-0.5 text-white">
              {kpi.visible ? <CountUp value={totalReceived} /> : '₹0'}
            </p>
            <p className="text-xs text-white/75 mt-1.5">
              of {inr(totalBilled)} billed
            </p>
          </div>
          <svg
            width="88"
            height="88"
            viewBox="0 0 88 88"
            aria-label={`${collectionPct.toFixed(1)} percent collected`}
            className="relative shrink-0"
          >
            <circle
              cx="44"
              cy="44"
              r="34"
              fill="none"
              stroke="color-mix(in srgb, white 25%, transparent)"
              strokeWidth="10"
            />
            <circle
              cx="44"
              cy="44"
              r="34"
              fill="none"
              stroke="var(--gold)"
              strokeWidth="10"
              strokeLinecap="round"
              transform="rotate(-90 44 44)"
              strokeDasharray={`${kpi.visible ? (collectionPct / 100) * 213.6 : 0} 280`}
              className="transition-[stroke-dasharray] duration-[1400ms] ease-out"
            />
            <text
              x="44"
              y="48"
              textAnchor="middle"
              fill="white"
              fontSize="13"
              fontWeight="700"
            >
              {collectionPct.toFixed(1)}%
            </text>
          </svg>
        </div>

        <div className="md:col-span-4 rounded-2xl bg-grad-soft text-[var(--ink)] p-4 shadow-card ring-1 ring-[var(--navy-900)]/10">
          <p className="text-xs text-[var(--navy-900)]/70">Still pending</p>
          <p className="text-[clamp(22px,2.4vw,28px)] font-bold tracking-[-0.02em] tabular-nums text-[var(--navy-900)] leading-tight mt-0.5">
            {kpi.visible ? <CountUp value={totalOutstanding} /> : '₹0'}
          </p>
          <div className="h-1.5 rounded-full bg-[var(--navy-900)]/15 overflow-hidden mt-2.5">
            <i
              className="block h-full rounded-full bg-[var(--navy-900)] transition-[width] duration-[1400ms] ease-out"
              style={{ width: kpi.visible ? `${outstandingPct}%` : '0%' }}
            />
          </div>
          <p className="text-xs text-[var(--navy-900)]/70 mt-2">
            {outstandingPct.toFixed(1)}% of billed amount is due
          </p>
        </div>

        <div className="md:col-span-3 rounded-2xl bg-[var(--card)] text-[var(--ink)] p-4 shadow-card">
          <p className="text-xs text-[var(--muted)]">Accounts</p>
          <p className="text-[clamp(22px,2.4vw,28px)] font-bold tracking-[-0.02em] tabular-nums leading-tight mt-0.5">
            {kpi.visible ? <CountUp value={accounts} plain /> : '0'}
          </p>
          <div className="h-1.5 rounded-full bg-[var(--frost-100)] overflow-hidden mt-2.5">
            <i
              className="block h-full rounded-full bg-[var(--blue-500)] transition-[width] duration-[1400ms] ease-out"
              style={{
                width: kpi.visible
                  ? `${Math.min(100, (filings / Math.max(1, accounts * Math.max(1, periods))) * 100 + 20)}%`
                  : '0%',
              }}
            />
          </div>
          <p className="text-xs text-[var(--muted)] mt-1.5">
            {filings} filings across {periods} periods
          </p>
        </div>
      </motion.section>

      {/* IT */}
      <h3
        id="it"
        className="text-[13px] font-semibold text-[var(--muted)] mt-2 mb-0 scroll-mt-6"
      >
        Income tax returns
      </h3>
      <section ref={itBlock.ref} className="grid grid-cols-1 xl:grid-cols-12 gap-3">
        <div className="xl:col-span-8 rounded-2xl bg-[var(--card)] p-4 shadow-card">
          <div className="flex flex-wrap justify-between gap-2 items-start">
            <div>
              <h2 className="text-base font-semibold tracking-[-0.01em] text-[var(--ink)]">
                Billing by assessment year
              </h2>
              <p className="text-xs text-[var(--muted)] mt-0.5">
                Stacked columns · full bar height = billed
              </p>
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              <div className="inline-flex bg-[var(--frost-100)] rounded-full p-1">
                {(
                  [
                    ['5', 'Last 5 yrs'],
                    ['8', 'Last 8 yrs'],
                    ['all', 'All years'],
                  ] as const
                ).map(([n, label]) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setBillingRange(n)}
                    className={`px-3 py-1.5 rounded-full text-[12px] font-semibold cursor-pointer ${
                      billingRange === n
                        ? 'bg-[var(--navy-900)] text-white shadow-sm'
                        : 'text-[var(--muted)]'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setBillingHideEmpty((v) => !v)}
                className={`px-3 py-1.5 rounded-full text-[12px] font-semibold bg-[var(--frost-100)] cursor-pointer ${
                  billingHideEmpty
                    ? 'text-[var(--navy-900)] ring-1 ring-[var(--navy-900)]/25'
                    : 'text-[var(--muted)]'
                }`}
              >
                Hide empty years
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
            {(
              [
                ['Total billed', itSummary.totalBilled, false],
                ['Received', itSummary.totalReceived, false],
                ['Outstanding', itSummary.totalOutstanding, false],
                ['Collection rate', itSummary.totalCollectionPct, true],
              ] as const
            ).map(([label, value, isPct], i) => (
              <div
                key={label}
                className="rounded-xl bg-[var(--frost-100)] px-3 py-2 transition-all duration-700 ease-out"
                style={{
                  opacity: itBlock.visible ? 1 : 0,
                  transform: itBlock.visible ? 'translateY(0)' : 'translateY(8px)',
                  transitionDelay: `${i * 70}ms`,
                }}
              >
                <p className="text-[11px] text-[var(--muted)] font-medium">{label}</p>
                <p className="text-sm font-bold tabular-nums text-[var(--ink)] mt-0.5">
                  {isPct
                    ? `${Number(value).toFixed(1)}%`
                    : itBlock.visible
                      ? <CountUp value={Number(value)} />
                      : '₹0'}
                </p>
              </div>
            ))}
          </div>

          <div
            className="flex flex-wrap items-center gap-3 mt-3 text-[12px] font-semibold text-[var(--muted)] transition-opacity duration-700"
            style={{ opacity: itBlock.visible ? 1 : 0 }}
          >
            <span className="inline-flex items-center gap-1.5">
              <b
                className="w-2.5 h-2.5 rounded-sm"
                style={{ background: BILLING_RECEIVED }}
              />
              Received
            </span>
            <span className="inline-flex items-center gap-1.5">
              <b
                className="w-2.5 h-2.5 rounded-sm"
                style={{ background: BILLING_OUTSTANDING }}
              />
              Outstanding
            </span>
            <span className="text-[11px] font-medium">Full bar height = billed</span>
          </div>

          {billingChartYears.length === 0 ? (
            <div className="mt-4 h-[220px] grid place-items-center text-sm text-[var(--muted)]">
              No assessment-year data to chart
            </div>
          ) : (
            <svg
              className="mt-3 w-full overflow-visible"
              viewBox={`0 0 ${W} ${H}`}
              role="img"
              aria-label="Stacked column chart of received and outstanding by assessment year"
            >
              {[0, 1, 2, 3, 4].map((k) => {
                const v = (billingChartMax / 4) * k;
                const y = T + (1 - v / billingChartMax) * (H - T - B);
                return (
                  <g key={k}>
                    <line
                      x1={L}
                      x2={W - R}
                      y1={y}
                      y2={y}
                      stroke="var(--line)"
                      strokeWidth={1}
                    />
                    <text
                      x={L - 8}
                      y={y + 4}
                      textAnchor="end"
                      fill="var(--muted)"
                      fontSize={11}
                    >
                      {v ? `${Math.round(v / 1000)}k` : '0'}
                    </text>
                  </g>
                );
              })}
              {billingChartYears.map((row, i) => {
                const n = Math.max(1, billingChartYears.length);
                const slot = (W - L - R) / n;
                const bw = Math.min(34, Math.max(8, slot * 0.55));
                const x = L + i * slot + (slot - bw) / 2;
                const plotH = H - T - B;
                const receivedH = (row.received / billingChartMax) * plotH;
                const outstandingH = (row.outstanding / billingChartMax) * plotH;
                const baseY = T + plotH;
                const receivedY = baseY - receivedH;
                const outstandingY = receivedY - outstandingH;
                const topIsOutstanding = outstandingH > 0.5;
                const tipLines = buildBillingHoverTipLines(row);
                const isHovered = billingHoverYear === row.assessmentYear;
                return (
                  <g key={row.assessmentYear}>
                    <g
                      style={{
                        transformOrigin: `${x + bw / 2}px ${baseY}px`,
                        transform: itBlock.visible ? 'scaleY(1)' : 'scaleY(0)',
                        opacity:
                          billingHoverYear && !isHovered ? 0.55 : 1,
                        filter: isHovered ? 'brightness(1.15)' : undefined,
                        transition: [
                          `transform 0.85s cubic-bezier(0.2, 0.9, 0.3, 1.2) ${i * 45}ms`,
                          'opacity 0.2s ease-out',
                          'filter 0.2s ease-out',
                        ].join(', '),
                      }}
                    >
                      {receivedH > 0.5 &&
                        (topIsOutstanding ? (
                          <rect
                            x={x}
                            y={receivedY}
                            width={bw}
                            height={receivedH}
                            fill={BILLING_RECEIVED}
                          />
                        ) : (
                          <path
                            d={roundedTopRect(x, receivedY, bw, receivedH, 5)}
                            fill={BILLING_RECEIVED}
                          />
                        ))}
                      {outstandingH > 0.5 && (
                        <path
                          d={roundedTopRect(x, outstandingY, bw, outstandingH, 5)}
                          fill={BILLING_OUTSTANDING}
                        />
                      )}
                    </g>
                    <text
                      x={x + bw / 2}
                      y={H - 8}
                      textAnchor="middle"
                      fill={isHovered ? 'var(--ink)' : 'var(--muted)'}
                      fontSize={11}
                      fontWeight={isHovered ? 700 : 400}
                      style={{
                        opacity: itBlock.visible ? 1 : 0,
                        transition: `opacity 0.5s ease-out ${200 + i * 45}ms`,
                      }}
                    >
                      {shortAy(row.assessmentYear)}
                    </text>
                    <rect
                      x={L + i * slot}
                      y={T}
                      width={slot}
                      height={plotH}
                      fill="transparent"
                      className="cursor-pointer"
                      onMouseMove={(e) => {
                        setBillingHoverYear(row.assessmentYear);
                        showTip(e, tipLines);
                      }}
                      onMouseLeave={() => {
                        setBillingHoverYear(null);
                        setTip(null);
                      }}
                    />
                  </g>
                );
              })}
            </svg>
          )}
        </div>

        <div className="xl:col-span-4 rounded-2xl bg-[var(--card)] p-4 shadow-card flex flex-col min-h-0">
          <div className="flex justify-between items-center gap-2 shrink-0">
            <h2 className="text-base font-semibold text-[var(--ink)]">Collection share</h2>
            <strong className="text-sm text-[var(--success)]">
              {itSummary.totalCollectionPct.toFixed(1)}%
            </strong>
          </div>
          <div className="relative grid place-items-center w-[132px] mx-auto my-2.5 shrink-0">
            <svg width="132" height="132" viewBox="0 0 132 132">
              <circle
                cx="66"
                cy="66"
                r="50"
                fill="none"
                stroke="var(--frost-100)"
                strokeWidth="12"
              />
              <circle
                cx="66"
                cy="66"
                r="50"
                fill="none"
                stroke="var(--gold)"
                strokeWidth="12"
                strokeLinecap="round"
                transform="rotate(-90 66 66)"
                strokeDasharray={`${
                  itBlock.visible
                    ? (itSummary.totalCollectionPct / 100) * 314.2
                    : 0
                } 400`}
                className="transition-[stroke-dasharray] duration-[1400ms] ease-out"
              />
            </svg>
            <div className="absolute text-center px-2 max-w-[96px]">
              <strong className="text-base font-bold block text-[var(--ink)] tabular-nums leading-tight truncate">
                {compactInr(itSummary.totalReceived)}
              </strong>
              <span className="text-[10px] text-[var(--muted)] tabular-nums block truncate">
                of {compactInr(itSummary.totalBilled)}
              </span>
            </div>
          </div>
          <div className="flex justify-between items-center px-3 py-2.5 rounded-xl bg-[var(--frost-100)] mt-1 text-sm font-semibold shrink-0">
            <span>
              Clients
              <small className="block font-normal text-[var(--muted)]">Total</small>
            </span>
            <span className="w-7 h-7 rounded-lg grid place-items-center text-xs text-white font-bold bg-[var(--blue-500)]">
              {itClients.length}
            </span>
          </div>
          <div className="mt-2 flex flex-col gap-1.5">
            {filedYearBuckets.map((b) => (
              <div
                key={b.id}
                className="grid grid-cols-[88px_1fr_28px] items-center gap-2 px-2.5 py-1.5 rounded-xl bg-[var(--frost-100)] text-[12px] font-semibold"
              >
                <span className="text-[var(--ink)] leading-tight">{b.label}</span>
                <span className="h-1.5 rounded-full bg-[var(--card)] overflow-hidden">
                  <i
                    className="block h-full rounded-full bg-[var(--navy-900)] transition-[width] duration-700 ease-out"
                    style={{
                      width: itBlock.visible ? `${b.pct}%` : '0%',
                    }}
                  />
                </span>
                <span className="text-right tabular-nums text-[var(--ink)]">
                  {b.count}
                </span>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={onOpenItAllData}
            className="mt-3 w-full text-xs font-semibold text-[var(--ink)] py-2.5 rounded-full border border-[var(--line)] bg-[var(--card)] hover:bg-[var(--frost-100)] cursor-pointer shrink-0 relative z-10"
          >
            Open IT all data →
          </button>
        </div>

        <div className="xl:col-span-12 rounded-2xl bg-[var(--card)] p-4 shadow-card">
          <h2 className="text-base font-semibold text-[var(--ink)]">Year by year</h2>
          <p className="text-xs text-[var(--muted)]">Tap a year to see its filings</p>
          <div className="flex flex-wrap gap-2 mt-2.5 items-center">
            <div className="inline-flex bg-[var(--frost-100)] rounded-full p-1">
              {(
                [
                  ['3', 'Last 3'],
                  ['5', 'Last 5'],
                  ['all', 'All years'],
                ] as const
              ).map(([n, label]) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setYearWindow(n)}
                  className={`px-3.5 py-1.5 rounded-full text-[13px] font-semibold cursor-pointer ${
                    yearWindow === n
                      ? 'bg-[var(--navy-900)] text-white shadow-sm'
                      : 'text-[var(--muted)]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setHideEmpty((v) => !v)}
              className={`px-3 py-1.5 rounded-full text-[13px] font-semibold bg-[var(--frost-100)] cursor-pointer ${
                hideEmpty ? '' : 'opacity-45 line-through'
              }`}
            >
              Hide empty years
            </button>
            <span className="text-[13px] text-[var(--muted)] ml-auto">
              Showing {itRowsFiltered.length} years
            </span>
          </div>

          <div className="overflow-auto max-h-[380px] mt-2.5 ledger-scroll">
            <table className="w-full border-collapse min-w-[640px] tabular-nums">
              <thead>
                <tr>
                  {[
                    'Assessment year',
                    'Entries',
                    'Clients',
                    'Billed',
                    'Received',
                    'Outstanding',
                    'Collected',
                  ].map((h, i) => (
                    <th
                      key={h}
                      className={`sticky top-0 bg-[var(--card)] z-[2] text-xs text-[var(--muted)] font-semibold py-2 px-2.5 ${
                        i === 0 ? 'text-left' : 'text-right'
                      }`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {itRowsFiltered.map((row) => {
                  const open = openYear === row.year;
                  const filingsForYear = itClients
                    .map((c) => {
                      const f = c.filings?.[row.year];
                      if (!f) return null;
                      const bal =
                        typeof f.balance === 'number' && !Number.isNaN(f.balance)
                          ? Math.max(0, f.balance)
                          : computeBalance(
                              Number(f.fees) || 0,
                              Number(f.received) || 0
                            );
                      return { client: c, filing: f, balance: bal };
                    })
                    .filter(Boolean) as {
                    client: ClientRecord;
                    filing: NonNullable<ClientRecord['filings'][string]>;
                    balance: number;
                  }[];
                  return (
                    <Fragment key={row.year}>
                      <tr
                        className={`cursor-pointer transition-colors ${
                          open
                            ? 'bg-[var(--sky-200)] ring-2 ring-inset ring-[var(--navy-900)]/35'
                            : 'hover:bg-[var(--frost-100)]'
                        } ${row.entries === 0 ? 'text-[var(--muted)]' : 'text-[var(--ink)]'}`}
                        onClick={() =>
                          setOpenYear(open ? null : row.year)
                        }
                      >
                        <td className="text-left py-2 px-2.5 border-t border-[var(--line)] text-sm">
                          <span
                            className={`inline-block mr-2 text-[var(--muted)] transition-transform ${
                              open ? 'rotate-90' : ''
                            }`}
                          >
                            ›
                          </span>
                          {row.year}
                        </td>
                        <td className="text-right py-2 px-2.5 text-sm border-t border-[var(--line)]">
                          {row.entries}
                        </td>
                        <td className="text-right py-2 px-2.5 text-sm border-t border-[var(--line)]">
                          {row.uniqueClients}
                        </td>
                        <td className="text-right py-2 px-2.5 text-sm border-t border-[var(--line)]">
                          {inr(row.amountBilled)}
                        </td>
                        <td className="text-right py-2 px-2.5 text-sm border-t border-[var(--line)] text-[var(--success)]">
                          {inr(row.received)}
                        </td>
                        <td className="text-right py-2 px-2.5 text-sm border-t border-[var(--line)] text-[var(--blue-500)]">
                          {inr(row.outstanding)}
                        </td>
                        <td className="text-right py-2 px-2.5 text-sm border-t border-[var(--line)]">
                          <span className="inline-flex items-center gap-2.5 justify-end">
                            <u className="block w-[70px] h-2 rounded-full bg-[var(--frost-100)] overflow-hidden no-underline">
                              <i
                                className="block h-full rounded-full bg-[var(--navy-900)] transition-[width] duration-700"
                                style={{
                                  width: `${Math.min(100, row.collectionPct)}%`,
                                }}
                              />
                            </u>
                            {row.collectionPct.toFixed(1)}%
                          </span>
                        </td>
                      </tr>
                      {open && (
                        <tr>
                          <td colSpan={7} className="p-0 border-0">
                            <div className="space-y-1.5 py-2">
                              {filingsForYear.length === 0 ? (
                                <div className="mx-3 px-4 py-2.5 rounded-[14px] bg-[var(--frost-100)] text-sm text-[var(--muted)]">
                                  No entries yet
                                </div>
                              ) : (
                                filingsForYear.map(({ client, filing }) => {
                                  const billed = Number(filing.fees) || 0;
                                  const recd = Number(filing.received) || 0;
                                  const tag =
                                    billed > 0 && recd >= billed
                                      ? ['paid', 'Paid']
                                      : billed > 0 && recd > 0
                                        ? ['part', 'Partially Paid']
                                        : billed > 0
                                          ? ['due', 'Pending']
                                          : ['due', 'No Billing'];
                                  return (
                                    <div
                                      key={`${client.id}-${row.year}`}
                                      className="grid grid-cols-[1.2fr_1fr_1fr_1fr_90px] gap-2 items-center mx-3 px-4 py-2.5 rounded-[14px] bg-[var(--frost-100)] text-sm"
                                    >
                                      <b>{client.name}</b>
                                      <span className="font-mono text-[12px]">
                                        {client.pan}
                                      </span>
                                      <span>{inr(billed)}</span>
                                      <span className="text-[var(--success)]">
                                        {inr(recd)}
                                      </span>
                                      <span
                                        className={`text-center text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                                          tag[0] === 'paid'
                                            ? 'bg-[var(--success-15)] text-[var(--success)]'
                                            : tag[0] === 'part'
                                              ? 'bg-[var(--gold)]/70 text-[var(--ink)]'
                                              : 'bg-[var(--sky-200)] text-[var(--ink)]'
                                        }`}
                                      >
                                        {tag[1]}
                                      </span>
                                    </div>
                                  );
                                })
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="font-extrabold bg-[var(--frost-100)]">
                  <td className="text-left py-2 px-2.5 text-sm rounded-l-2xl sticky bottom-0 bg-[var(--frost-100)]">
                    All years total
                  </td>
                  <td className="text-right py-2 px-2.5 text-sm sticky bottom-0 bg-[var(--frost-100)]">
                    {itSummary.totalEntries}
                  </td>
                  <td className="text-right py-2 px-2.5 text-sm sticky bottom-0 bg-[var(--frost-100)]">
                    {itSummary.totalUniqueClients}
                  </td>
                  <td className="text-right py-2 px-2.5 text-sm sticky bottom-0 bg-[var(--frost-100)]">
                    {inr(itSummary.totalBilled)}
                  </td>
                  <td className="text-right py-2 px-2.5 text-sm text-[var(--success)] sticky bottom-0 bg-[var(--frost-100)]">
                    {inr(itSummary.totalReceived)}
                  </td>
                  <td className="text-right py-2 px-2.5 text-sm text-[var(--blue-500)] sticky bottom-0 bg-[var(--frost-100)]">
                    {inr(itSummary.totalOutstanding)}
                  </td>
                  <td className="text-right py-2 px-2.5 text-sm rounded-r-2xl sticky bottom-0 bg-[var(--frost-100)]">
                    {itSummary.totalCollectionPct.toFixed(1)}%
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </section>

      {/* GST */}
      <h3
        id="gst"
        className="text-[13px] font-semibold text-[var(--muted)] mt-2 mb-0 scroll-mt-6"
      >
        GST filings
      </h3>
      <section ref={gstBlock.ref} className="grid grid-cols-1 xl:grid-cols-12 gap-3">
        <div className="xl:col-span-8 rounded-2xl bg-[var(--card)] p-4 shadow-card">
          <div className="flex flex-wrap justify-between gap-2 items-start">
            <div>
              <h2 className="text-base font-semibold text-[var(--ink)]">
                Monthly GST, {shortMonth(gstTrendFirst)} to{' '}
                {shortMonth(gstTrendLast)}
              </h2>
              <p className="text-xs text-[var(--muted)] mt-0.5">
                Hover a point to see tax, fees and interest
              </p>
            </div>
            <div className="inline-flex bg-[var(--frost-100)] rounded-full p-1">
              {(
                [
                  ['12', 'Last 12 months'],
                  ['fy25-26', 'FY 25-26'],
                  ['fy26-27', 'FY 26-27'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setGstPeriod(id)}
                  className={`px-3 py-1.5 rounded-full text-[12px] font-semibold cursor-pointer ${
                    gstPeriod === id
                      ? 'bg-[var(--navy-900)] text-white shadow-sm'
                      : 'text-[var(--muted)]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-3">
            <div
              className="rounded-xl bg-[var(--frost-100)] px-3 py-2 transition-all duration-700 ease-out"
              style={{
                opacity: gstBlock.visible ? 1 : 0,
                transform: gstBlock.visible ? 'translateY(0)' : 'translateY(8px)',
              }}
            >
              <p className="text-[11px] text-[var(--muted)] font-medium">
                Total filed
              </p>
              <p className="text-sm font-bold tabular-nums text-[var(--ink)] mt-0.5">
                {gstBlock.visible ? (
                  <CountUp value={gstTrendKpis.totalFiled} />
                ) : (
                  '₹0'
                )}
              </p>
            </div>
            <div
              className="rounded-xl bg-[var(--frost-100)] px-3 py-2 transition-all duration-700 ease-out"
              style={{
                opacity: gstBlock.visible ? 1 : 0,
                transform: gstBlock.visible ? 'translateY(0)' : 'translateY(8px)',
                transitionDelay: '70ms',
              }}
            >
              <p className="text-[11px] text-[var(--muted)] font-medium">
                Fees + interest
              </p>
              <p className="text-sm font-bold tabular-nums text-[var(--ink)] mt-0.5">
                {inr(gstTrendKpis.feesInterest)}
                <span className="ml-1.5 text-[11px] font-semibold text-[var(--muted)]">
                  {gstTrendKpis.feesInterestPct.toFixed(1)}%
                </span>
              </p>
            </div>
            <div
              className="rounded-xl bg-[var(--frost-100)] px-3 py-2 transition-all duration-700 ease-out"
              style={{
                opacity: gstBlock.visible ? 1 : 0,
                transform: gstBlock.visible ? 'translateY(0)' : 'translateY(8px)',
                transitionDelay: '140ms',
              }}
            >
              <p className="text-[11px] text-[var(--muted)] font-medium">
                Peak month
              </p>
              <p className="text-sm font-bold tabular-nums text-[var(--ink)] mt-0.5">
                {gstTrendKpis.peak
                  ? gstPeakLabel(gstTrendKpis.peak.month, gstTrendKpis.peak.total)
                  : '—'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 mt-3 text-[12px] font-semibold text-[var(--muted)]">
            <span className="inline-flex items-center gap-1.5">
              <b
                className="w-2.5 h-2.5 rounded-full"
                style={{ background: GST_TREND }}
              />
              Total filed per month
            </span>
          </div>

          {gstTrendRows.length === 0 ? (
            <div className="mt-4 h-[220px] grid place-items-center text-sm text-[var(--muted)]">
              No monthly GST data in this period
            </div>
          ) : (
            <svg
              className="mt-3 w-full overflow-visible"
              viewBox={`0 0 ${W} ${H}`}
              role="img"
              aria-label="Line chart of total GST filed per month"
            >
              {[0, 1, 2, 3, 4].map((k) => {
                const v = (gstTrendMax / 4) * k;
                const y = T + (1 - v / gstTrendMax) * (H - T - B);
                return (
                  <g key={k}>
                    <line
                      x1={L}
                      x2={W - R}
                      y1={y}
                      y2={y}
                      stroke="var(--line)"
                      strokeWidth={1}
                    />
                    <text
                      x={L - 8}
                      y={y + 4}
                      textAnchor="end"
                      fill="var(--muted)"
                      fontSize={11}
                    >
                      {v ? formatGstK(v) : '0'}
                    </text>
                  </g>
                );
              })}
              {(() => {
                const plotH = H - T - B;
                const span = W - L - R;
                const pts: [number, number][] = gstTrendRows.map((row, i) => [
                  gstTrendRows.length === 1
                    ? L + span / 2
                    : L + (i * span) / (gstTrendRows.length - 1),
                  T + (1 - row.total / gstTrendMax) * plotH,
                ]);
                const line = monotonePath(pts, 0.25);
                const area =
                  pts.length > 1
                    ? `${line}L${pts[pts.length - 1][0]} ${T + plotH}L${pts[0][0]} ${T + plotH}Z`
                    : '';
                let peakIdx = 0;
                gstTrendRows.forEach((r, i) => {
                  if (r.total > gstTrendRows[peakIdx].total) peakIdx = i;
                });
                return (
                  <g>
                    {area && (
                      <path
                        d={area}
                        fill={GST_TREND}
                        opacity={gstBlock.visible ? 0.1 : 0}
                        className="transition-opacity duration-1000"
                      />
                    )}
                    <path
                      d={line}
                      fill="none"
                      stroke={GST_TREND}
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      pathLength={1}
                      strokeDasharray={1}
                      strokeDashoffset={gstBlock.visible ? 0 : 1}
                      className="transition-[stroke-dashoffset] duration-[1400ms] ease-out"
                    />
                    {gstHoverIdx != null && pts[gstHoverIdx] && (
                      <line
                        x1={pts[gstHoverIdx][0]}
                        x2={pts[gstHoverIdx][0]}
                        y1={T}
                        y2={T + plotH}
                        stroke={GST_TREND}
                        strokeWidth={1}
                        strokeDasharray="3 3"
                        opacity={0.55}
                      />
                    )}
                    {gstTrendRows.map((row, i) => {
                      const [cx, cy] = pts[i];
                      const isPeak = i === peakIdx && row.total > 0;
                      const r = isPeak ? 5 : 4;
                      const hitLeft =
                        i === 0 ? L : (pts[i - 1][0] + cx) / 2;
                      const hitRight =
                        i === gstTrendRows.length - 1
                          ? W - R
                          : (cx + pts[i + 1][0]) / 2;
                      const tipLines = buildGstHoverTipLines(row);
                      return (
                        <g key={row.month}>
                          <circle
                            cx={cx}
                            cy={cy}
                            r={gstBlock.visible ? r : 0}
                            fill={GST_TREND}
                            stroke="var(--card)"
                            strokeWidth={2}
                            className="transition-[r] duration-700 ease-out"
                            style={{ transitionDelay: `${200 + i * 30}ms` }}
                          />
                          {isPeak && gstBlock.visible && (
                            <text
                              x={cx}
                              y={Math.max(T + 10, cy - 12)}
                              textAnchor="middle"
                              fill="var(--ink)"
                              fontSize={10}
                              fontWeight={700}
                            >
                              {gstPeakLabel(row.month, row.total)}
                            </text>
                          )}
                          <text
                            x={cx}
                            y={H - 8}
                            textAnchor="middle"
                            fill={
                              gstHoverIdx === i ? 'var(--ink)' : 'var(--muted)'
                            }
                            fontSize={10}
                            fontWeight={gstHoverIdx === i ? 700 : 400}
                          >
                            {gstAxisTickLabel(row.month, i)}
                          </text>
                          <rect
                            x={hitLeft}
                            y={T}
                            width={Math.max(4, hitRight - hitLeft)}
                            height={plotH}
                            fill="transparent"
                            className="cursor-pointer"
                            onMouseMove={(e) => {
                              setGstHoverIdx(i);
                              showTip(e, tipLines);
                            }}
                            onMouseLeave={() => {
                              setGstHoverIdx(null);
                              setTip(null);
                            }}
                          />
                        </g>
                      );
                    })}
                  </g>
                );
              })()}
            </svg>
          )}
        </div>

        <div className="xl:col-span-4 rounded-2xl bg-[var(--card)] p-4 shadow-card flex flex-col min-h-0">
          <div className="flex justify-between items-center gap-2 shrink-0">
            <h2 className="text-base font-semibold text-[var(--ink)]">GST totals</h2>
            <strong className="text-sm text-[var(--success)]">
              {gstCollectionPct.toFixed(1)}%
            </strong>
          </div>
          <div className="relative grid place-items-center w-[132px] mx-auto my-2.5 shrink-0">
            <svg width="132" height="132" viewBox="0 0 132 132">
              <circle
                cx="66"
                cy="66"
                r="50"
                fill="none"
                stroke="var(--frost-100)"
                strokeWidth="12"
              />
              <circle
                cx="66"
                cy="66"
                r="50"
                fill="none"
                stroke="var(--gold)"
                strokeWidth="12"
                strokeLinecap="round"
                transform="rotate(-90 66 66)"
                strokeDasharray={`${
                  gstBlock.visible ? (gstCollectionPct / 100) * 314.2 : 0
                } 400`}
                className="transition-[stroke-dasharray] duration-[1400ms] ease-out"
              />
            </svg>
            <div className="absolute text-center px-2 max-w-[96px]">
              <strong className="text-base font-bold block text-[var(--ink)] tabular-nums leading-tight truncate">
                {compactInr(gstCompanyWide.totalBilled)}
              </strong>
              <span className="text-[10px] text-[var(--muted)] tabular-nums block truncate">
                recd {compactInr(gstCompanyWide.totalReceived)}
              </span>
            </div>
          </div>
          <div className="flex justify-between items-center px-3 py-2.5 rounded-xl bg-[var(--frost-100)] mt-1 text-sm font-semibold shrink-0">
            <span>
              Companies
              <small className="block font-normal text-[var(--muted)]">Total</small>
            </span>
            <span className="w-7 h-7 rounded-lg grid place-items-center text-xs text-white font-bold bg-[var(--blue-500)]">
              {gstClients.length}
            </span>
          </div>
          <div className="mt-2 flex flex-col gap-1.5">
            {filedMonthBuckets.map((b) => (
              <div
                key={b.id}
                className="grid grid-cols-[96px_1fr_28px] items-center gap-2 px-2.5 py-1.5 rounded-xl bg-[var(--frost-100)] text-[12px] font-semibold"
              >
                <span className="text-[var(--ink)] leading-tight">{b.label}</span>
                <span className="h-1.5 rounded-full bg-[var(--card)] overflow-hidden">
                  <i
                    className="block h-full rounded-full bg-[var(--navy-900)] transition-[width] duration-700 ease-out"
                    style={{
                      width: gstBlock.visible ? `${b.pct}%` : '0%',
                    }}
                  />
                </span>
                <span className="text-right tabular-nums text-[var(--ink)]">
                  {b.count}
                </span>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={onOpenGstAllData}
            className="mt-3 w-full text-xs font-semibold text-[var(--ink)] py-2.5 rounded-full border border-[var(--line)] bg-[var(--card)] hover:bg-[var(--frost-100)] cursor-pointer shrink-0 relative z-10"
          >
            Open GST all data →
          </button>
        </div>
      </section>

      {tip ? <DashboardHoverTip tip={tip} /> : null}
    </div>
  );
}
