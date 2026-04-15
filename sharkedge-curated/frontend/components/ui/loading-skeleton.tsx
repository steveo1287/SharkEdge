export function LoadingSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="panel animate-pulse p-5">
          <div className="h-3 w-24 rounded-full bg-slate-800" />
          <div className="mt-5 h-9 w-32 rounded-2xl bg-slate-800" />
          <div className="mt-4 h-3 w-full rounded-full bg-slate-900" />
        </div>
      ))}
    </div>
  );
}
