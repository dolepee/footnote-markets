import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  assertArc,
  erc20Abi,
  hashText,
  loadClients,
  loadMarketArtifact,
  readJson,
  root,
  send,
  usdcString,
  usdcUnits,
  writeJson,
} from "./lib/arc.js";

const args = new Map(
  process.argv.slice(2).map((arg, index, all) => {
    if (!arg.startsWith("--")) return [String(index), arg];
    const next = all[index + 1];
    return [arg.slice(2), next && !next.startsWith("--") ? next : "true"];
  }),
);

const query = args.get("query") || "Why do nanopayments matter for creator publishing?";
const budget = usdcUnits(args.get("budget") || "0.05");
const dryRun = args.get("dry-run") === "true";
const requireExternal = args.get("require-external") === "true";
const agentBondDeposit = usdcUnits(args.get("agent-bond") || "0.10");
const marketAddress = process.env.FOOTNOTE_MARKET || readJson(resolve(root, "docs/live/arc-testnet.json"), {}).market;
const usdcAddress = process.env.ARC_USDC || "0x3600000000000000000000000000000000000000";
const registry = readJson(resolve(root, "docs/live/registered-sources.json"), []);

if (!marketAddress) throw new Error("FOOTNOTE_MARKET or docs/live/arc-testnet.json market is required");
if (registry.length === 0) throw new Error("No registered sources. Run scripts/register-creator-source.mjs first.");

const activeRegistry = requireExternal
  ? registry.filter((source) => source.sourceType === "external" || source.issue || source.issueUrl)
  : registry;

