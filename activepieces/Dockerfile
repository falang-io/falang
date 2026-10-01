# Standalone image for falang-workflow-activepieces — deliberately built from this folder alone
# (build context ./activepieces in docker-compose.workflow.yml), not the whole monorepo, since this
# service and its ActivePieces npm dependencies are intentionally outside the npm workspace — see
# ADR 0010 (private).
#
# Hardened (security audit P0-10): reproducible `npm ci`, non-root (uid/gid 1000, the base image's
# `node` user), code owned by root and read-only to the process. Runs with a read-only root
# filesystem: the ONLY writable path it needs is /tmp (tsx's transpile cache, HOME, os.tmpdir() used
# by pieces) — mount an emptyDir there.

FROM node:24-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .

ENV HOME=/tmp \
    TMPDIR=/tmp

USER 1000:1000

EXPOSE 4100

# Exec form on the local tsx binary (no `npm run`/`npx`/shell in between): SIGTERM must reach the Node
# process directly — see docs/decisions/0012 (private)'s note on `npm run start` swallowing signals.
CMD ["./node_modules/.bin/tsx", "src/main.ts"]
