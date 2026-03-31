# ── Stage 1: Install dependencies ────────────────────────────────────────────
FROM node:22-alpine AS deps

# Patch Alpine OS-level vulnerabilities (zlib, busybox, etc.)
RUN apk upgrade --no-cache

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

# Copy workspace manifests — only what's needed to resolve the dep graph
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/web/package.json ./apps/web/
COPY apps/admin/package.json ./apps/admin/
COPY packages/shared-types/package.json ./packages/shared-types/

# Install all workspace deps (including optional native binaries for linux/arm64)
RUN pnpm install --frozen-lockfile

# ── Stage 2: Build ───────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

# Patch Alpine OS-level vulnerabilities
RUN apk upgrade --no-cache

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

# Bring in installed node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/admin/node_modules ./apps/admin/node_modules
COPY --from=deps /app/packages/shared-types/node_modules ./packages/shared-types/node_modules

# Copy full source
COPY . .

# Build-time env vars
ARG NEXT_PUBLIC_API_URL=http://localhost:8000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

# Disable Next.js telemetry in CI/build
ENV NEXT_TELEMETRY_DISABLED=1

RUN pnpm --filter admin build

# ── Stage 3: Production runtime ───────────────────────────────────────────────
# Runner only carries the standalone output — no dev deps, no build tools
FROM node:22-alpine AS runner

# Patch Alpine OS-level vulnerabilities in the final image
RUN apk upgrade --no-cache

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3001

# Non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy standalone output (includes its own node_modules subset)
COPY --from=builder --chown=nextjs:nodejs /app/apps/admin/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/admin/.next/static ./apps/admin/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/admin/public ./apps/admin/public

USER nextjs

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3001 || exit 1

CMD ["node", "apps/admin/server.js"]
