import Link from "next/link";

import { EmptyState } from "@/components/ui/empty-state";

export default function NotFound() {
  return (
    <EmptyState
      title="That market is not on the board"
      description="The requested game or page could not be found in the current SharkEdge mock workspace."
      action={
        <Link
          href="/"
          className="inline-flex rounded-2xl border border-sky-400/30 bg-sky-500/10 px-4 py-2 text-sm font-medium text-sky-300"
        >
          Return to Board
        </Link>
      }
    />
  );
}
