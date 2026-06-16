import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { issueToCandidate } from "./lib/intake.js";
import { marketAddressFromEnv, isRegisteredSource } from "./lib/source-registration.js";
import { readJson, root } from "./lib/arc.js";
import { DEFAULT_MAX_BATCH_BOND, DEFAULT_MAX_PRICE, validateSourceCandidate } from "./lib/source-validation.js";

const args = new Map(
  process.argv.slice(2).map((arg, index, all) => {
    if (!arg.startsWith("--")) return [String(index), arg];
    const next = all[index + 1];
    return [arg.slice(2), next && !next.startsWith("--") ? next : "true"];
  }),
);

const issueNumber = args.get("issue");
const outPath = args.get("out") || "";
const repo = args.get("repo") || process.env.GITHUB_REPOSITORY || "dolepee/footnote-markets";
const maxPrice = Number(args.get("max-price") || DEFAULT_MAX_PRICE);
const maxBond = Number(args.get("max-bond") || DEFAULT_MAX_BATCH_BOND);
const marketAddress = marketAddressFromEnv();

if (!issueNumber) throw new Error("--issue is required");
if (!marketAddress) throw new Error("FOOTNOTE_MARKET or docs/live/arc-testnet.json market is required");

const headers = { Accept: "application/vnd.github+json" };
if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
if (process.env.GH_TOKEN) headers.Authorization = `Bearer ${process.env.GH_TOKEN}`;

const response = await fetch(`https://api.github.com/repos/${repo}/issues/${issueNumber}`, { headers });
if (!response.ok) throw new Error(`GitHub issue fetch failed: ${response.status}`);

const issue = await response.json();
const candidate = issueToCandidate(issue);
const validation = validateSourceCandidate(candidate, { maxPrice, maxBond });
const registry = readJson(resolve(root, "docs/live/registered-sources.json"), []);
const registered = validation.valid && isRegisteredSource(registry, marketAddress, validation.normalized);

const status = !validation.valid ? "needs fixes" : registered ? "already registered" : "ready for human review";
const nextAction = !validation.valid
  ? "Please edit the issue and fix the validation errors below."
  : registered
    ? "No action needed; this source already exists in the Arc registry."
    : "Maintainer action: review the source, then add `approved-source` when ready for Arc registration.";

const list = (items) => (items.length ? items.map((item) => `- ${item}`).join("\n") : "- none");
const body = `### Footnote source validation

Status: **${status}**

${nextAction}

| Field | Value |
| --- | --- |
| Creator | ${candidate.creator || "-"} |
| Price | ${validation.normalized.price || "-"} USDC |
| Bond | ${validation.normalized.bond || "0"} USDC |
| Max price | ${maxPrice} USDC |
| Max auto-funded batch bond | ${maxBond} USDC |

Errors:
${list(validation.errors)}

Warnings:
${list(validation.warnings)}

Validation is objective formatting only. Approval remains manual, and V1 slashing remains limited to objective hash-change failures.
`;

if (outPath) {
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, body);
} else {
  console.log(body);
}
