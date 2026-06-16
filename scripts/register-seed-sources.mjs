import { readFileSync } from "node:fs";
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

const marketAddress = process.env.FOOTNOTE_MARKET || readJson(resolve(root, "docs/live/arc-testnet.json"), {}).market;
const usdcAddress = process.env.ARC_USDC || "0x3600000000000000000000000000000000000000";
if (!marketAddress) throw new Error("FOOTNOTE_MARKET or docs/live/arc-testnet.json market is required");

const seeds = JSON.parse(readFileSync(resolve(root, "docs/seed-sources.json"), "utf8"));
const { account, publicClient, walletClient } = loadClients();
const chainId = await assertArc(publicClient);
const artifact = loadMarketArtifact();
const registryPath = resolve(root, "docs/live/registered-sources.json");
const registry = readJson(registryPath, []);
const records = [];

for (const seed of seeds) {
  if (!isAddress(seed.payoutWallet)) throw new Error(`Invalid payout wallet: ${seed.payoutWallet}`);
  const alreadyRegistered = registry.find(
    (source) => source.market === marketAddress && source.sourceUrl === seed.sourceUrl && source.title === seed.title,
  );
  if (alreadyRegistered) {
    records.push({ ...alreadyRegistered, skipped: true });
    continue;
  }

  const price = usdcUnits(seed.price);
  const bond = usdcUnits(seed.bond || "0");
  const sourceId = await publicClient.readContract({
    address: marketAddress,
    abi: artifact.abi,
    functionName: "nextSourceId",
  });

  const txs = {};
  if (bond > 0n) {
    txs.approveBond = await send(publicClient, walletClient, `approve_seed_${sourceId}`, {
      address: usdcAddress,
      abi: erc20Abi,
      functionName: "approve",
      args: [marketAddress, bond],
    });
  }

  txs.register = await send(publicClient, walletClient, `register_seed_${sourceId}`, {
    address: marketAddress,
    abi: artifact.abi,
    functionName: "registerSource",
    args: [
      seed.payoutWallet,
      hashText(`${seed.sourceUrl}\n${seed.title}\n${seed.summary}`),
      seed.sourceUrl,
      price,
      bond,
    ],
  });

  const record = {
    chainId,
    market: marketAddress,
    sourceId: sourceId.toString(),
    creator: seed.creator,
    sourceType: seed.sourceType || "seed",
    title: seed.title,
    sourceUrl: seed.sourceUrl,
    payoutWallet: seed.payoutWallet,
    price: seed.price,
    bond: seed.bond || "0",
    summary: seed.summary,
    issue: null,
    issueUrl: "",
    registeredBy: account.address,
    registeredAt: new Date().toISOString(),
    txs,
  };

  registry.push(record);
  records.push(record);
  writeJson(resolve(root, `docs/live/sources/source-${record.sourceId}.json`), record);
}

writeJson(registryPath, registry);
writeJson(resolve(root, "web/data/registered-sources.json"), registry);
console.log(JSON.stringify({ registered: records.length, records }, null, 2));
