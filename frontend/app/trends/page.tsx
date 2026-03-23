import { SectionTitle } from "@/components/ui/section-title";
import { TrendsPlaceholder } from "@/components/trends/trends-placeholder";
import { getTrendPreview } from "@/services/trends/trends-service";

export default function TrendsPage() {
  const preview = getTrendPreview();

  return (
    <div className="grid gap-6">
      <SectionTitle
        title="Trends Builder"
        description="The saved trend data model already exists, so the next iteration can move from placeholder to query engine without changing the product shell."
      />
      <TrendsPlaceholder metrics={preview.metrics} savedTrendName={preview.savedTrendName} />
    </div>
  );
}
