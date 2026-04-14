"use client";

import type { ReactNode } from "react";

import { BetSlipDrawer } from "@/components/bets/bet-slip-drawer";
import { BetSlipProvider } from "@/components/bets/bet-slip-provider";

export function BetSlipBoundary({ children }: { children: ReactNode }) {
  return (
    <BetSlipProvider>
      {children}
      <BetSlipDrawer />
    </BetSlipProvider>
  );
}
