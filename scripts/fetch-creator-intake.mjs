import { resolve } from "node:path";
import { root, writeJson } from "./lib/arc.js";
import { fetchCreatorIntake } from "./lib/intake.js";

const candidates = await fetchCreatorIntake();
const out = resolve(root, "docs/intake/public-sources.json");
writeJson(out, {
  count: candidates.length,
  fetchedAt: new Date().toISOString(),
  candidates,
});

console.log(JSON.stringify({ count: candidates.length, out }, null, 2));
