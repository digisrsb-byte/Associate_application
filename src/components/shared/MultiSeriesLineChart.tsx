/**
 * Shared multi-series SVG line chart used by IT Year Summary and GST Dashboard.
 * Domain values stay in the callers; this only owns geometry/chrome.
 */

export type ChartSeriesStyle = {
  /** Parallel to category keys — one Y value per category. */
  values: number[];
  stroke: string;
  strokeWidth?: number;
  circleFill: string | ((selected: boolean) => string);
  circleStrokeWidth?: number;
};

export type MultiSeriesLineChartProps = {
  /** Stable keys (year / month identifiers). */
  keys: string[];
  /** Axis labels under each point. */
  labels: string[];
  series: ChartSeriesStyle[];
  maxValue: number;
  selectedKey: string | null;
  onSelect: (key: string) => void;
  ariaLabel: string;
  getHitTitle: (index: number) => string;
  labelFontSize?: string;
};

const W = 560;
const H = 168;
const PAD_T = 12;
const PAD_R = 10;
const PAD_B = 28;
const PAD_L = 10;

export function MultiSeriesLineChart({
  keys,
  labels,
  series,
  maxValue,
  selectedKey,
  onSelect,
  ariaLabel,
  getHitTitle,
  labelFontSize = '10px',
}: MultiSeriesLineChartProps) {
  const n = keys.length;
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;
  const safeMax = maxValue > 0 ? maxValue : 1;

  const xAt = (i: number) =>
    PAD_L + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const yAt = (value: number) =>
    PAD_T + (1 - Math.min(1, Math.max(0, value / safeMax))) * plotH;

  const xs = keys.map((_, i) => xAt(i));
  const seriesYs = series.map((s) => s.values.map((v) => yAt(v)));

  const linePath = (ys: number[]) =>
    ys.map((y, i) => `${i === 0 ? 'M' : 'L'} ${xs[i]} ${y}`).join(' ');

  const baselineY = yAt(0);

  return (
    <div className="relative w-full">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-[168px] sm:h-[180px]"
        role="img"
        aria-label={ariaLabel}
      >
        <line
          x1={PAD_L}
          y1={baselineY}
          x2={W - PAD_R}
          y2={baselineY}
          stroke="var(--line)"
          strokeWidth="1"
        />

        {series.map((s, si) => (
          <path
            key={`line-${si}`}
            d={linePath(seriesYs[si])}
            fill="none"
            stroke={s.stroke}
            strokeWidth={s.strokeWidth ?? 2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}

        {keys.map((key, i) => {
          const isSelected = selectedKey === key;
          const cx = xs[i];
          return (
            <g key={key}>
              {isSelected && (
                <line
                  x1={cx}
                  y1={PAD_T}
                  x2={cx}
                  y2={baselineY}
                  stroke="var(--ink)"
                  strokeWidth="1.5"
                  strokeDasharray="4 3"
                  opacity="0.35"
                />
              )}
              {series.map((s, si) => {
                const fill =
                  typeof s.circleFill === 'function'
                    ? s.circleFill(isSelected)
                    : s.circleFill;
                return (
                  <circle
                    key={`c-${si}-${key}`}
                    cx={cx}
                    cy={seriesYs[si][i]}
                    r={isSelected ? 4.5 : 3}
                    fill={fill}
                    stroke="var(--ink)"
                    strokeWidth={s.circleStrokeWidth ?? 1}
                  />
                );
              })}
              <text
                x={cx}
                y={H - 8}
                textAnchor="middle"
                className="fill-[var(--muted)]"
                style={{
                  fontSize: labelFontSize,
                  fontFamily: 'JetBrains Mono, ui-monospace, monospace',
                  fontWeight: isSelected ? 700 : 500,
                }}
              >
                {labels[i]}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="absolute inset-0 flex">
        {keys.map((key, i) => {
          const isSelected = selectedKey === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelect(key)}
              aria-pressed={isSelected}
              title={getHitTitle(i)}
              className={`flex-1 h-full rounded-lg cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--blue-500)] ${
                isSelected
                  ? 'bg-[var(--frost-100)]/35'
                  : 'hover:bg-[var(--frost-100)]/50'
              }`}
            />
          );
        })}
      </div>
    </div>
  );
}
