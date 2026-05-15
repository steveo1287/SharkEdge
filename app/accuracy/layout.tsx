import Link from "next/link";

function ProofNavLink({ href, label, tone = "slate" }: { href: string; label: string; tone?: "purple" | "cyan" | "green" | "amber" | "slate" }) {
  const tones = {
    purple: "border-purple-300/25 bg-purple-300/10 text-purple-200 hover:bg-purple-300/[0.16]",
    cyan: "border-cyan-300/25 bg-cyan-300/10 text-cyan-200 hover:bg-cyan-300/[0.16]",
    green: "border-emerald-300/25 bg-emerald-300/10 text-emerald-200 hover:bg-emerald-300/[0.16]",
    amber: "border-amber-300/25 bg-amber-300/10 text-amber-200 hover:bg-amber-300/[0.16]",
    slate: "border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.08]"
  };

  return (
    <Link
      href={href}
      className={`rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] transition ${tones[tone]}`}
    >
      {label}
    </Link>
  );
}

export default function AccuracyLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="sticky top-0 z-40 border-b border-white/10 bg-[#02060b]/90 px-3 py-3 text-white shadow-[0_18px_60px_rgba(0,0,0,0.28)] backdrop-blur sm:px-5">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
          <Link href="/accuracy" className="group flex items-center gap-3">
            <span className="h-2.5 w-2.5 rounded-full bg-cyan-300 shadow-[0_0_18px_rgba(34,211,238,0.75)]" />
            <span>
              <span className="block text-[9px] font-black uppercase tracking-[0.22em] text-cyan-300/70">SharkEdge proof</span>
              <span className="block font-display text-lg font-black tracking-[-0.05em] text-white group-hover:text-cyan-100">Accuracy OS</span>
            </span>
          </Link>
          <nav className="flex flex-wrap gap-2">
            <ProofNavLink href="/accuracy/official" label="Official" tone="purple" />
            <ProofNavLink href="/accuracy/verdicts" label="Verdicts" tone="cyan" />
            <ProofNavLink href="/accuracy/calibration" label="Calibration" tone="green" />
            <ProofNavLink href="/accuracy/autopsy" label="Autopsy" tone="amber" />
            <ProofNavLink href="/accuracy/mlb" label="MLB" />
            <ProofNavLink href="/accuracy/mma" label="MMA" />
            <ProofNavLink href="/sim" label="SimHub" />
          </nav>
        </div>
      </div>
      {children}
    </>
  );
}
