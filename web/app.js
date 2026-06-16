const repoUrl = "https://github.com/dolepee/footnote-markets";
const intakeUrl = `${repoUrl}/issues/new?template=source.yml`;
const intakeApiUrl = "https://api.github.com/repos/dolepee/footnote-markets/issues?labels=creator-source&state=open&per_page=20";

const seedSources = [
  {
    id: "s1",
    creator: "Canteen research note",
    wallet: "0x26bA...63c5",
    url: "https://thecanteenapp.com",
    title: "Why nanopayments unlock creator markets",
    excerpt:
      "The fee floor forced subscriptions. Once the unit of value falls to fractions of a cent, single citations, listens, and calls become sellable.",
    price: 0.003,
    bond: 0.05,
    reputation: 92,
    sourceType: "seed",
    tags: ["nanopayments", "creators", "Arc"],
  },
  {
    id: "s2",
    creator: "Open-source publisher",
    wallet: "0x7A3F...AcD",
    url: "https://github.com/DIYgod/RSSHub",
    title: "RSS feeds as attribution rails for AI agents",
    excerpt:
      "RSS already carries canonical links and author identity. A payment layer can turn each grounded answer into a tiny creator payout.",
    price: 0.006,
    bond: 0.02,
    reputation: 74,
    sourceType: "seed",
    tags: ["RSS", "x402", "AI"],
  },
  {
    id: "s3",
    creator: "Creator economy analyst",
    wallet: "0xBDb1...1Fb8",
    url: "https://thecanteenapp.com",
    title: "Why subscriptions are a payment-floor workaround",
    excerpt:
      "Subscriptions bundle tiny events into a larger bill because legacy rails cannot settle the native event economically.",
    price: 0.018,
    bond: 0,
    reputation: 41,
    sourceType: "seed",
    tags: ["subscriptions", "pricing"],
  },
  {
    id: "s4",
    creator: "Arc builder",
    wallet: "0xFF3B...82D2",
    url: "https://docs.arc.network",
    title: "USDC gas and sub-second settlement for agents",
    excerpt:
      "Arc gives agents predictable USDC-denominated settlement. That matters when the agent makes hundreds of small economic decisions.",
    price: 0.004,
    bond: 0.04,
    reputation: 85,
    sourceType: "seed",
    tags: ["USDC", "agents", "settlement"],
  },
];

const loadLocalSources = () => {
  try {
    return JSON.parse(localStorage.getItem("footnote-local-sources") || "[]");
  } catch {
    return [];
  }
};

let sources = [...loadLocalSources(), ...seedSources];

const live = {
  chainId: 5042002,
  price: 0.003,
  bond: 0.05,
  remainingBond: 0.047,
  txs: {
    register: "0xe688faa49d6a91a6d04813c24cca86ee97e33565a6df964a5605d8f8443a73a9",
    pay: "0x305b6b541236a579a7bd8fc208694a51e64e2f4c8df2c4095ef2a392872cc09c",
    refuse: "0xd6a42ceab00abdeb22f93fc2da63c718e24120de755c99081381cd9d1b25268a",
    challenge: "0x325830899d1076800c18846153403ab4faa9263bd7d93c5355c51485ae2a7eef",
  },
};

let latestCycle = null;

const usd = (value) => `$${Number(value).toFixed(value < 0.01 ? 4 : 2)}`;
const arcscan = (tx) => `https://testnet.arcscan.app/tx/${tx}`;
const xIntent = (text, url) =>
  `https://x.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
const safeUrl = (value) => {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
};

const sourceTypeLabel = (source) => {
  if (source.sourceType === "external") return "external";
  if (source.sourceType === "local-preview") return "preview";
  return "seed";
};

const receiptBadge = (label) => {
  if (label.includes("pay") || label.includes("approve")) return "pay";
  if (label.includes("skip")) return "skip";
  if (label.includes("challenge") || label.includes("slash")) return "challenge";
  return "refuse";
};

function parseIssueField(body, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = body.match(new RegExp(`### ${escaped}\\s+([\\s\\S]*?)(?=\\n### |$)`, "i"));
  return match ? match[1].trim().replace(/^_No response_$/i, "") : "";
}

function issueToSource(issue) {
  const body = issue.body || "";
  const creator = parseIssueField(body, "Creator name") || issue.user?.login || "Creator";
  const title = issue.title.replace(/^Creator source:\s*/i, "").trim() || "Submitted creator source";
  const url = safeUrl(parseIssueField(body, "Source URL"));
  const wallet = parseIssueField(body, "Arc-compatible payout wallet") || "pending wallet";
  const price = Number(parseIssueField(body, "Requested price per citation") || 0.004);
  const bond = Number(parseIssueField(body, "Optional credibility bond") || 0);
  const summary = parseIssueField(body, "Why should agents cite it?") || "Creator-submitted source in public intake.";

  return {
    id: `issue-${issue.number}`,
    creator,
    wallet,
    url,
    title,
    excerpt: summary,
    price: Number.isFinite(price) ? price : 0.004,
    bond: Number.isFinite(bond) ? bond : 0,
    reputation: bond > 0 ? 58 : 50,
    tags: ["public intake", "creator-source"],
    sourceType: "external",
    issueUrl: issue.html_url,
  };
}

