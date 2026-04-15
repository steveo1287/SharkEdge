import Link from "next/link";

const items = [
  { href: "/concepts", label: "Overview" },
  { href: "/concepts/market-terminal", label: "Market Terminal" },
  { href: "/concepts/game-intelligence-desk", label: "Game Intelligence Desk" },
  { href: "/concepts/action-feed-mobile", label: "Action Feed Mobile" }
] as const;

export function ConceptNav({ current }: { current: (typeof items)[number]["href"] }) {
  return (
    <nav className="flex flex-wrap gap-2">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={current === item.href ? "concept-chip concept-chip-accent" : "concept-chip concept-chip-muted"}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
