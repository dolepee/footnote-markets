import { resolve } from "node:path";
import { isAddress } from "viem";
import {
  assertArc,
  erc20Abi,
  hashText,
  loadClients,
  loadMarketArtifact,
  readJson,
  root,
  send,
  usdcUnits,
  writeJson,
} from "./lib/arc.js";
import { fetchCreatorIntake } from "./lib/intake.js";

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
    creator: required("creator"),
    sourceUrl: required("url"),
    payoutWallet: required("wallet"),
    price: required("price"),
    bond: args.get("bond") || "0",
    title: required("title"),
    summary: args.get("summary") || "Creator source registered manually.",
  };
}

const marketAddress = process.env.FOOTNOTE_MARKET || readJson(resolve(root, "docs/live/arc-testnet.json"), {}).market;
const usdcAddress = process.env.ARC_USDC || "0x3600000000000000000000000000000000000000";
if (!marketAddress) throw new Error("FOOTNOTE_MARKET or docs/live/arc-testnet.json market is required");

const candidate = await candidateFromArgs();
if (!isAddress(candidate.payoutWallet)) throw new Error(`Invalid payout wallet: ${candidate.payoutWallet}`);

const { account, publicClient, walletClient } = loadClients();
const chainId = await assertArc(publicClient);
const artifact = loadMarketArtifact();
const price = usdcUnits(candidate.price);
const bond = usdcUnits(candidate.bond || "0");
const sourceId = await publicClient.readContract({
  address: marketAddress,
  abi: artifact.abi,
  functionName: "nextSourceId",
});

const txs = {};
if (bond > 0n) {
  txs.approveBond = await send(publicClient, walletClient, "approve_bond", {
    address: usdcAddress,
    abi: erc20Abi,
    functionName: "approve",
    args: [marketAddress, bond],
  });
}

txs.register = await send(publicClient, walletClient, "register_source", {
  address: marketAddress,
  abi: artifact.abi,
  functionName: "registerSource",
  args: [
    candidate.payoutWallet,
    hashText(`${candidate.sourceUrl}\n${candidate.title}\n${candidate.summary}`),
    candidate.sourceUrl,
    price,
    bond,
  ],
});

const record = {
  chainId,
  market: marketAddress,
  sourceId: sourceId.toString(),
  creator: candidate.creator,
  title: candidate.title,
  sourceUrl: candidate.sourceUrl,
  payoutWallet: candidate.payoutWallet,
  price: candidate.price,
  bond: candidate.bond || "0",
  summary: candidate.summary,
  issue: candidate.issue,
  issueUrl: candidate.issueUrl,
  registeredBy: account.address,
  registeredAt: new Date().toISOString(),
  txs,
};

const registryPath = resolve(root, "docs/live/registered-sources.json");
const registry = readJson(registryPath, []);
const filtered = registry.filter((item) => !(item.market === marketAddress && item.sourceId === record.sourceId));
writeJson(registryPath, [...filtered, record]);
writeJson(resolve(root, `docs/live/sources/source-${record.sourceId}.json`), record);

console.log(JSON.stringify(record, null, 2));