function runBuyerAgent(query, budget) {
  const tokens = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  let spent = 0;

  return sources
    .map((source) => {
      const haystack = `${source.title} ${source.excerpt} ${source.tags.join(" ")}`.toLowerCase();
      const matches = tokens.filter((token) => token.length > 3 && haystack.includes(token)).length;
      const relevance = Math.min(100, matches * 18 + (haystack.includes("nanopayment") ? 12 : 0));
      const bondBoost = source.bond > 0 ? Math.min(18, source.bond * 220) : 0;
      const pricePenalty = source.price * 1000;
      const reputationBoost = source.reputation / 10;
      const score = Math.round(relevance + bondBoost + reputationBoost - pricePenalty);

      let decision = "SKIP";
      let reason = "Low relevance for this query.";

      if (score >= 44 && spent + source.price <= budget) {
        decision = "PAY";
        spent += source.price;
        reason = source.bond > 0 ? "Relevant, bonded, and inside budget." : "Relevant and inside budget.";
      } else if (score >= 28) {
        decision = "REFUSE";
        reason = spent + source.price > budget ? "Would exceed the research budget." : "Useful but overpriced for its trust score.";
      }

      return { source, decision, reason, score };
    })
    .sort((a, b) => b.score - a.score);
}

function renderSources() {
  const target = document.querySelector("#source-list");
  target.innerHTML = sources
    .map(
      (source) => `
      <article class="source-card">
        <span class="label">${escapeHtml(source.creator)}</span>
        <h3>${escapeHtml(source.title)}</h3>
        <p>${escapeHtml(source.excerpt)}</p>
        <div class="source-meta">
          <span class="chip">${usd(source.price)} / citation</span>
          <span class="chip">${sourceTypeLabel(source)}</span>
          <span class="chip">${source.bond > 0 ? `${usd(source.bond)} bond` : "unbonded"}</span>
          <span class="chip">rep ${source.reputation}</span>
          ${safeUrl(source.url) ? `<a class="chip" href="${safeUrl(source.url)}" target="_blank" rel="noreferrer">source</a>` : ""}
          ${safeUrl(source.issueUrl) ? `<a class="chip" href="${safeUrl(source.issueUrl)}" target="_blank" rel="noreferrer">intake</a>` : ""}
        </div>
      </article>
    `,
    )
    .join("");
}

