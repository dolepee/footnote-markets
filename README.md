# Footnote Markets

AI agents pay creators when they cite their work.

Footnote Markets is a bonded citation market for Lepton Agents: creators register priced sources, an AI buyer agent allocates a USDC budget across competing sources, pays the ones worth citing, refuses weak or overpriced sources, and leaves a receipt for every payment or refusal.

Live product shell: https://footnote-markets.vercel.app

## Current Spike

This repository is in the first validation spike:

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

The first autonomous buyer-agent cycle also passed on Arc testnet:

- Query: `Why do nanopayments unlock creator markets for AI agents?`
- Budget: `0.05` USDC.
- Decision: PAY source `1`.
- Spend: `0.003` USDC.
- Pay tx: `0x1b16eef84f7c5add1a60dffc72f6c6bcc15a1df72b767af1ecb65da5eebc931e`.

Latest cycle record: `docs/live/latest-cycle.json`.

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
npm run source:register -- --issue <github-issue-number>
npm run agent:cycle -- --query "Why do nanopayments matter for creator publishing?" --budget 0.05
```

`source:register` and live `agent:cycle` require `ARC_RPC_URL`, `PRIVATE_KEY`, and the deployed market address via `FOOTNOTE_MARKET` or `docs/live/arc-testnet.json`. Use `agent:cycle -- --dry-run` to test decisions without sending transactions.

The GitHub Actions cycle is scheduled every 6 hours but runs with `--require-external`, so it skips until at least one external creator-source issue has been registered on Arc. Required repository secrets: `ARC_RPC_URL`, `ARC_USDC`, `PRIVATE_KEY`, `FOOTNOTE_MARKET`.
