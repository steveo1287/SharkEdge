import assert from "node:assert/strict";

import { getSharkTrendCatalog } from "../src/server/sharktrends/catalog";
import { sharkTrendFilterZodSchema } from "../src/server/sharktrends/types";

const catalog = getSharkTrendCatalog();
assert.ok(catalog.templates.length >= 5);
for (const template of catalog.templates) {
  assert.equal(sharkTrendFilterZodSchema.parse(template.filters).league, "MLB");
  assert.ok(template.requiresFields.length > 0);
}
console.log("sharktrends-api-contract tests passed");
