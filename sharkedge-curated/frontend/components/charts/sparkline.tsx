type SparklineProps = {
  values: Array<number | null | undefined>;
  color?: string;
  height?: number;
};

export function Sparkline({
  values,
  color = "#2dd36f",
  height = 40
}: SparklineProps) {
  const numericValues = values.filter((value): value is number => typeof value === "number");

  if (!numericValues.length) {
    return <div className="h-10 w-full rounded-[12px] bg-white/[0.03]" />;
  }

  const width = 150;
  const min = Math.min(...numericValues);
  const max = Math.max(...numericValues);
  const range = max - min || 1;

  const points = values
    .map((value, index) => {
      const safe = typeof value === "number" ? value : numericValues[Math.max(0, numericValues.length - 1)];
      const x = (index / Math.max(values.length - 1, 1)) * width;
      const y = height - ((safe - min) / range) * (height - 8) - 4;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-10 w-full overflow-visible">
      <path
        d={`M 0 ${height - 2} L ${points.replace(/ /g, " L ")} L ${width} ${height - 2} Z`}
        fill={`${color}22`}
      />
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="2.25"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
}

