import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const simPage = fs.readFileSync(path.join(root, "app", "sim", "page.tsx"), "utf8");
const homePage = fs.readFileSync(path.join(root, "app", "page.tsx"), "utf8");

assert.match(simPage, /href=\{`\/game\/\$\{event\.id\}#simulation`\}/);
assert.match(simPage, /href=\{`\/game\/\$\{event\.id\}`\}/);
assert.match(homePage, /href="\/sim"/);
assert.match(homePage, /label="Simulator Studio"/);

console.log("sim-route-contract test passed");
