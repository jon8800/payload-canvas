# syntax=docker/dockerfile:1
#
# Production image for the starter app. The build context is the REPOSITORY ROOT, because the app
# uses the workspace package in packages/payload-canvas:
#
#   docker build -f apps/starter/Dockerfile -t payload-starter \
#     --build-arg DATABASE_URL=postgresql://postgres:postgres@host.docker.internal:5432/payload_starter \
#     --build-arg PAYLOAD_SECRET=build-only .
#
# `next build` prerenders pages, and the pages read from the database. So the build needs a
# reachable database that already has the schema (run the migrations first; see the README,
# section "Docker"). The runtime reads PAYLOAD_SECRET and DATABASE_URL from the environment.
# The build-time values stay in the build stage; the final image does not contain them.

ARG NODE_VERSION=24-alpine

# ---------------------------------------------------------------------------------------------
FROM node:${NODE_VERSION} AS base
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN apk add --no-cache libc6-compat && corepack enable
WORKDIR /repo

# ---------------------------------------------------------------------------------------------
# Workspace install plus sources. The `migrate` service in docker-compose.yml runs from this stage.
FROM base AS source

# Manifests first, so the install layer is cached until a dependency changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/starter/package.json apps/starter/
COPY packages/payload-canvas/package.json packages/payload-canvas/
COPY packages/create-payload-starter/package.json packages/create-payload-starter/
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter . --filter payload-starter...

# Sources. The app compiles the payload-canvas package from source (transpilePackages).
COPY packages/payload-canvas packages/payload-canvas
COPY apps/starter apps/starter
WORKDIR /repo/apps/starter

# ---------------------------------------------------------------------------------------------
FROM source AS build
ARG DATABASE_URL
ARG PAYLOAD_SECRET
ARG NEXT_PUBLIC_SERVER_URL=http://localhost:3000
ENV NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production \
    DATABASE_URL=$DATABASE_URL \
    PAYLOAD_SECRET=$PAYLOAD_SECRET \
    NEXT_PUBLIC_SERVER_URL=$NEXT_PUBLIC_SERVER_URL

RUN pnpm build

# ---------------------------------------------------------------------------------------------
FROM node:${NODE_VERSION} AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

# Standalone output of a monorepo app keeps the repository layout: the server lives in
# apps/starter/server.js, next to the traced node_modules and the builder package sources.
# It also holds the files listed in outputFileTracingIncludes (the Tailwind CSS entry and
# Tailwind's stylesheets), which the builder reads at runtime to compile CSS on save.
COPY --from=build --chown=nextjs:nodejs /repo/apps/starter/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /repo/apps/starter/.next/static ./apps/starter/.next/static
COPY --from=build --chown=nextjs:nodejs /repo/apps/starter/public ./apps/starter/public

# Uploaded media. Mount a volume here so uploads survive a new container.
RUN mkdir -p /app/apps/starter/public/media && chown -R nextjs:nodejs /app/apps/starter/public/media
VOLUME ["/app/apps/starter/public/media"]

USER nextjs
# The builder resolves the CSS entry relative to the working directory.
WORKDIR /app/apps/starter
EXPOSE 3000

# Required at runtime: DATABASE_URL, PAYLOAD_SECRET. Optional: NEXT_PUBLIC_SERVER_URL, PREVIEW_SECRET, SMTP_*.
CMD ["node", "server.js"]
