import { readFileSync } from "node:fs";

const readText = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const readJson = (path) => JSON.parse(readText(path));

const errors = [];
const warnings = [];

const fail = (message) => errors.push(message);
const warn = (message) => warnings.push(message);
const isTx = (value) => /^0x[a-fA-F0-9]{64}$/.test(String(value || ""));
const isAddress = (value) => /^0x[a-fA-F0-9]{40}$/.test(String(value || ""));
const usdcMicros = (value) => BigInt(Math.round(Number(value || 0) * 1_000_000));

function assertEqual(name, actual, expected) {
  if (actual !== expected) fail(`${name}: expected ${expected}, received ${actual}`);
}

function assertTx(name, value) {
  if (!isTx(value)) fail(`${name}: invalid tx hash`);
}

function assertAddress(name, value) {
  if (!isAddress(value)) fail(`${name}: invalid address`);
}

function assertWebSync(name, docsPath, webPath) {
  if (readText(docsPath) !== readText(webPath)) fail(`${name}: docs/live and web/data are out of sync`);
}

const deployment = readJson("docs/live/arc-testnet.json");
const spike = readJson("docs/live/spike-arc-testnet.json");
const sources = readJson("docs/live/registered-sources.json");
const latest = readJson("docs/live/latest-cycle.json");

assertWebSync("latest cycle", "docs/live/latest-cycle.json", "web/data/latest-cycle.json");
assertWebSync("registered sources", "docs/live/registered-sources.json", "web/data/registered-sources.json");

assertEqual("spike chain", spike.chainId, deployment.chainId);
assertEqual("latest chain", latest.chainId, deployment.chainId);
assertEqual("spike market", spike.market, deployment.market);
assertEqual("latest market", latest.market, deployment.market);
assertAddress("deployment market", deployment.market);
assertAddress("deployment usdc", deployment.usdc);
assertTx("deployment tx", deployment.deployTx);

const sourceIds = new Set();
let externalCount = 0;
for (const source of sources) {
  if (!source.sourceId) fail("source missing sourceId");
  if (sourceIds.has(String(source.sourceId))) fail(`duplicate sourceId ${source.sourceId}`);
  sourceIds.add(String(source.sourceId));
  if (source.sourceType === "external") externalCount += 1;
  assertEqual(`source ${source.sourceId} chain`, source.chainId, deployment.chainId);
  assertEqual(`source ${source.sourceId} market`, source.market, deployment.market);
  assertAddress(`source ${source.sourceId} payout wallet`, source.payoutWallet);
  if (!source.title) fail(`source ${source.sourceId}: missing title`);
  if (!source.sourceUrl) fail(`source ${source.sourceId}: missing sourceUrl`);
  if (Number(source.price) < 0) fail(`source ${source.sourceId}: negative price`);
  if (Number(source.bond) < 0) fail(`source ${source.sourceId}: negative bond`);
  Object.entries(source.txs || {}).forEach(([label, tx]) => assertTx(`source ${source.sourceId} ${label}`, tx));
}

if (externalCount === 0) warn("no external creator source registered yet");

const decisions = Array.isArray(latest.decisions) ? latest.decisions : [];
const latestTxs = Array.isArray(latest.txs) ? latest.txs : [];
if (decisions.length === 0) fail("latest cycle has no decisions");
if (latestTxs.length === 0) fail("latest cycle has no txs");

let paidMicros = 0n;
const decisionSourceIds = new Set();
for (const decision of decisions) {
  const sourceId = String(decision.sourceId || "");
  if (!sourceIds.has(sourceId)) fail(`latest decision references missing source ${sourceId}`);
  decisionSourceIds.add(sourceId);
  if (!["PAY", "REFUSE", "CACHE", "SKIP"].includes(decision.decision)) {
    fail(`source ${sourceId}: invalid decision ${decision.decision}`);
  }
  if (decision.decision === "PAY") paidMicros += usdcMicros(decision.price);
  if (!decision.title) fail(`source ${sourceId}: missing decision title`);
  if (!decision.creator) fail(`source ${sourceId}: missing decision creator`);
  if (!Number.isFinite(Number(decision.score))) fail(`source ${sourceId}: invalid score`);
}

assertEqual("latest spend", paidMicros.toString(), usdcMicros(latest.spent).toString());
if (usdcMicros(latest.spent) > usdcMicros(latest.budget)) fail("latest cycle spent more than budget");

const txLabels = new Set();
for (const item of latestTxs) {
  if (txLabels.has(item.label)) fail(`duplicate latest tx label ${item.label}`);
  txLabels.add(item.label);
  assertTx(`latest tx ${item.label}`, item.tx);
  const sourceId = item.label?.match(/source_(\d+)/)?.[1];
  if (sourceId && !decisionSourceIds.has(sourceId)) fail(`latest tx ${item.label} has no matching decision`);
}

["approve", "agentBond", "register", "pay", "refuse", "updateHash", "challenge"].forEach((key) => {
  assertTx(`spike ${key}`, spike.txs?.[key]);
});

assertEqual("spike remaining bond", usdcMicros(spike.remainingBond).toString(), (usdcMicros(spike.bond) - usdcMicros(spike.price)).toString());
assertEqual("spike final agent bond", usdcMicros(spike.finalAgentBond).toString(), (usdcMicros(spike.agentBond) - usdcMicros(spike.price)).toString());
assertEqual("spike source reputation after slash", String(spike.reputation), "-10");
assertEqual("spike agent reputation after slash", String(spike.agentReputation), "-10");

if (warnings.length) {
  console.log("Warnings:");
  warnings.forEach((message) => console.log(`- ${message}`));
}

if (errors.length) {
  console.error("Footnote live audit failed:");
  errors.forEach((message) => console.error(`- ${message}`));
  process.exit(1);
}

const paidCount = decisions.filter((decision) => decision.decision === "PAY").length;
console.log("Footnote live audit OK");
console.log(`- sources: ${sources.length} (${externalCount} external)`);
console.log(`- latest cycle: ${decisions.length} decisions, ${paidCount} paid, ${latest.spent} USDC spent`);
console.log(`- receipts: ${latestTxs.length} latest txs, objective challenge spike verified`);
