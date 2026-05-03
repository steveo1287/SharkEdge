import assert from "node:assert/strict";

function authorized(urlValue: string, envSecret?: string, headerSecret?: string) {
  const url = new URL(urlValue);
  if (envSecret) return url.searchParams.get("token") === envSecret || headerSecret === envSecret;
  return url.searchParams.get("confirm") === "load-upcoming";
}

assert.equal(authorized("https://example.com/api/admin/ufc/load-upcoming"), false);
assert.equal(authorized("https://example.com/api/admin/ufc/load-upcoming?confirm=load-upcoming"), true);
assert.equal(authorized("https://example.com/api/admin/ufc/load-upcoming?token=bad", "secret"), false);
assert.equal(authorized("https://example.com/api/admin/ufc/load-upcoming?token=secret", "secret"), true);
assert.equal(authorized("https://example.com/api/admin/ufc/load-upcoming", "secret", "secret"), true);

console.log("ufc-admin-load-route tests passed");
