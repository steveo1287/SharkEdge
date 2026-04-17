export default function TrendsLoading() {
  return (
    <div className="grid gap-5">
      <section className="panel grid gap-5 px-5 py-5 md:px-6 md:py-6 xl:grid-cols-[1.08fr_0.92fr]">
        <div className="grid gap-4">
          <div className="flex flex-wrap gap-1.5">
            <div className="h-7 w-28 rounded-sm border border-bone/[0.08] bg-surface" />
            <div className="h-7 w-24 rounded-sm border border-bone/[0.08] bg-surface" />
            <div className="h-7 w-28 rounded-sm border border-bone/[0.08] bg-surface" />
          </div>
          <div className="h-3 w-32 rounded-sm bg-bone/[0.08]" />
          <div className="h-12 max-w-3xl rounded-md bg-bone/[0.06]" />
          <div className="h-20 max-w-3xl rounded-md bg-bone/[0.04]" />
        </div>
        <div className="grid gap-3 rounded-md border border-bone/[0.08] bg-surface p-5">
          <div className="h-4 w-28 rounded-sm bg-bone/[0.08]" />
          <div className="grid grid-cols-2 gap-3">
            <div className="h-[108px] rounded-md border border-bone/[0.06] bg-panel" />
            <div className="h-[108px] rounded-md border border-bone/[0.06] bg-panel" />
          </div>
          <div className="h-20 rounded-md bg-bone/[0.05]" />
        </div>
      </section>

      <section className="panel grid gap-4 p-5">
        <div className="h-5 w-44 rounded-sm bg-bone/[0.08]" />
        <div className="grid gap-4">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="rounded-md border border-bone/[0.08] bg-surface grid gap-4 p-5">
              <div className="flex flex-wrap gap-1.5">
                <div className="h-7 w-24 rounded-sm bg-bone/[0.06]" />
                <div className="h-7 w-20 rounded-sm bg-bone/[0.06]" />
              </div>
              <div className="h-7 w-3/4 rounded-md bg-bone/[0.08]" />
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {Array.from({ length: 4 }).map((__, metricIndex) => (
                  <div key={metricIndex} className="h-[96px] rounded-md border border-bone/[0.06] bg-panel" />
                ))}
              </div>
              <div className="h-24 rounded-md bg-bone/[0.05]" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
