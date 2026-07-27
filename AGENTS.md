# AGENTS.md

## Cursor Cloud specific instructions

This repo is the **Pokemon TCG Investment Tracker**, a full-stack app. Standard commands live in
`README.md`, root `package.json`, and `backend/package.json`; prefer those. The notes below are the
non-obvious things needed to run and develop it in a Cursor Cloud VM.

### Services

| Service | Location | Dev command | Port | Notes |
| --- | --- | --- | --- | --- |
| Frontend (React + Vite) | repo root | `npm run dev` | 5173 | Proxies `/api/*` to the backend via `VITE_API_URL` (see `vite.config.ts`). |
| Backend (Node + Express + SQLite) | `backend/` | `npm run dev` | 3001 | Auto-creates a local SQLite DB on first boot. Requires `backend/.env` (see below). |
| Card Scanner (Python Flask) | `card-scanner-backend/` | `python app.py` | 5001 | OPTIONAL. Needs `pokemon-card-recognizer` + a large reference DB build (~30-60 min, requires a Pokemon TCG API key). Not required for normal frontend/backend dev; the Scan page just shows "warming up" without it. |

`npm run dev:full` (root) runs frontend + backend together via `concurrently`.

### Required env files (gitignored, must be created)

- `backend/.env` is **required** — the backend hard-exits on boot if `JWT_SECRET` is missing or under 32 chars.
  Copy `backend/.env.example` to `backend/.env` and set `JWT_SECRET` to a 32+ char value
  (e.g. `openssl rand -hex 32`). No external API keys are needed for core dev.
- Root `.env` is optional; without it the frontend proxies to `http://localhost:3001` (the local backend).
  Set `VITE_API_URL=http://localhost:3001` to be explicit.

### Backend fresh-DB startup gotcha (IMPORTANT)

On a brand-new SQLite DB the backend **crashes during migrations** with `SQLITE_ERROR`
(`Running migration 14: add_backtest_metrics_columns` → "Failed to start server"). Root cause:
`backend/src/db/database.ts` already creates the `backtest_runs` columns that migrations 14 and 15
try to `ADD COLUMN`, and those two migrations (unlike 17/18) do not tolerate the duplicate-column error.

Workaround (does not modify source; run once per fresh DB):

```bash
cd backend
npm run dev            # creates tcg-prices.db, runs migrations 1-13, then crashes at 14 — stop it (Ctrl-C)
python3 -c "import sqlite3; c=sqlite3.connect('tcg-prices.db'); c.executemany('INSERT OR IGNORE INTO migrations(id,name) VALUES(?,?)', [(14,'add_backtest_metrics_columns'),(15,'add_backtest_market_distribution_columns')]); c.commit()"
npm run dev            # now boots cleanly (migrations 16-18 tolerate duplicate columns)
```

After this, `GET http://localhost:3001/health` returns `{"status":"healthy",...}`.

### Data expectations with an empty DB

The local price DB starts empty, but the backend proxies live card data from the Pokemon TCG API,
so **card search and market pulse show real cards/prices**. Vault "cost basis" and card counts work,
but **"current value" / price-history charts are $0.00 / empty** because those come from the local
price DB (populated by the daily sync cron or a cloud DB restore). This is expected in a fresh dev env,
not a bug. The app runs in guest/local mode by default (auth UI hidden), though the auth API
(`POST /api/auth/register`, `/api/auth/login`) is fully functional.

### Lint / test / build status (pre-existing)

- Frontend `npm run type-check`, `npm run test:run` (vitest), and `npm run build` all pass.
- Frontend `npm run lint` currently **fails** with many pre-existing errors — largely from committed
  generated files in `.vite/deps/*` (not ignored by `eslint.config.js`) plus real `src/` errors. Tooling works; the codebase has lint debt.
- Backend `npm test` (jest) has 4 pre-existing failing suites because those test files import from
  `vitest` (they pass under the root vitest runner, which also collects `backend/**`). Jest-style suites pass. `npm run build` (tsc) passes.
- Backend `npm run lint` fails because it invokes `eslint --ext` (removed in the resolved ESLint flat-config); pre-existing.

Do not treat the above pre-existing failures as regressions from environment setup.
