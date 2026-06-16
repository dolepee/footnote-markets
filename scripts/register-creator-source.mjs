import { fetchCreatorIntake } from "./lib/intake.js";
import { marketAddressFromEnv, registerCandidateSource } from "./lib/source-registration.js";

const args = new Map(
  process.argv.slice(2).map((arg, index, all) => {
    if (!arg.startsWith("--")) return [String(index), arg];
    const next = all[index + 1];
    return [arg.slice(2), next && !next.startsWith("--") ? next : "true"];
  }),
);

function required(name) {
  const value = args.get(name);
  if (!value) throw new Error(`--${name} is required`);
  return value;
}

async function candidateFromArgs() {
  if (args.has("issue")) {
    const issueNumber = Number(required("issue"));
    const candidates = await fetchCreatorIntake();
    const candidate = candidates.find((item) => item.issue === issueNumber);
    if (!candidate) throw new Error(`No open creator-source issue #${issueNumber}`);
    return candidate;
  }

  return {
    issue: null,
    issueUrl: "",
    sourceType: args.get("source-type") || "manual",
    creator: required("creator"),
    sourceUrl: required("url"),
    payoutWallet: required("wallet"),
    price: required("price"),
    bond: args.get("bond") || "0",
    title: required("title"),
    summary: args.get("summary") || "Creator source registered manually.",
  };
}

const marketAddress = marketAddressFromEnv();
if (!marketAddress) throw new Error("FOOTNOTE_MARKET or docs/live/arc-testnet.json market is required");

const candidate = await candidateFromArgs();
const result = await registerCandidateSource(candidate, { marketAddress, dryRun: args.get("dry-run") === "true" });

console.log(JSON.stringify(result.record || result, null, 2));
