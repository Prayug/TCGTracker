# Multi-stage build for frontend
FROM node:20-alpine AS frontend-builder

WORKDIR /app

ARG VITE_API_URL=
ARG VITE_SENTRY_DSN=
ARG VITE_SENTRY_ENVIRONMENT=production
ARG VITE_CARD_SCANNER_API_URL=
ARG VITE_ENABLE_AUTH=true
ARG VITE_ENABLE_ANALYTICS=
ARG VITE_GA_TRACKING_ID=

ENV VITE_API_URL=$VITE_API_URL
ENV VITE_SENTRY_DSN=$VITE_SENTRY_DSN
ENV VITE_SENTRY_ENVIRONMENT=$VITE_SENTRY_ENVIRONMENT
ENV VITE_CARD_SCANNER_API_URL=$VITE_CARD_SCANNER_API_URL
ENV VITE_ENABLE_AUTH=$VITE_ENABLE_AUTH
ENV VITE_ENABLE_ANALYTICS=$VITE_ENABLE_ANALYTICS
ENV VITE_GA_TRACKING_ID=$VITE_GA_TRACKING_ID
# Do not set NODE_ENV=production before npm ci — that omits devDependencies
# (vite, @types/node, etc.) while `tsc -b` still needs them for the build.

# Copy package manifests + local file: dependency before install
COPY package*.json ./
COPY packages/shared/package*.json ./packages/shared/
COPY packages/shared ./packages/shared
# Install full build toolchain (typescript, vite, @types/*), not production-only
RUN npm ci --include=dev --ignore-scripts

# Copy source code
COPY . .

# Build the application (Vite sets production mode via `vite build`)
RUN npm run build

# Production stage
FROM nginx:alpine AS frontend-production

# nginx:alpine already ships the nginx user/group — do not recreate them.

# Copy built assets from builder
COPY --from=frontend-builder /app/dist /usr/share/nginx/html

# Copy nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Set proper permissions
RUN chown -R nginx:nginx /usr/share/nginx/html && \
    chown -R nginx:nginx /var/cache/nginx && \
    chown -R nginx:nginx /var/log/nginx && \
    chown -R nginx:nginx /etc/nginx/conf.d && \
    touch /var/run/nginx.pid && \
    chown -R nginx:nginx /var/run/nginx.pid

USER nginx

EXPOSE 443

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:80/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
