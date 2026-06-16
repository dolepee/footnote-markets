import { resolve } from "node:path";
import { fetchCreatorIntake } from "./lib/intake.js";
import { marketAddressFromEnv, isRegisteredSource, registerCandidateSource } from "./lib/source-registration.js";
import { readJson, root, writeJson } from "./lib/arc.js";
import { DEFAULT_MAX_BATCH_BOND, DEFAULT_MAX_PRICE, validateSourceCandidate } from "./lib/source-validation.js";

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
const maxPrice = Number(args.get("max-price") || DEFAULT_MAX_PRICE);
const maxBond = Number(args.get("max-bond") || DEFAULT_MAX_BATCH_BOND);
const marketAddress = marketAddressFromEnv();
if (!marketAddress) throw new Error("FOOTNOTE_MARKET or docs/live/arc-testnet.json market is required");

const registry = readJson(resolve(root, "docs/live/registered-sources.json"), []);
const candidates = await fetchCreatorIntake();
const approved = candidates.filter((candidate) => includeAll || candidate.labels?.includes(approvedLabel));
const reviewed = approved.map((candidate) => ({
  candidate,
  validation: validateSourceCandidate(candidate, { maxPrice, maxBond }),
}));
const rejected = reviewed.filter((item) => !item.validation.valid);
const pending = reviewed
  .filter((item) => item.validation.valid)
  .map((item) => item.validation.normalized)
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
    rejectedCandidates: rejected.length,
    pendingRegistration: pending.length,
    maxPrice,
    maxBond,
    rejected: rejected.map(({ candidate, validation }) => ({
      issue: candidate.issue,
      issueUrl: candidate.issueUrl,
      title: candidate.title,
      errors: validation.errors,
      warnings: validation.warnings,
    })),
    candidates: pending,
    checkedAt: new Date().toISOString(),
  };
  writeJson(resolve(root, "docs/intake/approved-sources-preview.json"), out);
  console.log(JSON.stringify(out, null, 2));
  process.exit(0);
}

const results = [];
for (const candidate of pending) {
  results.push(await registerCandidateSource(candidate, { marketAddress, maxPrice, maxBond }));
}

const out = {
  market: marketAddress,
  approvedLabel,
  includeAll,
  requested: pending.length,
  rejected: rejected.length,
  maxPrice,
  maxBond,
  registered: results.filter((result) => !result.skipped).length,
  skipped: results.filter((result) => result.skipped).length,
  results,
  completedAt: new Date().toISOString(),
};
writeJson(resolve(root, "docs/intake/approved-sources-latest.json"), out);
console.log(JSON.stringify(out, null, 2));
