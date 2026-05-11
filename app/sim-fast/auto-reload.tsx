"use client";
import { useEffect, useState } from "react";

export function AutoReload({ delayMs }: { delayMs: number }) {
  const [remaining, setRemaining] = useState(Math.ceil(delayMs / 1000));

  useEffect(() => {
    const interval = setInterval(() => {
      setRemaining((s) => {
        if (s <= 1) {
          clearInterval(interval);
          window.location.reload();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <span className="tabular-nums text-cyan-400/70">{remaining}s</span>
  );
}
