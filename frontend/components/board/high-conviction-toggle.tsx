"use client";

type HighConvictionToggleProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
};

export function HighConvictionToggle({ checked, onChange }: HighConvictionToggleProps) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] transition ${
        checked
          ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-200"
          : "border-white/10 bg-white/[0.04] text-slate-400"
      }`}
      aria-pressed={checked}
    >
      <span
        className={`h-2.5 w-2.5 rounded-full ${checked ? "bg-emerald-300" : "bg-slate-500"}`}
      />
      High conviction winners only
    </button>
  );
}
