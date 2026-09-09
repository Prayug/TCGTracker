# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Two primary audiences, often the same person on different days:

- **Investors** watching raw and slab prices, spreads, movers, and whether a card is worth buying, holding, or selling.
- **Collectors who sell** — people who already own cards and need to list, grade, price, and move them.

They open TCGTracker for price clarity, selling decisions, and a portfolio view of collection value over time — not for a single isolated job.

## Product Purpose

TCGTracker is a full-stack Pokemon and One Piece TCG workstation: browse 50k+ cards, log a vault, watch prices, run AI market insights, and photograph cards to identify and grade them.

Success is walking away knowing **what a card is worth, what to do with it, and what the collection is doing** — prices, selling decisions, and portfolio in one place.

## Positioning

One place that connects catalog, live market, personal inventory, and photo-based condition into a decision — not a disconnected price lookup, scanner, or slab tracker.

## Operating Context

Used at a desk or on a phone, often with the physical card in hand. Typical rituals: browse and filter listings, check graded vs raw spreads, log purchases in the vault, photograph a card to identify or grade it, then decide how to list it or whether a PSA submission is worth the fee.

Games switch in-app between **Pokemon** and **One Piece**. Dark and light themes. Command palette (`Ctrl/Cmd+K`). JWT auth.

Phone capture via QR-linked sessions is a real part of scanner and grading workflows: the card is often photographed on a phone even when the session started on desktop.

## Capabilities and Constraints

Confirmed in the product today:

- Collection: browse, binders, vault (purchases, P/L), wishlist, trade, set completion.
- Market: price tracker, alerts, AI insights, slabs, investments, deals.
- Tools: simulated pack shop, card scanner (camera / upload / phone), AI grading (front + back photos, sub-scores, history, vault handoff).
- Games: Pokemon and One Piece via an in-app switcher.

**Grading's job (confirmed):** return a predicted PSA number the user can treat as close to a real grade, from ordinary front + back photos — not a six-angle lighting protocol. Precision Scan is retired as a product path; it added a choice that made the tool harder to start.

**Honest limit:** this is still a photo estimate, not a PSA/TAG slab. Copy may be confident about the number without claiming the result replaces a professional grade or a controlled rig.

**Undecided:** accessibility standard beyond existing eslint-plugin-jsx-a11y; whether grading should ever claim a single exact PSA integer vs a tight range.

## Brand Commitments

- Name: **TCGTracker**.
- Scope: Pokemon and One Piece TCG only.
- Voice: direct, collector-literate, decision-oriented. Prefer “what to do next” over hype. Do not invent professional-lab authority the photos cannot support.
- Live demo: https://tcgtracker-pearl.vercel.app

## Evidence on Hand

- README feature list, live demo, and screenshots under `docs/assets/`.
- Working grading flow: capture → estimate → history → vault / submission queue.
- Do not fabricate testimonials, customer counts, grade accuracy rates, or PSA partnerships.

## Product Principles

1. **One decision, not a menu of tools.** If a fork does not change the outcome, do not ask the user to pick it.
2. **Price and condition belong together.** A grade without a market implication is unfinished.
3. **The number has to feel real.** Grading succeeds when the PSA estimate is the thing they came for — clear, prominent, and honest about being an estimate.
4. **Physical card in hand.** Capture must work from a phone as easily as a webcam or an upload.
5. **Preserve what they already own.** Vault, history, identity, and market context stay attached to a scan; do not make them start over.
