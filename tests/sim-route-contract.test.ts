import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const simPage = fs.readFileSync(path.join(root, "app", "sim", "page.tsx"), "utf8");
const homePage = fs.readFileSync(path.join(root, "app", "page.tsx"), "utf8");

assert.match(simPage, /readSimCache/);
assert.match(simPage, /Simulation Command Desk/);
assert.match(simPage, /Cache boundary/);
assert.doesNotMatch(simPage, /from "@\/services\/simulation\/sim-projection-engine"/);
assert.doesNotMatch(simPage, /from "@\/services\/events\/live-score-service"/);
assert.match(homePage, /href="\/sim"/);

console.log("sim-route-contract test passed");
