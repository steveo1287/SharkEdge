export function parseArgs(argv: string[]) {
  const args = new Map<string, string | boolean>();
  for (const raw of argv) {
    if (!raw.startsWith("--")) {
      continue;
    }
    const [key, value] = raw.slice(2).split("=", 2);
    args.set(key, value === undefined ? true : value);
  }
  return args;
}

export function getStringArg(args: Map<string, string | boolean>, key: string) {
  const value = args.get(key);
  return typeof value === "string" ? value : undefined;
}

export function getBooleanArg(args: Map<string, string | boolean>, key: string) {
  const value = args.get(key);
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    return value === "true" || value === "1";
  }
  return false;
}

export function getNumberArg(
  args: Map<string, string | boolean>,
  key: string,
  fallback: number
) {
  const value = getStringArg(args, key);
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function logStep(label: string, details?: Record<string, unknown>) {
  const suffix = details ? ` ${JSON.stringify(details)}` : "";
  console.info(`[runtime] ${label}${suffix}`);
}
