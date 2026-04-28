const DEFAULT_US_TIME_ZONE = "America/Chicago";

export const APP_TIME_ZONE = process.env.NEXT_PUBLIC_APP_TIME_ZONE || DEFAULT_US_TIME_ZONE;

type DateInput = string | number | Date | null | undefined;

function toDate(value: DateInput) {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatGameDateTime(value: DateInput) {
  const date = toDate(value);
  if (!date) return "TBD";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: APP_TIME_ZONE,
    timeZoneName: "short"
  }).format(date);
}

export function formatShortDate(value: DateInput) {
  const date = toDate(value);
  if (!date) return "TBD";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: APP_TIME_ZONE
  }).format(date);
}

export function formatLongDate(value: DateInput) {
  const date = toDate(value);
  if (!date) return "TBD";
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: APP_TIME_ZONE,
    timeZoneName: "short"
  }).format(date);
}

export function formatUsTime(value: DateInput) {
  const date = toDate(value);
  if (!date) return "TBD";
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: APP_TIME_ZONE,
    timeZoneName: "short"
  }).format(date);
}
