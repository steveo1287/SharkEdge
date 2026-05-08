import type { ReactNode } from "react";

import { AutoRefreshOnStale } from "@/components/sim/auto-refresh-on-stale";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function SimFastLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <AutoRefreshOnStale enabled />
    </>
  );
}
