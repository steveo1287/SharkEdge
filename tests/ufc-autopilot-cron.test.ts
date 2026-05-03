import assert from "node:assert/strict";

function isAuthorized(authHeader: string | null, cronSecret: string | undefined) {
  const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : null;
  return Boolean(cronSecret?.trim() && bearer === cronSecret.trim());
}

function boolParam(urlValue: string, name: string, fallback = false) {
  const value = new URL(urlValue).searchParams.get(name);
  if (value == null) return fallback;
  return value === "1" || value === "true" || value === "yes";
}

function numberParam(urlValue: string, name: string, fallback: number) {
  const value = new URL(urlValue).searchParams.get(name);
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

assert.equal(isAuthorized(null, "secret"), false);
assert.equal(isAuthorized("Bearer bad", "secret"), false);
assert.equal(isAuthorized("Bearer secret", "secret"), true);
assert.equal(isAuthorized("Bearer secret", undefined), false);
assert.equal(boolParam("https://example.com?simulate=1", "simulate"), true);
assert.equal(boolParam("https://example.com?simulate=false", "simulate"), false);
assert.equal(boolParam("https://example.com", "hydrate", true), true);
assert.equal(numberParam("https://example.com?limit=50", "limit", 25), 50);
assert.equal(numberParam("https://example.com?limit=bad", "limit", 25), 25);

console.log("ufc-autopilot-cron tests passed");
