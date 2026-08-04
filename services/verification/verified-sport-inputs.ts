export type VerificationState = "VERIFIED" | "PARTIAL" | "MISSING" | "STALE";

export type VerificationField = {
  key: string;
  label: string;
  state: VerificationState;
  required: boolean;
  source: string | null;
  value?: string | number | boolean | null;
  note?: string | null;
  observedAt?: string | null;
};

export type VerifiedSportInputAudit = {
  sport: "MLB" | "NFL" | "UFC";
  eventId: string;
  checkedAt: string;
  grade: number;
  state: "READY" | "LIMITED" | "BLOCKED";
  requiredVerified: number;
  requiredTotal: number;
  optionalVerified: number;
  optionalTotal: number;
  missingRequired: string[];
  staleRequired: string[];
  fields: VerificationField[];
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}

export function buildVerifiedSportInputAudit(args: {
  sport: VerifiedSportInputAudit["sport"];
  eventId: string;
  fields: VerificationField[];
  checkedAt?: string;
}): VerifiedSportInputAudit {
  const required = args.fields.filter((field) => field.required);
  const optional = args.fields.filter((field) => !field.required);
  const requiredVerified = required.filter((field) => field.state === "VERIFIED").length;
  const optionalVerified = optional.filter((field) => field.state === "VERIFIED").length;
  const missingRequired = required
    .filter((field) => field.state === "MISSING")
    .map((field) => field.key);
  const staleRequired = required
    .filter((field) => field.state === "STALE")
    .map((field) => field.key);

  // Required evidence controls most of the grade. Optional depth can improve the
  // grade but can never make a materially incomplete event look fully verified.
  const requiredRatio = required.length ? requiredVerified / required.length : 0;
  const optionalRatio = optional.length ? optionalVerified / optional.length : 1;
  const grade = Math.round(clamp(requiredRatio * 85 + optionalRatio * 15, 0, 100));

  const state: VerifiedSportInputAudit["state"] =
    missingRequired.length > 0 || staleRequired.length > 0 || requiredRatio < 0.75
      ? "BLOCKED"
      : requiredRatio < 1 || optionalRatio < 0.5
        ? "LIMITED"
        : "READY";

  return {
    sport: args.sport,
    eventId: args.eventId,
    checkedAt: args.checkedAt ?? new Date().toISOString(),
    grade,
    state,
    requiredVerified,
    requiredTotal: required.length,
    optionalVerified,
    optionalTotal: optional.length,
    missingRequired,
    staleRequired,
    fields: args.fields
  };
}

export function verifiedField(args: {
  key: string;
  label: string;
  value: unknown;
  required?: boolean;
  source?: string | null;
  note?: string | null;
  observedAt?: string | null;
  stale?: boolean;
}): VerificationField {
  const hasValue =
    args.value !== null &&
    args.value !== undefined &&
    args.value !== "" &&
    !(Array.isArray(args.value) && args.value.length === 0);

  return {
    key: args.key,
    label: args.label,
    required: args.required ?? true,
    state: args.stale ? "STALE" : hasValue ? "VERIFIED" : "MISSING",
    source: args.source ?? null,
    value:
      typeof args.value === "string" ||
      typeof args.value === "number" ||
      typeof args.value === "boolean" ||
      args.value == null
        ? args.value as string | number | boolean | null
        : Array.isArray(args.value)
          ? args.value.length
          : true,
    note: args.note ?? null,
    observedAt: args.observedAt ?? null
  };
}
