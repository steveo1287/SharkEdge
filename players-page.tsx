export function ConfBar({ value }: { value: number }) {
  const color = value >= 75 ? 'from-emerald-400 to-sky-400' : value >= 65 ? 'from-sky-400 to-blue-500' : 'from-amber-400 to-amber-500';
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-white/6">
      <div className={`h-full rounded-full bg-gradient-to-r ${color}`} style={{ width: `${Math.max(6, Math.min(100, value))}%` }} />
    </div>
  );
}
