# The Collector's Exchange — design system and product structure

This document is the source of truth for the TCGTracker interface. It replaces the
"collectibles terminal" navy-and-mint system. Code lives in `src/index.css` (tokens),
`tailwind.config.js` (scale), `src/app/navigation.ts` (IA) and `src/components/exchange/`
(primitives).

## 1. Audit summary (what was wrong, with references)

| Problem                                                                                | Where                                                                                                                          | Decision                                                                          |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| 19 flat sidebar links in four arbitrary groups; Settings mixed into Tools              | `components/layout/Sidebar.tsx`                                                                                                | Five job-based areas, contextual section tabs, settings in account menu           |
| Every route wrapped in a scale/fade page transition plus a second fade in `PageShell`  | `App.tsx` `pageVariants`, `PageShell.tsx`                                                                                      | Removed. Navigation is immediate                                                  |
| Home is a marketing hero with floating 3D cards and a pill launcher                    | `components/landing/HomeHero.tsx`, `QuickActions.tsx`                                                                          | Replaced by the Collector Command Center                                          |
| Card research lives in a 1,000-line modal with five tabs                               | `features/market/components/InvestmentModal.tsx`                                                                               | Dedicated route `/card/:id`; the modal is retired                                 |
| Headline price and buy-analysis price can describe different finishes                  | `InvestmentModal` uses the selected finish's TCGplayer series, `BuyThesisPanel` asks the backend for the card's default series | Each figure carries its basis; the page warns when the two disagree               |
| Unknown purchase price silently replaced by market price at save time, so P/L reads $0 | `utils/vaultCost.ts` `resolvePurchasePrice`, `vaultService.addToVault`                                                         | Unknown cost is stored as unknown; P/L only over known cost basis; coverage shown |
| Portfolio "history" chart interpolated linearly from cost to market                    | `features/vault/utils/portfolioSeries.ts` `buildValueSeries`                                                                   | Not shown. Allocation and concentration figures instead                           |
| Tokens named `neon-*`, `glow-*`, gradient text, ambient radial glows                   | `index.css`, `tailwind.config.js`                                                                                              | Replaced with archival paper / graphite system; glow tokens neutralised           |
| Radius 16px on nearly everything                                                       | `--radius: 1rem`, `rounded-2xl` everywhere                                                                                     | Radius scale compressed globally (cards 6–10px, controls 6px)                     |

## 2. Visual principles

1. **Frame the artwork.** Card art is the colour. Chrome stays paper, ink and graphite.
2. **Numbers are typography.** Prices use IBM Plex Mono with tabular figures, always with a basis line.
3. **Rules before boxes.** Separate with hairlines, alignment and background bands. A box needs a reason.
4. **One accent per job.** Cobalt = interaction and selection. Gold = premium/graded/owned. Teal and vermilion = movement only, always with a sign.
5. **Honest states.** Unavailable is a designed state, not a zero.
6. **Playful only where it is play.** Pack opening gets motion and foil; everything else is still.

## 3. Tokens

| Token               | Light           | Dark               | Use                    |
| ------------------- | --------------- | ------------------ | ---------------------- |
| `--surface-base`    | `#F5F2EA` paper | `#171D21` graphite | canvas                 |
| `--surface-raised`  | `#FFFEFB` ivory | `#1E262A`          | sheets, tables         |
| `--surface-inset`   | `#ECE7DB`       | `#12171A`          | wells, inputs          |
| `--surface-overlay` | `#FFFEFB`       | `#242C30` carbon   | popovers, dialogs      |
| `--ink-primary`     | `#20272B`       | `#ECE9E1`          | text                   |
| `--ink-secondary`   | `#4E575C`       | `#A9AFA9`          | supporting             |
| `--ink-muted`       | `#6E7579`       | `#80878A`          | metadata (AA on base)  |
| `--accent` (cobalt) | `#3559B7`       | `#8EA8F0`          | interaction            |
| `--gold`            | `#946C2C`       | `#D2AE6D`          | owned, graded, premium |
| `--gain`            | `#167F73`       | `#4FBFA9`          | up                     |
| `--loss`            | `#C04C36`       | `#EE8670`          | down                   |
| `--warn`            | `#9A6A10`       | `#E0B354`          | stale, low confidence  |

Legacy names (`neon-*`, `foil`, `glow-*`) remain as aliases so untouched screens inherit the
new palette; new code must use the semantic names above.

## 4. Typography

