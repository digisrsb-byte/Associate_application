import { Fragment } from 'react';
import { formatCurrency } from '../../utils/ledgerUtils.ts';

/** One tooltip row — always rendered as text (never via HTML strings). */
export type HoverTipLine = {
  text: string;
  bold?: boolean;
};

export type HoverTipModel = {
  lines: HoverTipLine[];
  x: number;
  y: number;
};

function inr(n: number): string {
  return formatCurrency(Math.max(0, Math.round(n)));
}

/** Short AY label for charts/tips — display only; not HTML-escaped here (React text does that). */
export function shortAyLabel(ay: string): string {
  const m = ay.match(/(\d{4})-(\d{2})/);
  if (m) return `${m[1].slice(2)}-${m[2]}`;
  return ay.replace(/^AY\s*/i, '');
}

export function buildBillingHoverTipLines(row: {
  assessmentYear: string;
  received: number;
  outstanding: number;
  billed: number;
  collectionPct: number;
}): HoverTipLine[] {
  return [
    { text: `Assessment year ${shortAyLabel(row.assessmentYear)}`, bold: true },
    { text: `Received ${inr(row.received)}` },
    { text: `Outstanding ${inr(row.outstanding)}` },
    { text: `Billed ${inr(row.billed)}` },
    { text: `Collection ${row.collectionPct.toFixed(1)}%` },
  ];
}

export function buildGstHoverTipLines(row: {
  month: string;
  tax: number;
  fees: number;
  interest: number;
  total: number;
  feesInterestPct: number;
}): HoverTipLine[] {
  return [
    { text: row.month, bold: true },
    { text: `Tax ${inr(row.tax)}` },
    { text: `Fees ${inr(row.fees)}` },
    { text: `Interest ${inr(row.interest)}` },
    { text: `Total ${inr(row.total)}`, bold: true },
    { text: `Fees + interest ${row.feesInterestPct.toFixed(1)}%` },
  ];
}

/** Fixed hover tip — ledger strings are React text nodes only (no HTML sink). */
export function DashboardHoverTip({ tip }: { tip: HoverTipModel }) {
  return (
    <div
      className="fixed z-50 bg-[var(--navy-900)] text-white px-3.5 py-2.5 rounded-[14px] text-[13px] pointer-events-none leading-relaxed"
      style={{ left: tip.x, top: tip.y }}
      data-testid="dashboard-hover-tip"
    >
      {tip.lines.map((line, i) => (
        <Fragment key={i}>
          {i > 0 ? <br /> : null}
          {line.bold ? <b>{line.text}</b> : line.text}
        </Fragment>
      ))}
    </div>
  );
}
