export function Statusbar() {
  return (
    <div className="border-t border-white/5 bg-[#07111c]/80">
      <div className="mx-auto flex max-w-[1560px] flex-wrap items-center justify-between gap-3 px-4 py-2 text-[0.68rem] uppercase tracking-[0.24em] text-slate-500 md:px-6 xl:px-8">
        <div className="flex items-center gap-4">
          <span>Providers 3/3 healthy</span>
          <span>Signals refreshed 1m ago</span>
          <span>Sim deck v4.2</span>
        </div>
        <div className="flex items-center gap-4">
          <span>CLV +2.1c</span>
          <span>Bankroll +31.2u</span>
        </div>
      </div>
    </div>
  );
}
