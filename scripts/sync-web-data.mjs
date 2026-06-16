import { existsSync, copyFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { root } from "./lib/arc.js";

const files = [
  ["docs/live/latest-cycle.json", "web/data/latest-cycle.json"],
  ["docs/live/registered-sources.json", "web/data/registered-sources.json"],
  ["docs/live/arc-testnet.json", "web/data/arc-testnet.json"],
];

const synced = [];
for (const [from, to] of files) {
  const source = resolve(root, from);
  const target = resolve(root, to);
  if (!existsSync(source)) continue;
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(source, target);
  synced.push({ from, to });
}

console.log(JSON.stringify({ synced, completedAt: new Date().toISOString() }, null, 2));