| Role                                                      | Face                   | Size / line  | Class                                 |
| --------------------------------------------------------- | ---------------------- | ------------ | ------------------------------------- |
| Display (rare: home greeting, card name on research page) | Newsreader 500         | 34–44 / 1.1  | `font-display text-display`           |
| Page title                                                | Newsreader 500         | 26–30 / 1.15 | `text-h1`                             |
| Section heading                                           | Plex Sans 600          | 17 / 1.3     | `text-h2`                             |
| Sub-heading                                               | Plex Sans 600          | 14 / 1.4     | `text-h3`                             |
| Body                                                      | Plex Sans 400          | 14 / 1.5     | default                               |
| Metadata                                                  | Plex Sans 400          | 12.5 / 1.4   | `text-meta`                           |
| Price, %, grade, set number                               | Plex Mono 500, tabular | context      | `font-mono tabular-nums` or `<Price>` |

No uppercase eyebrows; the only uppercase is set codes and grader names that are uppercase by nature.

## 5. Spacing, density, shape

- 4px base. Page gutter 16 / 24 / 32. Section gap 40 desktop, 28 mobile.
- Three densities: **catalog** (24px gaps, big art), **ledger** (40px rows, hairlines), **research** (two columns, 12-col grid).
- Radius: controls 6px, sheets 8–10px, card art 4.5% of width (real card corner), pills only for filter tokens.
- Max text measure 68ch. Data pages use the full width up to 1680px.

## 6. Information architecture

```
Home ............ Command Center (signed-in with holdings) / interactive lookup (new visitor)
Discover ........ Catalog /browse · Sets /sets · Deals /deals
Collection ...... Vault /vault · Binders /binders · Wishlist /wishlist
Market .......... Overview /money-flow · Slabs /prices · Insights /market-insights · Investments /investments
Tools ........... Trade /trade · Scan /scanner · Grade /grading · Pack shop /packs · OP boosters /open
Card research ... /card/:id (deep link, back returns to origin with scroll restored)
Account ......... Settings /settings via account menu
```

## 7. Shell

```
Desktop ≥ 1024                                   Mobile < 768
┌────┬──────────────────────────────────────┐    ┌──────────────────────────┐
│ ▣  │ Collection  Vault Binders Wishlist │⌘K│ ●│    │ ▣ Collection     ⌕  ◐  ● │
│ ⌂  ├──────────────────────────────────────┤    │ Vault Binders Wishlist → │
│ ◎  │                                      │    ├──────────────────────────┤
│ ▤  │            page content              │    │                          │
│ ↗  │                                      │    │                          │
│ ⚒  │                                      │    ├──────────────────────────┤
│    │                                      │    │ ⌂   ◎   ▤   ↗   ⚒        │
│ ◐ ⚙│                                      │    └──────────────────────────┘
└────┴──────────────────────────────────────┘
72px rail, labelled icons; header carries area name, section tabs,
search, game switch, alerts, account.
```

## 8. Page compositions

**Home (holdings).** Row 1: valuation block (value, known-basis P/L, coverage) | allocation figure | alerts & actions. Row 2: Collector briefing — a ruled list of real events (wishlist hits, biggest holdings, missing cost basis, grading candidates, recent activity). Row 3: market snapshot with art-led movers.

**Home (new visitor).** Live lookup: type a card name, see real results and jump straight into the research page. No slogans.

**Catalog.** Compact header (title, search, count, language, sort, grid/list). Quick filter row. Collapsible filter rail. Collector grid (art first, mono price + basis) or Research list (dense table).

**Card research.** Left: art viewer, identity, ownership. Right: quote block with basis and sources, finish selector, actions. Below: Market history · Grading economics (interactive calculator) · Recent sales · Investment research · Details as anchored sections, not tabs.

**Vault.** Ledger header with value, known-basis P/L, coverage bar. Modes: Portfolio (table), Gallery (showcase), Sets (completion). Allocation figures replace the synthetic chart.

**Market.** Breadth strip, era matrix, rotation bars, distribution — each with units, source and an explanation.

## 9. Component inventory (`src/components/exchange/`)

`AppRail`, `AppHeader`, `SectionTabs`, `MobileNav`, `PageHeader`, `Price`, `Delta`, `Basis` (provenance line),
`CardArt` (art with honest fallback), `CardIdentity`, `Ledger` (table primitives), `Figure` (chart container
with title/unit/source/summary), `Unavailable`, `Segmented`, `BreadthStrip`, `AllocationBars`, `BrandMark`.
