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

| Role | Hex | CSS Variable |
|------|-----|--------------|
| Background | `#0C1118` | `--surface-base` / `--background` |
| Raised | `#141B26` | `--surface-raised` / `--card` |
| Overlay | `#1A2330` | `--surface-overlay` |
| Foreground | `#E8ECF2` | `--ink-primary` / `--foreground` |
| Muted | `#9AA6B8` | `--ink-secondary` / `--muted-foreground` |
| Accent / CTA | `#6EE7B7` | `--accent` / `--primary` |
| Foil | `#5BC4D4` | `--foil` |
| Gain | `#3D9B6E` | `--gain` |
| Loss | `#F07178` | `--loss` / `--destructive` |
| Border | `rgba(232,236,242,0.1)` | `--border-default` |

**Notes:** Soft mint CTA (not acid chartreuse). Teal foil for secondary. Brand wordmark uses ink-primary; accent reserved for CTAs and active states. No purple neon. No antique gold.

### Typography

- **Display:** Outfit
- **Body:** Jost
- **Mono:** JetBrains Mono

### Motion

- Hero stage: CSS 3D + rAF lerp (no WebGL on landing)
- Modal inspect: CSS 3D tilt preferred; R3F only for pack stage
- Respect `prefers-reduced-motion`

### Anti-Patterns

- Acid neon lime on pitch black
- Purple neon / cyber chrome
- Antique gold editorial palette
- Heavy continuous WebGL on the landing hero
- Flat single-color backgrounds
- Docs-style sidebar + article column
