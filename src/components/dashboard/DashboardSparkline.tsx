"use client";

// ══════════════════════════════════════════════════════════════
// DashboardSparkline — mini SVG sparkline (sin recharts overhead)
// ══════════════════════════════════════════════════════════════
// Linear/Stripe-grade: stroke fino, gradient fill sutil, sin ejes,
// sin grid, sin tooltip. Acepta cualquier array de números y
// escala automáticamente. Width responsive vía SVG viewBox.
// ══════════════════════════════════════════════════════════════

interface DashboardSparklineProps {
  data: number[];
  color?: string; // hex stroke
  height?: number; // pixels
  className?: string;
}

export default function DashboardSparkline({
  data,
  color = "#0f172a",
  height = 32,
  className = "",
}: DashboardSparklineProps) {
  if (!data || data.length < 2) {
    return <div className={className} style={{ height }} />;
  }

  const width = 120;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const stepX = width / (data.length - 1);

  const points = data.map((v, i) => {
    const x = i * stepX;
    const y = height - ((v - min) / range) * height * 0.9 - height * 0.05;
    return [x, y] as const;
  });

  const linePath = points
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`)
    .join(" ");

  const areaPath =
    linePath +
    ` L${width.toFixed(2)},${height.toFixed(2)} L0,${height.toFixed(2)} Z`;

  const gradientId = `dash-spark-${color.replace("#", "")}`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height={height}
      preserveAspectRatio="none"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.18" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradientId})`} />
      <path
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
