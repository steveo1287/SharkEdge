type AreaTrendChartProps = {
  values: number[];
  color?: string;
  height?: number;
};

export function AreaTrendChart({
  values,
  color = "#2dd36f",
  height = 180
}: AreaTrendChartProps) {
  const series = values.length ? values : [0, 1, 2, 3, 4];
  const width = 320;
  const min = Math.min(...series);
  const max = Math.max(...series);
  const range = max - min || 1;

  const points = series
    .map((value, index) => {
      const x = (index / Math.max(series.length - 1, 1)) * width;
      const y = height - ((value - min) / range) * (height - 14) - 7;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-[180px] w-full">
      <defs>
        <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.34" />
          <stop offset="100%" stopColor={color} stopOpacity="0.06" />
        </linearGradient>
      </defs>
      <path
        d={`M 0 ${height - 2} L ${points.replace(/ /g, " L ")} L ${width} ${height - 2} Z`}
        fill="url(#trend-fill)"
      />
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
}

