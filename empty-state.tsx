import { cn } from "@/lib/utils/cn";

function hashSeed(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash;
}

function buildFallbackPalette(seedInput: string) {
  const seed = hashSeed(seedInput);
  const hue = seed % 360;
  const accentHue = (hue + 48) % 360;

  return {
    background: `linear-gradient(135deg, hsla(${hue}, 72%, 16%, 1) 0%, hsla(${accentHue}, 72%, 24%, 1) 100%)`,
    border: `hsla(${accentHue}, 78%, 58%, 0.32)`,
    glow: `0 0 0 1px hsla(${accentHue}, 78%, 58%, 0.1), 0 16px 30px hsla(${hue}, 90%, 5%, 0.4)`
  };
}

type IdentityTileProps = {
  label: string;
  shortLabel: string;
  imageUrl?: string | null;
  size?: "sm" | "md" | "lg";
  subtle?: boolean;
};

const sizeClasses: Record<NonNullable<IdentityTileProps["size"]>, string> = {
  sm: "h-11 w-11 rounded-[1rem] text-sm",
  md: "h-14 w-14 rounded-[1.15rem] text-base",
  lg: "h-20 w-20 rounded-[1.5rem] text-xl"
};

export function IdentityTile({
  label,
  shortLabel,
  imageUrl,
  size = "md",
  subtle = false
}: IdentityTileProps) {
  const palette = buildFallbackPalette(label);

  return (
    <div
      className={cn(
        "relative overflow-hidden border text-white",
        sizeClasses[size],
        subtle ? "border-white/8 bg-slate-950/65" : ""
      )}
      style={
        subtle
          ? undefined
          : {
              background: palette.background,
              borderColor: palette.border,
              boxShadow: palette.glow
            }
      }
    >
      {imageUrl ? (
        <img src={imageUrl} alt={label} className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center font-display font-semibold tracking-[0.12em]">
          {shortLabel}
        </div>
      )}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.16),transparent_45%)]" />
    </div>
  );
}
