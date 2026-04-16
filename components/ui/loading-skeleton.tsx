export function LoadingSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="panel animate-pulse p-5">
          <div className="h-2 w-20 bg-bone/[0.06]" />
          <div className="mt-4 h-8 w-28 bg-bone/[0.08]" />
          <div className="mt-4 h-1 w-full bg-bone/[0.04]" />
        </div>
      ))}
    </div>
  );
}
