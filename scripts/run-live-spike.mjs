import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  formatUnits,
  http,
  keccak256,
  parseUnits,
  stringToHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const rpcUrl = process.env.ARC_RPC_URL;
const privateKey = process.env.PRIVATE_KEY;
const usdcAddress = process.env.ARC_USDC || "0x3600000000000000000000000000000000000000";
const marketAddress = process.env.FOOTNOTE_MARKET;

if (!rpcUrl) throw new Error("ARC_RPC_URL is required");
if (!privateKey) throw new Error("PRIVATE_KEY is required");
if (!marketAddress) throw new Error("FOOTNOTE_MARKET is required");

const arcTestnet = {
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: [rpcUrl] } },
};

const account = privateKeyToAccount(privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`);
const publicClient = createPublicClient({ chain: arcTestnet, transport: http(rpcUrl) });
const walletClient = createWalletClient({ account, chain: arcTestnet, transport: http(rpcUrl) });

const marketArtifact = JSON.parse(
  readFileSync(resolve(root, "contracts/out/FootnoteMarket.sol/FootnoteMarket.json"), "utf8"),
);

const erc20Abi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
];

async function send(label, request) {
  const hash = await walletClient.writeContract(request);
  console.log(`${label}_tx=${hash}`);
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

function h(value) {
  return keccak256(stringToHex(value));
}

const chainId = await publicClient.getChainId();
if (chainId !== arcTestnet.id) throw new Error(`Wrong chain ${chainId}; expected ${arcTestnet.id}`);

const price = parseUnits("0.003", 6);
const bond = parseUnits("0.05", 6);
const totalApproval = price + bond;
const sourceId = await publicClient.readContract({
  address: marketAddress,
  abi: marketArtifact.abi,
  functionName: "nextSourceId",
});

const startingBalance = await publicClient.readContract({
  address: usdcAddress,
  abi: erc20Abi,
  functionName: "balanceOf",
  args: [account.address],
});

if (startingBalance < totalApproval) {
  throw new Error(`Insufficient ERC-20 USDC: ${formatUnits(startingBalance, 6)} available`);
}

const approveTx = await send("approve", {
  address: usdcAddress,
  abi: erc20Abi,
  functionName: "approve",
  args: [marketAddress, totalApproval],
});

const registerTx = await send("register", {
  address: marketAddress,
  abi: marketArtifact.abi,
  functionName: "registerSource",
  args: [
    account.address,
    h("footnote spike source body v1"),
    "https://example.com/footnote/arc-nanopayments-source",
    price,
    bond,
  ],
});

const paidReceiptId = await publicClient.readContract({
  address: marketAddress,
  abi: marketArtifact.abi,
  functionName: "nextReceiptId",
});

const payTx = await send("pay", {
  address: marketAddress,
  abi: marketArtifact.abi,
  functionName: "payCitation",
  args: [
    sourceId,
    h("why do nanopayments matter for creator publishing?"),
    h("high relevance, bonded source, inside budget"),
  ],
});

const refuseTx = await send("refuse", {
  address: marketAddress,
  abi: marketArtifact.abi,
  functionName: "recordDecision",
  args: [
    sourceId,
    1,
    h("why do nanopayments matter for creator publishing?"),
    h("overpriced competitor for lower relevance"),
  ],
});

const updateTx = await send("update_hash", {
  address: marketAddress,
  abi: marketArtifact.abi,
  functionName: "updateSourceHash",
  args: [sourceId, h("footnote spike source body v2 changed")],
});

const challengeTx = await send("challenge", {
  address: marketAddress,
  abi: marketArtifact.abi,
  functionName: "challengeHashChanged",
  args: [paidReceiptId],
});

const source = await publicClient.readContract({
  address: marketAddress,
  abi: marketArtifact.abi,
  functionName: "sources",
  args: [sourceId],
});

const endingBalance = await publicClient.readContract({
  address: usdcAddress,
  abi: erc20Abi,
  functionName: "balanceOf",
  args: [account.address],
});

const result = {
  chainId,
  market: marketAddress,
  actor: account.address,
  sourceId: sourceId.toString(),
  paidReceiptId: paidReceiptId.toString(),
  price: formatUnits(price, 6),
  bond: formatUnits(bond, 6),
  remainingBond: formatUnits(source[5], 6),
  reputation: source[6].toString(),
  startingBalance: formatUnits(startingBalance, 6),
  endingBalance: formatUnits(endingBalance, 6),
  txs: {
    approve: approveTx,
    register: registerTx,
    pay: payTx,
    refuse: refuseTx,
    updateHash: updateTx,
    challenge: challengeTx,
  },
  completedAt: new Date().toISOString(),
};

const outDir = resolve(root, "docs/live");
mkdirSync(outDir, { recursive: true });
writeFileSync(resolve(outDir, "spike-arc-testnet.json"), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
