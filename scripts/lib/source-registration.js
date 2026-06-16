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
} from "./arc.js";

export function marketAddressFromEnv() {
  return process.env.FOOTNOTE_MARKET || readJson(resolve(root, "docs/live/arc-testnet.json"), {}).market;
}

export function sourceIdentity(candidate) {
  return `${candidate.sourceUrl}\n${candidate.title}\n${candidate.summary}`;
}

export function isRegisteredSource(registry, marketAddress, candidate) {
  return registry.some((item) => {
    if (item.market !== marketAddress) return false;
    if (candidate.issue && item.issue === candidate.issue) return true;
    if (candidate.issueUrl && item.issueUrl === candidate.issueUrl) return true;
    return item.sourceUrl === candidate.sourceUrl && item.title === candidate.title;
  });
}

export async function registerCandidateSource(candidate, options = {}) {
  const marketAddress = options.marketAddress || marketAddressFromEnv();
  const usdcAddress = options.usdcAddress || process.env.ARC_USDC || "0x3600000000000000000000000000000000000000";
  if (!marketAddress) throw new Error("FOOTNOTE_MARKET or docs/live/arc-testnet.json market is required");
  if (!isAddress(candidate.payoutWallet)) throw new Error(`Invalid payout wallet: ${candidate.payoutWallet}`);

  const registryPath = resolve(root, "docs/live/registered-sources.json");
  const registry = readJson(registryPath, []);
  if (isRegisteredSource(registry, marketAddress, candidate)) {
    return { skipped: true, reason: "already registered", candidate };
  }

  if (options.dryRun) {
    return {
      dryRun: true,
      market: marketAddress,
      sourceHash: hashText(sourceIdentity(candidate)),
      candidate,
    };
  }

  const { account, publicClient, walletClient } = options.clients || loadClients();
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
    txs.approveBond = await send(publicClient, walletClient, `approve_bond_${sourceId}`, {
      address: usdcAddress,
      abi: erc20Abi,
      functionName: "approve",
      args: [marketAddress, bond],
    });
  }

  txs.register = await send(publicClient, walletClient, `register_source_${sourceId}`, {
    address: marketAddress,
    abi: artifact.abi,
    functionName: "registerSource",
    args: [
      candidate.payoutWallet,
      hashText(sourceIdentity(candidate)),
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
    sourceType: candidate.sourceType || (candidate.issue ? "external" : "manual"),
    registeredBy: account.address,
    registeredAt: new Date().toISOString(),
    txs,
  };

  const latestRegistry = readJson(registryPath, []);
  const filtered = latestRegistry.filter((item) => !(item.market === marketAddress && item.sourceId === record.sourceId));
  writeJson(registryPath, [...filtered, record]);
  writeJson(resolve(root, `docs/live/sources/source-${record.sourceId}.json`), record);

  return { skipped: false, record };
}
