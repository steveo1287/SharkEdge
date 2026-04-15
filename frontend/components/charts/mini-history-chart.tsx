type MiniHistoryChartProps = {
  values: number[];
  height?: number;
  strokeClassName?: string;
  areaClassName?: string;
  showAxis?: boolean;
};

function clampSeries(values: number[]) {
  const clean = values.filter((value) => Number.isFinite(value));
  return clean.length ? clean : [0, 0];
}

function buildPoints(values: number[], width: number, height: number) {
  const series = clampSeries(values);
  const min = Math.min(...series);
  const max = Math.max(...series);
  const range = Math.max(1, max - min);

  return series.map((value, index) => {
    const x = series.length === 1 ? width / 2 : (index / (series.length - 1)) * width;
    const y = height - ((value - min) / range) * height;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
}

export function MiniHistoryChart({
  values,
  height = 56,
  strokeClassName = "stroke-sky-300",
  areaClassName = "fill-sky-400/10",
  showAxis = true
}: MiniHistoryChartProps) {
  const width = 180;
  const chartHeight = Math.max(20, height - 8);
  const points = buildPoints(values, width, chartHeight);
  const linePath = `M ${points.join(" L ")}`;
  const areaPath = `${linePath} L ${width},${chartHeight} L 0,${chartHeight} Z`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full" role="img" aria-label="history chart">
      {showAxis ? (
        <>
          <line x1="0" x2={width} y1={chartHeight} y2={chartHeight} className="stroke-white/8" strokeWidth="1" />
          <line x1="0" x2={0} y1="0" y2={chartHeight} className="stroke-white/8" strokeWidth="1" />
        </>
      ) : null}
      <path d={areaPath} className={areaClassName} />
      <path d={linePath} className={strokeClassName} fill="none" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
      {points.map((point, index) => {
        const [cx, cy] = point.split(",");
        return <circle key={`${point}-${index}`} cx={cx} cy={cy} r="2.3" className={strokeClassName.replace("stroke", "fill")} />;
      })}
    </svg>
  );
}
