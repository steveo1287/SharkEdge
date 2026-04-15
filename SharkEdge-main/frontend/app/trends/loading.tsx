export default function TrendsLoading() {
  return (
    <div className="grid gap-6">
      <section className="concept-panel concept-panel-accent grid gap-5 px-5 py-5 md:px-7 md:py-6 xl:grid-cols-[1.08fr_0.92fr]">
        <div className="grid gap-4">
          <div className="flex flex-wrap gap-2">
            <div className="h-8 w-28 rounded-full border border-white/8 bg-white/[0.05]" />
            <div className="h-8 w-24 rounded-full border border-white/8 bg-white/[0.05]" />
            <div className="h-8 w-28 rounded-full border border-white/8 bg-white/[0.05]" />
          </div>
          <div className="h-4 w-32 rounded-full bg-white/[0.06]" />
          <div className="h-14 max-w-3xl rounded-[1.2rem] bg-white/[0.06]" />
          <div className="h-20 max-w-3xl rounded-[1.2rem] bg-white/[0.05]" />
        </div>
        <div className="grid gap-3 rounded-[1.45rem] border border-white/10 bg-[#07111c]/86 p-5">
          <div className="h-5 w-28 rounded-full bg-white/[0.06]" />
          <div className="grid grid-cols-2 gap-3">
            <div className="concept-metric h-[108px]" />
            <div className="concept-metric h-[108px]" />
          </div>
          <div className="h-20 rounded-[1.1rem] bg-white/[0.05]" />
        </div>
      </section>

      <section className="concept-panel grid gap-4 p-5">
        <div className="h-6 w-44 rounded-full bg-white/[0.06]" />
        <div className="grid gap-4">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="concept-panel concept-panel-default grid gap-4 p-5">
              <div className="flex flex-wrap gap-2">
                <div className="h-8 w-24 rounded-full bg-white/[0.05]" />
                <div className="h-8 w-20 rounded-full bg-white/[0.05]" />
              </div>
              <div className="h-8 w-3/4 rounded-[0.9rem] bg-white/[0.06]" />
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {Array.from({ length: 4 }).map((__, metricIndex) => (
                  <div key={metricIndex} className="concept-metric h-[96px]" />
                ))}
              </div>
              <div className="h-24 rounded-[1.1rem] bg-white/[0.05]" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
