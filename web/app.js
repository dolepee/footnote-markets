const sources = [
  {
    id: "s1",
    creator: "Canteen research note",
    wallet: "0x26bA...63c5",
    title: "Why nanopayments unlock creator markets",
    excerpt:
      "The fee floor forced subscriptions. Once the unit of value falls to fractions of a cent, single citations, listens, and calls become sellable.",
    price: 0.003,
    bond: 0.05,
    reputation: 92,
    tags: ["nanopayments", "creators", "Arc"],
  },
  {
    id: "s2",
    creator: "Open-source publisher",
    wallet: "0x7A3F...AcD",
    title: "RSS feeds as attribution rails for AI agents",
    excerpt:
      "RSS already carries canonical links and author identity. A payment layer can turn each grounded answer into a tiny creator payout.",
    price: 0.006,
    bond: 0.02,
    reputation: 74,
    tags: ["RSS", "x402", "AI"],
  },
  {
    id: "s3",
    creator: "Creator economy analyst",
    wallet: "0xBDb1...1Fb8",
    title: "Why subscriptions are a payment-floor workaround",
    excerpt:
      "Subscriptions bundle tiny events into a larger bill because legacy rails cannot settle the native event economically.",
    price: 0.018,
    bond: 0,
    reputation: 41,
    tags: ["subscriptions", "pricing"],
  },
  {
    id: "s4",
    creator: "Arc builder",
    wallet: "0xFF3B...82D2",
    title: "USDC gas and sub-second settlement for agents",
    excerpt:
      "Arc gives agents predictable USDC-denominated settlement. That matters when the agent makes hundreds of small economic decisions.",
    price: 0.004,
    bond: 0.04,
    reputation: 85,
    tags: ["USDC", "agents", "settlement"],
  },
];

const live = {
  chainId: 5042002,
  price: 0.003,
  bond: 0.05,
  remainingBond: 0.047,
  txs: {
    register: "0xa6c07171e79292a6bfecca876bdff2ac6b936e09d59dd958ea4e1768596a49f1",
    pay: "0xf4f8f9fb122a88981a7a74a07480c1138993150dce34ebcce657d06912547bd9",
    refuse: "0x2af0942ceb5b0333019353473121f1749e6ef05869ca8af404866e822070a8b3",
    challenge: "0x078b8b8ce02c1d2f620c45f1ae48bf898e03f6eb9b1fae5269fba41ec08b0246",
  },
};

const usd = (value) => `$${Number(value).toFixed(value < 0.01 ? 4 : 2)}`;
const arcscan = (tx) => `https://testnet.arcscan.app/tx/${tx}`;

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
        <span class="label">${source.creator}</span>
        <h3>${source.title}</h3>
        <p>${source.excerpt}</p>
        <div class="source-meta">
          <span class="chip">${usd(source.price)} / citation</span>
          <span class="chip">${source.bond > 0 ? `${usd(source.bond)} bond` : "unbonded"}</span>
          <span class="chip">rep ${source.reputation}</span>
        </div>
      </article>
    `,
    )
    .join("");
}

function renderReceipts() {
  const receipts = [
    ["Source bond registered", "register", "0.05 USDC bond locked", "pay"],
    ["Citation paid", "pay", `${usd(live.price)} sent to creator`, "pay"],
    ["Competitor refused", "refuse", "Overpriced for lower relevance", "refuse"],
    ["Objective challenge", "challenge", `${usd(live.bond - live.remainingBond)} refunded from bond`, "challenge"],
  ];
  document.querySelector("#receipt-list").innerHTML = receipts
    .map(([title, key, body, badge]) => {
      const tx = live.txs[key];
      return `
        <article class="receipt-card">
          <span class="badge ${badge}">${badge}</span>
          <h3>${title}</h3>
          <p>${body}</p>
          <div class="receipt-meta">
            <a class="chip mono" href="${arcscan(tx)}" target="_blank" rel="noreferrer">${tx.slice(0, 12)}...</a>
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
          <strong>${decision.source.title}</strong><br />
          <small>${decision.reason} Score ${decision.score}. Price ${usd(decision.source.price)}.</small>
        </span>
        <span class="mono">${decision.source.bond > 0 ? "bonded" : "unbonded"}</span>
      </div>
    `,
    )
    .join("");

  document.querySelector("#answer").textContent =
    "Nanopayments matter because they make the native unit of research sellable: a single citation. Legacy rails pushed creators into subscriptions because the per-event value was too small to settle. On Arc, an agent can allocate a USDC budget across sources, pay the trustworthy ones, refuse weak or overpriced sources, and leave receipts for both outcomes.";

  document.querySelector("#answer-footnotes").innerHTML = [
    ...paid.map((decision) => `<span class="chip">paid footnote: ${decision.source.creator}</span>`),
    ...refused.map((decision) => `<span class="chip">refused: ${decision.source.creator}</span>`),
  ].join("");
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
  if (!creator || !title) return;
  sources.unshift({
    id: `local-${Date.now()}`,
    creator,
    wallet: "pending wallet",
    title,
    excerpt: "Creator-submitted source pending content hash and Arc bond.",
    price: Number(document.querySelector("#price").value || 0.004),
    bond: Number(document.querySelector("#bond").value || 0),
    reputation: 50,
    tags: ["submitted", "pending"],
  });
  event.target.reset();
  document.querySelector("#price").value = "0.004";
  document.querySelector("#bond").value = "0.01";
  renderSources();
  renderAgent();
});

renderSources();
renderReceipts();
renderAgent();

