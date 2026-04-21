import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const boardRoute = fs.readFileSync(path.join(root, "app", "api", "v1", "board", "route.ts"), "utf8");
const boardLiveRoute = fs.readFileSync(path.join(root, "app", "api", "v1", "board-live", "route.ts"), "utf8");

assert.match(boardRoute, /getBoardPageData/);
assert.doesNotMatch(boardRoute, /getLiveBoardPageData/);

assert.doesNotMatch(boardLiveRoute, /getBoardPageData/);
assert.match(boardLiveRoute, /getLiveBoardPageData/);

console.log("board-route-contract test passed");
