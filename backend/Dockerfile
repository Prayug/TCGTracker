# Build from repository root:
#   docker build -f backend/Dockerfile -t tcgtracker-backend .
#
# Context must include `backend/` and `packages/shared/` so
# `file:../packages/shared` and `npm run build --prefix ../packages/shared` resolve.

FROM node:20-alpine AS builder

WORKDIR /app

# Install shared first (needs its own devDeps for `tsc`)
COPY packages/shared/package.json packages/shared/package-lock.json ./packages/shared/
WORKDIR /app/packages/shared
RUN npm ci

# Install backend (links file:../packages/shared)
WORKDIR /app
COPY backend/package.json backend/package-lock.json ./backend/
WORKDIR /app/backend
RUN npm ci

# Copy sources and compile shared + backend
WORKDIR /app
COPY packages/shared ./packages/shared
COPY backend ./backend

WORKDIR /app/backend
RUN npm run build

# ---------------------------------------------------------------------------
FROM node:20-alpine AS production

WORKDIR /app

# Runtime layout mirrors the monorepo so file:../packages/shared still resolves
COPY packages/shared/package.json ./packages/shared/
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist

COPY backend/package.json backend/package-lock.json ./backend/
WORKDIR /app/backend
RUN npm ci --omit=dev

COPY --from=builder /app/backend/dist ./dist

RUN mkdir -p /app/data

ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

CMD ["node", "dist/index.js"]
