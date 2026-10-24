import type { ReactNode } from "react";
import styles from "./ui.module.css";

const DEFAULT_COLORS = [
  "var(--color-green)",
  "var(--color-cobalt)",
  "var(--color-violet)",
  "var(--color-orange)",
  "var(--color-coral)",
  "var(--color-teal)",
  "var(--color-cyan)",
];

function ChartTable({ label, rows }: { label: string; rows: { label: string; value: string }[] }) {
  return (
    <details className={styles.chartTable}>
      <summary>View {label} as a table</summary>
      <table>
        <thead>
          <tr>
            <th scope="col">Label</th>
            <th scope="col">Value</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <td>{row.label}</td>
              <td>{row.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

interface BarDatum {
  label: string;
  value: number;
  meta?: string;
}

export function BarChart({
  data,
  height = 150,
  max = 100,
  colors = DEFAULT_COLORS,
  valueSuffix = "%",
  label,
  showValues = true,
}: {
  data: BarDatum[];
  height?: number;
  max?: number;
  colors?: string[];
  valueSuffix?: string;
  label: string;
  showValues?: boolean;
}) {
  return (
    <figure className={styles.chartFigure}>
      <div className={styles.bars} style={{ height }} role="img" aria-label={label}>
        {data.map((item, index) => (
          <div className={styles.barColumn} key={item.label}>
            <div className={styles.barTrack}>
              <div
                className={styles.barFill}
                style={{
                  height: `${Math.max(3, Math.min(100, (item.value / max) * 100))}%`,
                  background: colors[index % colors.length],
                }}
              />
            </div>
            <span className={styles.barLabel}>{item.label}</span>
            {showValues ? (
              <span className={styles.barValue}>
                {item.value}
                {valueSuffix}
              </span>
            ) : null}
          </div>
        ))}
      </div>
      <ChartTable
        label={label}
        rows={data.map((item) => ({ label: item.label, value: `${item.value}${valueSuffix}` }))}
      />
    </figure>
  );
}

export function AreaChart({
  data,
  height = 170,
  color = "var(--color-cobalt)",
  label,
  formatValue = (value: number) => String(value),
}: {
  data: { label: string; value: number }[];
  height?: number;
  color?: string;
  label: string;
  formatValue?: (value: number) => string;
}) {
  const width = 640;
  const padding = 10;
  const max = Math.max(...data.map((point) => point.value), 1);
  const min = Math.min(...data.map((point) => point.value), 0);
  const span = max - min || 1;
  const points = data.map((point, index) => {
    const x = padding + (index / Math.max(1, data.length - 1)) * (width - padding * 2);
    const y = height - padding - ((point.value - min) / span) * (height - padding * 2);
    return { x, y, ...point };
  });
  const line = points.map((point) => `${point.x},${point.y}`).join(" ");
  const area = `${padding},${height - padding} ${line} ${width - padding},${height - padding}`;
  const gradientId = `area-${label.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
  return (
    <figure className={styles.chartFigure}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height={height}
        role="img"
        aria-label={label}
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.22" />
            <stop offset="100%" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <polygon points={area} fill={`url(#${gradientId})`} />
        <polyline
          points={line}
          fill="none"
          stroke={color}
          strokeWidth="2.2"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        {points.map((point) => (
          <circle key={point.label} cx={point.x} cy={point.y} r="2.4" fill={color} />
        ))}
      </svg>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginTop: 4,
          fontSize: 12,
          color: "var(--text-muted)",
        }}
      >
        {data.map((point, index) =>
          index % 2 === 0 || index === data.length - 1 ? (
            <span key={point.label}>{point.label}</span>
          ) : null,
        )}
      </div>
      <ChartTable
        label={label}
        rows={data.map((point) => ({ label: point.label, value: formatValue(point.value) }))}
      />
    </figure>
  );
}

export interface DonutDatum {
  label: string;
  value: number;
  color: string;
}

export function DonutChart({
  data,
  centerValue,
  centerLabel,
  size = 148,
  label,
  valueFormatter = (value: number) => String(value),
}: {
  data: DonutDatum[];
  centerValue: ReactNode;
  centerLabel: string;
  size?: number;
  label: string;
  valueFormatter?: (value: number) => string;
}) {
  const total = data.reduce((sum, item) => sum + item.value, 0) || 1;
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const segments = data.reduce<{ item: DonutDatum; offset: number }[]>((accumulator, item) => {
    const previous = accumulator[accumulator.length - 1];
    const offset = previous ? previous.offset + (previous.item.value / total) * circumference : 0;
    return [...accumulator, { item, offset }];
  }, []);
  return (
    <div className={styles.donutWrap}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 140 140"
        role="img"
        aria-label={label}
        style={{ flex: "none" }}
      >
        <circle
          cx="70"
          cy="70"
          r={radius}
          fill="none"
          stroke="var(--border-soft)"
          strokeWidth="16"
        />
        {segments.map(({ item, offset }) => {
          const dash = (item.value / total) * circumference;
          return (
            <circle
              key={item.label}
              cx="70"
              cy="70"
              r={radius}
              fill="none"
              stroke={item.color}
              strokeWidth="16"
              strokeDasharray={`${Math.max(0, dash - 2)} ${circumference}`}
              strokeDashoffset={-offset}
              strokeLinecap="round"
              transform="rotate(-90 70 70)"
            />
          );
        })}
        <text x="70" y="68" textAnchor="middle" className={styles.donutCenter}>
          {centerValue}
        </text>
        <text x="70" y="83" textAnchor="middle" className={styles.donutCenterLabel}>
          {centerLabel}
        </text>
      </svg>
      <div className={styles.donutLegend}>
        {data.map((item) => (
          <div className={styles.donutRow} key={item.label}>
            <span
              className={styles.legendSwatch}
              style={{ background: item.color }}
              aria-hidden="true"
            />
            <span className={styles.donutRowLabel}>{item.label}</span>
            <span className={styles.donutRowValue}>
              {valueFormatter(item.value)} · {Math.round((item.value / total) * 100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
