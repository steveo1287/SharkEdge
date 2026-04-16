import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import { SectionTitle } from "@/components/ui/section-title";

export default function Loading() {
  return (
    <div className="grid gap-6">
      <SectionTitle
        title="Loading"
        description="Refreshing live board, props, and ledger context."
      />
      <LoadingSkeleton />
    </div>
  );
}
