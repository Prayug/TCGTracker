# Home — Page Overrides

**Overrides MASTER:** Immersive full-bleed hero; brand wordmark hero-level; no stat strips in first viewport; scroll-journey landing with a pinned WebGL world section below the hero.

## Rules

- First viewport: brand, one headline, one support line, CTA pair, CSS-3D card stage (no WebGL in the hero)
- No inset rounded hero media
- Scroll journey below hero: pinned WebGL world (drei ScrollControls, 4 crossfading chapters) → market chapter → vault bento (portfolio + movers + gateways) → rip/grading chapter → insights chapter → final CTA
- WebGL section lazy-loaded; Canvas mounts via IntersectionObserver and unmounts when leaving `/` or when off-screen; `prefers-reduced-motion` renders static fallback
- Below fold: asymmetric bento (portfolio + movers + gateways)
