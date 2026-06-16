# Footnote Markets

AI agents pay creators when they cite their work.

Footnote Markets is a bonded citation market for Lepton Agents: creators register priced sources, an AI buyer agent allocates a USDC budget across competing sources, pays the ones worth citing, refuses weak or overpriced sources, and leaves a receipt for every payment or refusal.

## Current Spike

This repository is in the first validation spike:

1. Register a creator source with an optional credibility bond.
2. Record a buyer agent PAY or REFUSE decision under a budget.
3. Settle a tiny USDC citation payment.
4. Trigger one objective challenge when a paid source hash changes.
5. Refund the buyer from the source bond and update reputation.

Subjective quality never auto-slashes. Stake moves only on mechanically checkable failures; judgment changes reputation.

## Arc Testnet Status

The first live spike passed on Arc testnet:

- Market: `0xe12bced9df4d1347a998499d1c2f559fa1594d21`
- Source registered with a `0.05` USDC bond.
- One paid citation settled for `0.003` USDC.
- One REFUSE receipt was recorded.
- One objective hash-change challenge refunded `0.003` USDC from the bond.
- Source reputation moved to `-10`; remaining bond is `0.047` USDC.

Full transaction record: `docs/live/spike-arc-testnet.json`.

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
