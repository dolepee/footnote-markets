import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const rpcUrl = process.env.ARC_RPC_URL;
const privateKey = process.env.PRIVATE_KEY;
const usdc = process.env.ARC_USDC || "0x3600000000000000000000000000000000000000";

if (!rpcUrl) throw new Error("ARC_RPC_URL is required");
if (!privateKey) throw new Error("PRIVATE_KEY is required");

const arcTestnet = {
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: [rpcUrl] } },
};

const artifact = JSON.parse(
  readFileSync(resolve(root, "contracts/out/FootnoteMarket.sol/FootnoteMarket.json"), "utf8"),
);

const account = privateKeyToAccount(privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`);
const publicClient = createPublicClient({ chain: arcTestnet, transport: http(rpcUrl) });
const walletClient = createWalletClient({ account, chain: arcTestnet, transport: http(rpcUrl) });

const chainId = await publicClient.getChainId();
if (chainId !== arcTestnet.id) throw new Error(`Wrong chain ${chainId}; expected ${arcTestnet.id}`);

const hash = await walletClient.deployContract({
  abi: artifact.abi,
  bytecode: artifact.bytecode.object,
  args: [usdc],
});

console.log(`deploy_tx=${hash}`);
const receipt = await publicClient.waitForTransactionReceipt({ hash });
console.log(`market=${receipt.contractAddress}`);

const outDir = resolve(root, "docs/live");
mkdirSync(outDir, { recursive: true });
writeFileSync(
  resolve(outDir, "arc-testnet.json"),
  `${JSON.stringify(
    {
      chainId,
      market: receipt.contractAddress,
      usdc,
      deployTx: hash,
      deployer: account.address,
      deployedAt: new Date().toISOString(),
    },
    null,
    2,
  )}\n`,
);