function renderReceipts() {
  const receipts = [
    { title: "Source bond registered", tx: live.txs.register, body: "0.05 USDC bond locked", badge: "pay" },
    { title: "Citation paid", tx: live.txs.pay, body: `${usd(live.price)} sent to creator`, badge: "pay" },
    { title: "Competitor refused", tx: live.txs.refuse, body: "Overpriced for lower relevance", badge: "refuse" },
    {
      title: "Objective challenge",
      tx: live.txs.challenge,
      body: `${usd(live.bond - live.remainingBond)} refunded from bond`,
      badge: "challenge",
    },
  ];

  if (latestCycle?.txs?.length) {
    const cycleBody = `${latestCycle.decisions?.length || 0} decision${
      latestCycle.decisions?.length === 1 ? "" : "s"
    }, ${usd(latestCycle.spent)} spent from a ${usd(latestCycle.budget)} budget`;
    latestCycle.txs.forEach(({ label, tx }) => {
      receipts.unshift({
        title: `Latest agent cycle: ${label.replaceAll("_", " ")}`,
        tx,
        body: cycleBody,
        badge: receiptBadge(label),
      });
    });
  }

  document.querySelector("#receipt-list").innerHTML = receipts
    .map(({ title, tx, body, badge }) => {
      return `
        <article class="receipt-card">
          <span class="badge ${badge}">${badge}</span>
          <h3>${escapeHtml(title)}</h3>
          <p>${escapeHtml(body)}</p>
          <div class="receipt-meta">
            <a class="chip mono" href="${arcscan(tx)}" target="_blank" rel="noreferrer">${tx.slice(0, 12)}...</a>
            <a class="chip" href="${xIntent(`Footnote Markets receipt: ${title}. ${body}.`, arcscan(tx))}" target="_blank" rel="noreferrer">share</a>
            <span class="chip">Arc chain ${live.chainId}</span>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderAgent() {
  const query = document.querySelector("#query").value;
  const budget = Number(document.querySelector("#budget").value);
  document.querySelector("#budget-label").textContent = usd(budget);
  const decisions = runBuyerAgent(query, budget);
  const paid = decisions.filter((decision) => decision.decision === "PAY");
  const refused = decisions.filter((decision) => decision.decision === "REFUSE");
  const spent = paid.reduce((sum, decision) => sum + decision.source.price, 0);

  document.querySelector("#paid-count").textContent = paid.length;
  document.querySelector("#refused-count").textContent = refused.length;
  document.querySelector("#spent-total").textContent = usd(spent);
  document.querySelector("#decisions").innerHTML = decisions
    .map(
      (decision) => `
      <div class="timeline-item">
        <span class="badge ${decision.decision.toLowerCase()}">${decision.decision}</span>
        <span>
          <strong>${escapeHtml(decision.source.title)}</strong><br />
          <small>${escapeHtml(decision.reason)} Score ${decision.score}. Price ${usd(decision.source.price)}.</small>
        </span>
        <span class="mono">${decision.source.bond > 0 ? "bonded" : "unbonded"}</span>
      </div>
    `,
    )
    .join("");

  document.querySelector("#answer").textContent =
    "Nanopayments matter because they make the native unit of research sellable: a single citation. Legacy rails pushed creators into subscriptions because the per-event value was too small to settle. On Arc, an agent can allocate a USDC budget across sources, pay the trustworthy ones, refuse weak or overpriced sources, and leave receipts for both outcomes.";

  document.querySelector("#answer-footnotes").innerHTML = [
    ...paid.map((decision) => `<span class="chip">paid footnote: ${escapeHtml(decision.source.creator)}</span>`),
    ...refused.map((decision) => `<span class="chip">refused: ${escapeHtml(decision.source.creator)}</span>`),
  ].join("");
}

async function loadPublicIntakeSources() {
  const status = document.querySelector("#source-status");
  try {
    const response = await fetch(intakeApiUrl, { headers: { Accept: "application/vnd.github+json" } });
    if (!response.ok) return;
    const issues = await response.json();
    const issueSources = issues.filter((issue) => !issue.pull_request).map(issueToSource);
    if (issueSources.length === 0) return;
    const existing = new Set(sources.map((source) => source.id));
    sources = [...issueSources.filter((source) => !existing.has(source.id)), ...sources];
    status.textContent = `${issueSources.length} public creator source${issueSources.length === 1 ? "" : "s"} loaded from GitHub intake.`;
    renderSources();
    renderAgent();
  } catch {
    status.textContent = "Public intake is still open; GitHub source sync is temporarily unavailable.";
  }
}

async function loadLatestCycle() {
  try {
    const response = await fetch("./data/latest-cycle.json");
    if (!response.ok) return;
    latestCycle = await response.json();
    renderReceipts();
  } catch {
    latestCycle = null;
  }
}

document.querySelector("#ask-form").addEventListener("submit", (event) => {
  event.preventDefault();
  renderAgent();
});

document.querySelector("#budget").addEventListener("input", renderAgent);

document.querySelector("#source-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const creator = document.querySelector("#creator").value.trim();
  const title = document.querySelector("#title").value.trim();
  const url = document.querySelector("#source-url").value.trim();
  const wallet = document.querySelector("#wallet").value.trim();
  if (!creator || !title) return;
  const source = {
    id: `local-${Date.now()}`,
    creator,
    wallet: wallet || "pending wallet",
    url,
    title,
    excerpt: "Creator-submitted source pending content hash and Arc bond.",
    price: Number(document.querySelector("#price").value || 0.004),
    bond: Number(document.querySelector("#bond").value || 0),
    reputation: 50,
    sourceType: "local-preview",
    tags: ["submitted", "pending"],
  };
  sources.unshift(source);
  const localSources = sources.filter((item) => item.id.startsWith("local-"));
  localStorage.setItem("footnote-local-sources", JSON.stringify(localSources));
  event.target.reset();
  document.querySelector("#price").value = "0.004";
  document.querySelector("#bond").value = "0.01";
  document.querySelector("#source-status").textContent =
    "Source preview added locally. Submit it on GitHub so it can enter the public intake queue.";
  renderSources();
  renderAgent();
});

document.querySelector("#copy-source-packet").addEventListener("click", async () => {
  const creator = document.querySelector("#creator").value.trim() || "[creator]";
  const title = document.querySelector("#title").value.trim() || "[source title]";
  const url = document.querySelector("#source-url").value.trim() || "[source url]";
  const wallet = document.querySelector("#wallet").value.trim() || "[wallet]";
  const price = document.querySelector("#price").value.trim() || "0.004";
  const bond = document.querySelector("#bond").value.trim() || "0.01";
  const packet = `Creator: ${creator}
Source: ${title}
URL: ${url}
Payout wallet: ${wallet}
Requested price per citation: ${price} USDC
Optional credibility bond: ${bond} USDC
Why agents should cite it: [one or two sentences]`;

  try {
    await navigator.clipboard.writeText(packet);
    document.querySelector("#source-status").textContent =
      "Intake packet copied. Paste it into the GitHub source intake issue.";
  } catch {
    document.querySelector("#source-status").textContent = packet;
  }
});

document.querySelector("#submit-source-link").setAttribute("href", intakeUrl);

renderSources();
renderReceipts();
renderAgent();
loadPublicIntakeSources();
loadLatestCycle();
