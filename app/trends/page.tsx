import { SharkTrendsPausedPage } from "@/components/sharktrends/SharkTrendsPausedPage";

export const dynamic = "force-static";
export const revalidate = 3600;

export default function TrendsPage() {
  return <SharkTrendsPausedPage alias="/trends" />;
}