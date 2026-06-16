# Footnote Markets

![CI](https://github.com/dolepee/footnote-markets/actions/workflows/ci.yml/badge.svg)

AI agents pay creators when they cite their work.

Footnote Markets is a bonded citation market for Lepton Agents: creators register priced sources, an AI buyer agent allocates a USDC budget across competing sources, pays the ones worth citing, refuses weak or overpriced sources, and leaves a receipt for every payment or refusal.

Live product: https://footnote-markets.vercel.app

## Judge Path

1. Open the live product and run the buyer agent.
2. Watch the agent allocate a small USDC budget across competing sources: PAY, SKIP, or REFUSE.
3. Open receipts to verify the Arc market, citation payment, refusal, and objective slash/refund trail.

## Lepton Fit

- **Agentic sophistication:** the buyer agent decides which creator sources deserve payment under a budget, using relevance, price, bond, and reputation.
- **Traction path:** creator intake issues become approved Arc-registered sources, then scheduled buyer-agent cycles can pay them automatically.
- **Circle/Arc usage:** USDC is the settlement asset, Arc is the market chain, and sub-cent citation payments are the product action.
- **Innovation:** creators can optionally bond their source quality; objective failures slash stake, while subjective disagreement only affects reputation.

## What Is Live

The current Arc testnet build supports:

1. Register a creator source with an optional credibility bond.
2. Require an authorized, bonded buyer agent before it can record PAY or REFUSE decisions.
3. Settle a tiny USDC citation payment.
4. Trigger one V1 objective challenge when a paid source hash changes after citation.
5. Refund the buyer from the source bond, slash the buyer agent's bond, and update source + agent reputation.

Subjective quality never auto-slashes. V1 stake movement is limited to the mechanically checkable hash-change failure; broader objective failures can be added later with explicit attestations.

## Arc Testnet Status

The first live spike passed on Arc testnet:

- Market: `0x2a2cf1c9028cd4bc6afaa0b9d8401c40b4050e5e`
- Source registered with a `0.05` USDC bond.
- One paid citation settled for `0.003` USDC.
- One REFUSE receipt was recorded.
- One objective hash-change challenge refunded `0.003` USDC from the bond.
- Source reputation moved to `-10`; remaining bond is `0.047` USDC.
- Current contract version requires a bonded authorized agent for PAY/REFUSE and reduces both source and agent reputation when a paid citation is objectively slashed.

Full transaction record: `docs/live/spike-arc-testnet.json`.

The autonomous buyer-agent cycle also passed on Arc testnet with multiple competing sources:

- Query: `Why do nanopayments unlock creator markets, and why do RSS feeds matter for AI agents?`
- Budget: `0.009` USDC.
- Decisions: PAY sources `1` and `2`, SKIP source `3`, REFUSE source `4`.
- Spend: `0.009` USDC.
- Pay txs: `0x77e5394afab7b777243e7e48d1dbdf5ae72c3e7d13cf904c7b4c586258caf782`, `0xe813b07e714d40c8ecbfda069bbd025cb40a6b1f9f85b4d42173acf40b714494`.

Latest cycle record: `docs/live/latest-cycle.json`.

## What We Do Not Claim

- Seed sources are demo supply, not external creator traction.
- V1 auto-slashing is limited to objective hash-change failure.
- Subjective source quality is not treated as slashable truth; it can only affect reputation and future decisions.

## Structure

- `contracts/`: Foundry contracts for bonded source registration, citation payment, objective challenge, refunds, and reputation.
- `web/`: dependency-free static product shell for the buyer-agent market, source registry, and receipt ledger.
- `docs/`: implementation notes and live deployment records.

## Local Contract Test

```bash
cd contracts
forge test
```

## Local Web

```bash
npm run web:dev
```

Then open `http://localhost:4173`.

## Operator Loop

```bash
npm run intake:fetch
npm run intake:review
npm run source:seed
npm run source:register -- --creator Test --url https://example.com --wallet 0x0000000000000000000000000000000000000001 --price 0.001 --title Test --dry-run
npm run source:register -- --issue <github-issue-number>
npm run source:approved -- --dry-run
npm run source:approved
npm run agent:cycle -- --query "Why do nanopayments matter for creator publishing?" --budget 0.05
npm run web:sync
npm run live:audit
```

`source:seed` registers clearly labeled seed sources for demo competition; it is not counted as external traction. `intake:review` validates open creator-source issues and prints the exact next action for each issue before anything touches Arc. New creator-source issues are also validated automatically by GitHub Actions, which comments formatting errors or maintainer next steps. `source:register -- --dry-run` validates a manual source without chain credentials. `source:approved -- --dry-run` previews approved GitHub intake issues, and `source:approved` registers only open `creator-source` issues that also carry the `approved-source` label. Batch approval defaults to `--max-bond 0` because the current operator-run flow funds source bonds from the registering wallet; pass `--max-bond <amount>` only when that bond funding is intentional. `web:sync` mirrors live source and cycle records into `web/data` so the public app can load the latest registry. `live:audit` checks web/data sync, source references, tx hashes, spend-vs-budget, and the objective challenge spike. `source:register`, `source:approved`, and live `agent:cycle` require `ARC_RPC_URL`, `PRIVATE_KEY`, and the deployed market address via `FOOTNOTE_MARKET` or `docs/live/arc-testnet.json`. Use `agent:cycle -- --dry-run` to test decisions without sending transactions.

The GitHub Actions cycle is scheduled every 6 hours but runs with `--require-external`, so it skips until at least one external creator-source issue has been registered on Arc. Required repository secrets: `ARC_RPC_URL`, `ARC_USDC`, `PRIVATE_KEY`, `FOOTNOTE_MARKET`.
