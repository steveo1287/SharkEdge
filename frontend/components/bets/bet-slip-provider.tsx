"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";

import type { BetIntent, BetSlipEntry } from "@/lib/types/bet-intelligence";
import { mergeBetSlipEntries } from "@/lib/utils/bet-intelligence";

const STORAGE_KEY = "sharkedge.bet-slip.v1";

type BetSlipContextValue = {
  entries: BetSlipEntry[];
  open: boolean;
  addIntent: (intent: BetIntent) => void;
  removeEntry: (id: string) => void;
  clearEntries: () => void;
  setOpen: (next: boolean) => void;
};

const BetSlipContext = createContext<BetSlipContextValue | null>(null);

export function BetSlipProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<BetSlipEntry[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (!saved) {
        return;
      }

      const parsed = JSON.parse(saved) as BetSlipEntry[];
      setEntries(Array.isArray(parsed) ? parsed : []);
    } catch {
      setEntries([]);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  }, [entries]);

  const value = useMemo<BetSlipContextValue>(
    () => ({
      entries,
      open,
      addIntent(intent) {
        setEntries((current) => mergeBetSlipEntries(current, intent));
        setOpen(true);
      },
      removeEntry(id) {
        setEntries((current) => current.filter((entry) => entry.id !== id));
      },
      clearEntries() {
        setEntries([]);
      },
      setOpen
    }),
    [entries, open]
  );

  return <BetSlipContext.Provider value={value}>{children}</BetSlipContext.Provider>;
}

export function useBetSlip() {
  const context = useContext(BetSlipContext);
  if (!context) {
    throw new Error("useBetSlip must be used inside BetSlipProvider.");
  }

  return context;
}
