import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fetchCreatorIntake } from "./lib/intake.js";
import { marketAddressFromEnv, isRegisteredSource } from "./lib/source-registration.js";
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
const reviewLabel = args.get("review-label") || "needs-source-review";
const maxPrice = Number(args.get("max-price") || DEFAULT_MAX_PRICE);
const maxBond = Number(args.get("max-bond") || DEFAULT_MAX_BATCH_BOND);
const write = args.get("write") === "true";
const json = args.get("json") === "true";
const marketAddress = marketAddressFromEnv();

if (!marketAddress) throw new Error("FOOTNOTE_MARKET or docs/live/arc-testnet.json market is required");

const registry = readJson(resolve(root, "docs/live/registered-sources.json"), []);
const candidates = await fetchCreatorIntake();

const reviewed = candidates.map((candidate) => {
  const validation = validateSourceCandidate(candidate, { maxPrice, maxBond });
  const approved = candidate.labels?.includes(approvedLabel) || false;
  const registered = validation.valid && isRegisteredSource(registry, marketAddress, validation.normalized);
  let status = "ready_for_review";

  if (!validation.valid) status = "needs_fix";
  else if (registered) status = "already_registered";
  else if (approved) status = "approved_ready";

  const nextAction =
    status === "approved_ready"
      ? "Run: npm run source:approved -- --dry-run, then npm run source:approved"
      : status === "ready_for_review"
        ? `Review manually, then: gh issue edit ${candidate.issue} --add-label ${approvedLabel} --remove-label ${reviewLabel}`
        : status === "needs_fix"
          ? "Ask creator to fix the validation errors before approval"
          : "No action; source is already registered";

  return {
    issue: candidate.issue,
    issueUrl: candidate.issueUrl,
    title: candidate.title,
    creator: candidate.creator,
    sourceUrl: candidate.sourceUrl,
    price: validation.normalized.price,
    bond: validation.normalized.bond,
    labels: candidate.labels || [],
    status,
    nextAction,
    errors: validation.errors,
    warnings: validation.warnings,
  };
});

const summary = {
  market: marketAddress,
  total: reviewed.length,
  approvedReady: reviewed.filter((item) => item.status === "approved_ready").length,
  readyForReview: reviewed.filter((item) => item.status === "ready_for_review").length,
  needsFix: reviewed.filter((item) => item.status === "needs_fix").length,
  alreadyRegistered: reviewed.filter((item) => item.status === "already_registered").length,
  maxPrice,
  maxBond,
  checkedAt: new Date().toISOString(),
};

const out = { summary, reviewed };

function markdownReport() {
  const rows = reviewed
    .map((item) => {
      const errors = item.errors.length ? item.errors.join("; ") : "-";
      const warnings = item.warnings.length ? item.warnings.join("; ") : "-";
      return `| #${item.issue} | ${item.status} | ${item.creator} | ${item.price} | ${item.bond} | ${errors} | ${warnings} |`;
    })
    .join("\n");

  return `# Footnote Creator Intake Review

Generated: ${summary.checkedAt}

| Metric | Value |
| --- | ---: |
| Total issues | ${summary.total} |
| Approved and ready | ${summary.approvedReady} |
| Ready for review | ${summary.readyForReview} |
| Needs fix | ${summary.needsFix} |
| Already registered | ${summary.alreadyRegistered} |
| Max price | ${summary.maxPrice} |
| Max batch bond | ${summary.maxBond} |

| Issue | Status | Creator | Price | Bond | Errors | Warnings |
| --- | --- | --- | ---: | ---: | --- | --- |
${rows || "| - | - | - | - | - | - | - |"}
`;
}

if (write) {
  writeJson(resolve(root, "docs/intake/review-queue.json"), out);
  const markdownPath = resolve(root, "docs/intake/review-queue.md");
  mkdirSync(dirname(markdownPath), { recursive: true });
  writeFileSync(markdownPath, markdownReport());
}

if (json) {
  console.log(JSON.stringify(out, null, 2));
} else {
  console.log("Footnote creator intake review");
  console.log(`- total: ${summary.total}`);
  console.log(`- approved ready: ${summary.approvedReady}`);
  console.log(`- ready for review: ${summary.readyForReview}`);
  console.log(`- needs fix: ${summary.needsFix}`);
  console.log(`- already registered: ${summary.alreadyRegistered}`);
  for (const item of reviewed) {
    console.log(`\n#${item.issue} ${item.status}: ${item.title}`);
    console.log(`creator=${item.creator} price=${item.price} bond=${item.bond}`);
    if (item.errors.length) console.log(`errors=${item.errors.join("; ")}`);
    if (item.warnings.length) console.log(`warnings=${item.warnings.join("; ")}`);
    console.log(item.nextAction);
  }
  if (write) console.log("\nWrote docs/intake/review-queue.json and docs/intake/review-queue.md");
}
