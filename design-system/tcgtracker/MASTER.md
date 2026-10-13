# Design System Master File

> **LOGIC:** When building a specific page, first check `design-system/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file.
> If not, strictly follow the rules below.

---

**Project:** TCGTracker  
**Style:** Chromatic Vault (refined)  
**Category:** Immersive collector / market dashboard

---

## Global Rules

### Color Palette

| Role         | Hex                     | CSS Variable                             |
| ------------ | ----------------------- | ---------------------------------------- |
| Background   | `#0C1118`               | `--surface-base` / `--background`        |
| Raised       | `#141B26`               | `--surface-raised` / `--card`            |
| Overlay      | `#1A2330`               | `--surface-overlay`                      |
| Foreground   | `#E8ECF2`               | `--ink-primary` / `--foreground`         |
| Muted        | `#9AA6B8`               | `--ink-secondary` / `--muted-foreground` |
| Accent / CTA | `#6EE7B7`               | `--accent` / `--primary`                 |
| Foil         | `#5BC4D4`               | `--foil`                                 |
| Gain         | `#3D9B6E`               | `--gain`                                 |
| Loss         | `#F07178`               | `--loss` / `--destructive`               |
| Border       | `rgba(232,236,242,0.1)` | `--border-default`                       |

**Notes:** Soft mint CTA (not acid chartreuse). Teal foil for secondary. Brand wordmark uses ink-primary; accent reserved for CTAs and active states. No purple neon. No antique gold.

### Typography

- **Display + body:** Geist Variable (`ss01`, slight negative tracking)
- **Mono / numbers:** Geist Mono with `tabular-nums`
- Scale stays small: page titles are `text-h1` (~28px), body 13–14px, labels 11–12px. Avoid uppercase tracking except page eyebrows.

### Motion

- Hero stage: CSS 3D + rAF lerp (no WebGL on landing)
- Modal inspect: CSS 3D tilt preferred; R3F only for pack stage
- Respect `prefers-reduced-motion`
- Easing: `ease-out` = `cubic-bezier(0.23,1,0.32,1)` for enter/press; `ease-in-out` for on-screen movement. Exposed as Tailwind `ease-out`, `ease-in-out`, `ease-drawer`.
- UI transitions stay under 300ms; buttons and chips press to `scale(0.97)`.
- Popovers scale from 0.96 with `transform-origin` at their trigger; never animate from `scale(0)`.
- Selected state in tab rows, the sidebar nav and the game switcher uses a shared `layoutId` indicator.
- No hover lift on cards; borders brighten instead. Frequent actions (typing, filtering, tab switches) get no decorative animation.
- Errors are quiet: `InlineNotice` (a red dot on a neutral surface), never full red slabs.

### Anti-Patterns

- Acid neon lime on pitch black
- Purple neon / cyber chrome
- Antique gold editorial palette
- Heavy continuous WebGL on the landing hero
- Flat single-color backgrounds
- Docs-style sidebar + article column
