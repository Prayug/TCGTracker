# Vault — Page Overrides

**Overrides MASTER:** Portfolio dashboard (not a bare inventory table).

## Rules

- Answer worth / performance / attention in the first viewport
- Portfolio Value is the dominant KPI; supporting tiles for Cost, P/L, 30D (est.)
- Unset purchase price = 100% of market (flat P/L); soft “At market” label
- Holdings: thumb ~48px, condition badges, cost/market/P/L, sticky header
- Destructive Clear lives in overflow + type-CLEAR confirm
- Atmosphere: `PageShell` `subtle` — glow only under title/KPIs
- Density slightly higher than marketing pages
- Major $ values use tabular-nums (not mono); mono for # / dates / IDs
