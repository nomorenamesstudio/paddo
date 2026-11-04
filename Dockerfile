# syntax=docker/dockerfile:1

# One Node process serves the built PWA, the JSON API, the MCP endpoint and the
# Yjs websocket, so the runtime image is a single service with no database.
# Multi-arch: builds on x86 and on the ARM Pi with no changes (esbuild and pnpm
# fetch their own platform binaries in the build stage only).

FROM node:22-alpine AS base
# Pin pnpm to the version that wrote the lockfile: corepack would resolve "latest",
# and a different pnpm reads a different lockfile format.
RUN npm install -g pnpm@11.24.0
WORKDIR /app
# Non-interactive: `pnpm install` must never wait on a prompt in a build.
ENV CI=true

FROM base AS deps
# .npmrc is deliberately left out — it points the store at a path inside the repo
# for this machine's file sandbox, which has no business inside an image.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Where the app is mounted. '/' for a container you open on its own port; '/paddo/'
# when a proxy serves it under a subpath (tailscale serve --set-path, most reverse
# proxies). Baked in at build time, because every asset URL in the bundle carries it.
ARG PADDO_BASE_PATH=/
ENV PADDO_BASE_PATH=$PADDO_BASE_PATH
# Two bundles: the web app into dist/web, and the server into one file in
# dist/server. Both tools are called directly instead of through a pnpm script:
# pnpm's verify-deps-before-run would otherwise fire an implicit `pnpm install`
# in a non-TTY build and fail on its store.
RUN ./node_modules/.bin/vite build \
 && node tools/build-server.mjs

# A second install, production-only: the build stage's node_modules carries vite,
# playwright and the rest of the toolchain, none of which the server imports.
FROM base AS prod-deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod

FROM node:22-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app
# Both directories are written at runtime. Compose mounts something durable over
# them; the image keeps them owned by `node` so a container started without mounts
# still works instead of failing on EACCES.
ENV PADDO_CONTENT_DIR=/data/content \
    PADDO_SIDECAR_DIR=/data/state
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/package.json ./package.json
RUN mkdir -p /data/content /data/state && chown -R node:node /data
# Never root: the process reads the writer's prose and writes markdown files.
USER node
EXPOSE 4319
# /healthz is deliberately unauthenticated so the probe needs no secret. It answers
# when the HTTP server is accepting, which is all a restart policy should act on.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PADDO_PORT||4319)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Plain node on the prebuilt bundle: no tsx, no TypeScript, no package manager at
# runtime. SIGTERM is handled by the server itself (app.close() on the signal).
CMD ["node", "dist/server/main.js"]
