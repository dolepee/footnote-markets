# Footnote Markets Spike

Goal: prove the locked first-place mechanic before building the full app.

## Success Criteria

- A tiny USDC citation payment can settle.
- A source can carry a credibility bond.
- A buyer agent can record PAY and REFUSE decisions.
- Objective failure can trigger buyer refund from the source bond.
- Source reputation moves visibly.

## Objective-Only Slashing

V1 slashes only for mechanically checkable failures:

- source hash changed after payment
- paid source unavailable
- creator misrepresented ownership
- citation does not match the registered source

Subjective quality does not auto-slash. It can lower reputation or trigger review, but the stake moves only on facts.

