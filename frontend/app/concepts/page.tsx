import Link from "next/link";

import { ConceptNav } from "@/components/concepts/concept-nav";
import { ConceptPageIntro, ConceptPanel, ConceptSectionHeader, ConceptMetaChip } from "@/components/concepts/primitives";

const concepts = [
  {
    href: "/concepts/market-terminal",
    label: "Market Terminal",
    title: "Dense board-first trading desk for high-frequency sports decision work.",
    detail: "Robinhood x Kalshi x premium sportsbook intelligence. Fast scan, hard hierarchy, one live board driving the whole screen.",
    bullets: ["Attention rail", "Hybrid board rows", "Right-side intelligence rail"]
  },
  {
    href: "/concepts/game-intelligence-desk",
    label: "Game Intelligence Desk",
    title: "Flagship event surface with team identity, line history, and decision memory in one disciplined frame.",
    detail: "ESPN event identity meets terminal structure. Hero chart up top, decision/change/activity columns below, no stacked widget junk.",
    bullets: ["Event hero", "Decision desk", "What changed + market activity"]
  },
  {
    href: "/concepts/action-feed-mobile",
    label: "Action Feed Mobile",
    title: "Mobile attention queue built for thumb-speed review without dumbing down the product.",
    detail: "Alert-first, watchlist-first, compact chart-aware feed with a second phone showing the game-detail mobile pattern.",
    bullets: ["Attention queue", "Watchlist movers", "Mobile game strip"]
  }
] as const;

export default function ConceptsIndexPage() {
  return (
    <div className="concept-stage">
      <ConceptPageIntro
        kicker="Concept sprint"
        title="Three aggressive SharkEdge directions, built as real routes instead of moodboards."
        description="These concepts keep the real decision, change, memory, and prioritization spine intact while pushing the shell, hierarchy, and flagship surfaces hard enough to escape dark-dashboard gravity."
        actions={<ConceptNav current="/concepts" />}
      />

      <div className="grid gap-4 xl:grid-cols-3">
        {concepts.map((concept) => (
          <ConceptPanel key={concept.href} tone="accent" className="grid gap-5 p-6">
            <div className="flex items-center justify-between gap-3">
              <div className="concept-kicker">{concept.label}</div>
              <ConceptMetaChip tone="accent">review route</ConceptMetaChip>
            </div>
            <h2 className="text-2xl font-semibold leading-tight text-white">{concept.title}</h2>
            <p className="concept-copy text-sm md:text-[0.95rem]">{concept.detail}</p>
            <div className="grid gap-2">
              {concept.bullets.map((bullet) => (
                <div key={bullet} className="concept-list-row">
                  <div className="text-sm font-medium text-white">{bullet}</div>
                </div>
              ))}
            </div>
            <Link href={concept.href} className="concept-chip concept-chip-accent w-fit">
              Open concept
            </Link>
          </ConceptPanel>
        ))}
      </div>

      <ConceptPanel className="grid gap-5 p-6 md:p-8">
        <ConceptSectionHeader
          label="Direction filter"
          title="What these routes are testing"
          detail="Not just color. Each concept is testing a different product posture: terminal density, flagship event authority, and elite mobile attention flow."
        />
        <div className="grid gap-4 md:grid-cols-3">
          <div className="concept-metric">
            <div className="concept-meta">Market terminal thesis</div>
            <div className="concept-metric-value">Fastest scan</div>
            <div className="concept-metric-note">Board is the working surface. Everything else supports it.</div>
          </div>
          <div className="concept-metric">
            <div className="concept-meta">Game desk thesis</div>
            <div className="concept-metric-value">Deepest conviction</div>
            <div className="concept-metric-note">One matchup becomes a premium decision room with memory and movement.</div>
          </div>
          <div className="concept-metric">
            <div className="concept-meta">Mobile thesis</div>
            <div className="concept-metric-value">Most immediate</div>
            <div className="concept-metric-note">Thumb-native attention queue without flattening the actual intelligence.</div>
          </div>
        </div>
      </ConceptPanel>
    </div>
  );
}
