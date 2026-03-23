import { mockDatabase } from "@/prisma/seed-data";

// TODO: Replace this placeholder service with real trend query execution over historical data.

export function getTrendPreview() {
  const saved = mockDatabase.savedTrends[0];

  return {
    metrics: [
      { label: "Hit Rate", value: "56.8%", note: "Mock preview from stored trend run." },
      { label: "ROI", value: "+4.2%", note: "Based on flat-stake grading." },
      { label: "Sample", value: "186", note: "Sufficient for a meaningful first look." },
      { label: "Avg Margin", value: "+3.1", note: "Closing margin placeholder for future model output." }
    ],
    savedTrendName: saved?.name ?? "Home Favorites, Low Total"
  };
}
