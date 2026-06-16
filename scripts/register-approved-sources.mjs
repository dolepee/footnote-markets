import { resolve } from "node:path";
import { fetchCreatorIntake } from "./lib/intake.js";
import { marketAddressFromEnv, isRegisteredSource, registerCandidateSource } from "./lib/source-registration.js";
import { readJson, root, writeJson } from "./lib/arc.js";

const args = new Map(
  process.argv.slice(2).map((arg, index, all) => {
    if (!arg.startsWith("--")) return [String(index), arg];
    const next = all[index + 1];
    return [arg.slice(2), next && !next.startsWith("--") ? next : "true"];
  }),
);

const approvedLabel = args.get("label") || "approved-source";
const dryRun = args.get("dry-run") === "true";
const includeAll = args.get("all") === "true";
const limit = Number(args.get("limit") || 10);
const marketAddress = marketAddressFromEnv();
if (!marketAddress) throw new Error("FOOTNOTE_MARKET or docs/live/arc-testnet.json market is required");

const registry = readJson(resolve(root, "docs/live/registered-sources.json"), []);
const candidates = await fetchCreatorIntake();
const approved = candidates.filter((candidate) => includeAll || candidate.labels?.includes(approvedLabel));
const pending = approved
  .filter((candidate) => !isRegisteredSource(registry, marketAddress, candidate))
  .slice(0, Number.isFinite(limit) && limit > 0 ? limit : 10);

if (dryRun) {
  const out = {
    dryRun,
    market: marketAddress,
    approvedLabel,
    includeAll,
    totalCreatorIssues: candidates.length,
    approvedCandidates: approved.length,
    pendingRegistration: pending.length,
    candidates: pending,
    checkedAt: new Date().toISOString(),
  };
  writeJson(resolve(root, "docs/intake/approved-sources-preview.json"), out);
  console.log(JSON.stringify(out, null, 2));
  process.exit(0);
}

const results = [];
for (const candidate of pending) {
  results.push(await registerCandidateSource(candidate, { marketAddress }));
}

const out = {
  market: marketAddress,
  approvedLabel,
  includeAll,
  requested: pending.length,
  registered: results.filter((result) => !result.skipped).length,
  skipped: results.filter((result) => result.skipped).length,
  results,
  completedAt: new Date().toISOString(),
};
writeJson(resolve(root, "docs/intake/approved-sources-latest.json"), out);
console.log(JSON.stringify(out, null, 2));
