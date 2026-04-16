import { TeamBadge } from "@/components/identity/team-badge";
import { SectionTabs, type SectionTabItem } from "@/components/mobile/section-tabs";
import type { MatchupDetailView } from "@/lib/types/domain";

type EventHeroProps = {
  detail: MatchupDetailView;
  tabs: SectionTabItem[];
};

function getParticipant(detail: MatchupDetailView, role: "AWAY" | "HOME") {
  return detail.participants.find((participant) => participant.role === role) ?? detail.participants[role === "AWAY" ? 0 : 1] ?? null;
}

export function EventHero({ detail, tabs }: EventHeroProps) {
  const away = getParticipant(detail, "AWAY");
  const home = getParticipant(detail, "HOME");

  return (
    <section className="mobile-hero">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[1.5rem] font-semibold tracking-tight text-white">{detail.eventLabel}</div>
        <div className="flex items-center gap-2">
          <button type="button" className="mobile-icon-button" aria-label="Search">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none">
              <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.8" />
              <path d="M16 16l4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
          <button type="button" className="mobile-icon-button" aria-label="Alerts">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none">
              <path d="M12 4a4 4 0 00-4 4v2.4c0 .7-.2 1.38-.56 1.97L6 15h12l-1.44-2.63A3.97 3.97 0 0116 10.4V8a4 4 0 00-4-4z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
              <path d="M10 18a2 2 0 004 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <div className="flex flex-col items-center gap-2 text-center">
          <TeamBadge name={away?.name ?? "Away"} abbreviation={away?.abbreviation} size="lg" />
          <div className="text-[1.75rem] font-black leading-none text-white">
            {away?.abbreviation ?? away?.name ?? "Away"}
          </div>
          <div className="text-sm text-slate-400">{away?.record ?? away?.subtitle ?? "Away side"}</div>
        </div>

        <div className="flex flex-col items-center text-center">
          <div className="text-sm text-slate-400">{detail.status === "LIVE" ? "Live now" : "Today"}</div>
          <div className="mt-1 text-[1.35rem] font-semibold text-white">
            {new Date(detail.startTime).toLocaleTimeString("en-US", {
              hour: "numeric",
              minute: "2-digit"
            })}
          </div>
          <div className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">
            {detail.stateDetail ?? detail.status}
          </div>
          {detail.scoreboard ? (
            <div className="mt-2 rounded-full border border-white/8 bg-white/[0.04] px-3 py-1 text-xs text-slate-300">
              {detail.scoreboard}
            </div>
          ) : null}
        </div>

        <div className="flex flex-col items-center gap-2 text-center">
          <TeamBadge name={home?.name ?? "Home"} abbreviation={home?.abbreviation} size="lg" tone="home" />
          <div className="text-[1.75rem] font-black leading-none text-white">
            {home?.abbreviation ?? home?.name ?? "Home"}
          </div>
          <div className="text-sm text-slate-400">{home?.record ?? home?.subtitle ?? "Home side"}</div>
        </div>
      </div>

      <div className="mt-5 border-t border-white/8 pt-2">
        <SectionTabs items={tabs} />
      </div>
    </section>
  );
}