if (activeRegistry.length === 0) {
  console.log(
    JSON.stringify(
      {
        skipped: true,
        reason: "No external registered creator sources yet.",
        requireExternal,
        checkedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

function scoreSource(source, onchain = {}) {
  const haystack = `${source.title} ${source.summary || ""}`.toLowerCase();
  const tokens = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 3);
  const matches = tokens.filter((token) => haystack.includes(token)).length;
  const bond = Number(onchain.bond ?? source.bond ?? 0);
  const price = Number(onchain.price ?? source.price ?? 0);
  const reputation = Number(onchain.reputation ?? 0);
  return Math.round(matches * 18 + Math.min(20, bond * 240) + reputation * 2 - price * 850);
}

function decisionFor(score, price, spent) {
  if (score >= 34 && spent + price <= budget) {
    return { decision: "PAY", reason: "Relevance, economic trust, and budget all cleared." };
  }
  if (score >= 18) {
    return {
      decision: "REFUSE",
      reason:
        spent + price > budget
          ? "Useful source, but paying it would exceed the remaining budget."
          : "Reviewable source, but score did not clear the PAY threshold.",
    };
  }
  return { decision: "SKIP", reason: "Score below the review band for this query." };
}

function reasonPayload(item) {
  return {
    query,
    sourceId: String(item.source.sourceId),
    title: item.source.title,
    decision: item.decision,
    reason: item.reason,
    score: item.score,
    price: usdcString(item.price),
    bond: item.onchain.bond ?? item.source.bond ?? "0",
    reputation: item.onchain.reputation ?? "0",
  };
}

const artifact = loadMarketArtifact();
let chainId = 0;
let publicClient;
let walletClient;
let account = { address: "dry-run" };

if (!dryRun) {
  const clients = loadClients();
  publicClient = clients.publicClient;
  walletClient = clients.walletClient;
  account = clients.account;
  chainId = await assertArc(publicClient);
} else {
  chainId = 5042002;
}

let spent = 0n;
const decisions = [];

for (const source of activeRegistry) {
  let onchain = {
    price: source.price,
    bond: source.bond,
    reputation: 0,
  };

  if (!dryRun) {
    const result = await publicClient.readContract({
      address: marketAddress,
      abi: artifact.abi,
      functionName: "sources",
      args: [BigInt(source.sourceId)],
    });
    onchain = {
      price: usdcString(result[4]),
      bond: usdcString(result[5]),
      reputation: result[6].toString(),
      active: result[9],
    };
  }

  const price = usdcUnits(onchain.price);
  const score = scoreSource(source, onchain);
  const { decision, reason } = decisionFor(score, price, spent);
  if (decision === "PAY") spent += price;
  decisions.push({ source, onchain, score, decision, reason, price });
}

const payable = decisions.filter((item) => item.decision === "PAY");
const totalApproval = payable.reduce((sum, item) => sum + item.price, 0n);
const txs = [];
let startingAgentBond = 0n;
let finalAgentBond = 0n;
let agentBondNeeded = 0n;

if (!dryRun) {
  startingAgentBond = await publicClient.readContract({
    address: marketAddress,
    abi: artifact.abi,
    functionName: "agentBonds",
    args: [account.address],
  });
  agentBondNeeded = startingAgentBond === 0n ? agentBondDeposit : 0n;
}

if (!dryRun && totalApproval + agentBondNeeded > 0n) {
  txs.push({
    label: "approve_cycle_spend_and_bond",
    tx: await send(publicClient, walletClient, "approve_cycle_spend_and_bond", {
      address: usdcAddress,
      abi: erc20Abi,
      functionName: "approve",
      args: [marketAddress, totalApproval + agentBondNeeded],
    }),
  });
}

if (!dryRun && agentBondNeeded > 0n) {
  txs.push({
    label: "deposit_agent_bond",
    tx: await send(publicClient, walletClient, "deposit_agent_bond", {
      address: marketAddress,
      abi: artifact.abi,
      functionName: "depositAgentBond",
      args: [agentBondNeeded],
    }),
  });
}

for (const item of decisions) {
  if (dryRun) continue;
  const sourceId = BigInt(item.source.sourceId);
  const queryHash = hashText(query);
  const reasonHash = hashText(JSON.stringify(reasonPayload(item)));

  if (item.decision === "PAY") {
    txs.push({
      label: `pay_source_${item.source.sourceId}`,
      tx: await send(publicClient, walletClient, `pay_source_${item.source.sourceId}`, {
        address: marketAddress,
        abi: artifact.abi,
        functionName: "payCitation",
        args: [sourceId, queryHash, reasonHash],
      }),
    });
  } else {
    const decisionCode = item.decision === "REFUSE" ? 1 : 3;
    txs.push({
      label: `${item.decision.toLowerCase()}_source_${item.source.sourceId}`,
      tx: await send(publicClient, walletClient, `${item.decision.toLowerCase()}_source_${item.source.sourceId}`, {
        address: marketAddress,
        abi: artifact.abi,
        functionName: "recordDecision",
        args: [sourceId, decisionCode, queryHash, reasonHash],
      }),
    });
  }
}

if (!dryRun) {
  finalAgentBond = await publicClient.readContract({
    address: marketAddress,
    abi: artifact.abi,
    functionName: "agentBonds",
    args: [account.address],
  });
}

const cycle = {
  chainId,
  market: marketAddress,
  actor: account.address,
  query,
  budget: usdcString(budget),
  spent: usdcString(spent),
  dryRun,
  startingAgentBond: usdcString(startingAgentBond),
  finalAgentBond: usdcString(finalAgentBond),
  decisions: decisions.map((item) => ({
    sourceId: item.source.sourceId,
    creator: item.source.creator,
    title: item.source.title,
    decision: item.decision,
    reason: item.reason,
    reasonHash: hashText(JSON.stringify(reasonPayload(item))),
    score: item.score,
    price: usdcString(item.price),
    onchain: item.onchain,
  })),
  txs,
  completedAt: new Date().toISOString(),
};

const cyclesDir = resolve(root, "docs/live/cycles");
mkdirSync(cyclesDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
writeJson(resolve(cyclesDir, `${stamp}.json`), cycle);
writeJson(resolve(root, "docs/live/latest-cycle.json"), cycle);
writeJson(resolve(root, "web/data/latest-cycle.json"), cycle);

console.log(JSON.stringify(cycle, null, 2));
