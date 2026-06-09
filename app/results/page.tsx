import { getResultsCenter } from "@/services/results/mlb-results-center";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ResultsPage() {
  const data = await getResultsCenter("overview");
  return <main className="min-h-screen bg-[#02060b] p-6 text-white"><h1>{data.title}</h1><p>{data.subtitle}</p></main>;
}
