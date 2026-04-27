import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const simPage = fs.readFileSync(path.join(root, "app", "sim", "page.tsx"), "utf8");
const homePage = fs.readFileSync(path.join(root, "app", "page.tsx"), "utf8");

assert.match(simPage, /buildSimProjection/);
assert.match(simPage, /buildBoardSportSections/);
assert.match(simPage, /Simulation Engine/);
assert.match(simPage, /Debug data/);
assert.match(homePage, /href="\/sim"/);
assert.match(homePage, /label="Simulator Studio"/);

console.log("sim-route-contract test passed");
