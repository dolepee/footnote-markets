import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPublicClient,
  createWalletClient,
  formatUnits,
  http,
  keccak256,
  parseUnits,
  stringToHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const root = resolve(__dirname, "../..");

export const arcTestnet = {
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: [process.env.ARC_RPC_URL || ""] } },
};

export const erc20Abi = [
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

export function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export function loadMarketArtifact() {
  return JSON.parse(readFileSync(resolve(root, "contracts/out/FootnoteMarket.sol/FootnoteMarket.json"), "utf8"));
}

export function loadClients() {
  const rpcUrl = requireEnv("ARC_RPC_URL");
  const privateKey = requireEnv("PRIVATE_KEY");
  const account = privateKeyToAccount(privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`);
  const chain = { ...arcTestnet, rpcUrls: { default: { http: [rpcUrl] } } };
  return {
    account,
    publicClient: createPublicClient({ chain, transport: http(rpcUrl) }),
    walletClient: createWalletClient({ account, chain, transport: http(rpcUrl) }),
  };
}

export async function assertArc(publicClient) {
  const chainId = await publicClient.getChainId();
  if (chainId !== arcTestnet.id) throw new Error(`Wrong chain ${chainId}; expected ${arcTestnet.id}`);
  return chainId;
}

export async function send(publicClient, walletClient, label, request) {
  const hash = await walletClient.writeContract(request);
  console.log(`${label}_tx=${hash}`);
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

export function hashText(value) {
  return keccak256(stringToHex(value));
}

export function usdcUnits(value) {
  return parseUnits(String(value), 6);
}

export function usdcString(value) {
  return formatUnits(value, 6);
}

export function readJson(path, fallback) {
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : fallback;
}

export function writeJson(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
}
