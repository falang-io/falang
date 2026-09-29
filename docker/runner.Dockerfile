# One shared image for every project/version's runner pod — see
# ADR 0016 (private)'s "Artifact delivery into the runner pod": the
# artifact (compiled workflow bundle + activities source) is fetched over HTTP at pod start and
# loaded entirely in memory, never baked into or written onto this image, so the same image serves
# every tenant. Runs from the full monorepo (no per-package build step; see
# ADR 0002 (private)) since `@falang/workflow-runner` executes
# TypeScript straight from source through npm workspace symlinks, via `tsx`.

FROM node:24-bookworm-slim

WORKDIR /app

# Copy package manifests first so `npm ci` is cached as long as dependencies don't change. The
# full workspace list (not just `runner`'s own deps) is required for `npm ci` to resolve correctly
# against the single repo-wide `package-lock.json` — same reasoning as `docker/backend.Dockerfile`.
COPY package.json package-lock.json ./
COPY packages/core/antd/package.json packages/core/antd/
COPY packages/core/debug/package.json packages/core/debug/
COPY packages/core/di/package.json packages/core/di/
COPY packages/core/dto/package.json packages/core/dto/
COPY packages/core/scheme/package.json packages/core/scheme/
COPY packages/core/versioning/package.json packages/core/versioning/
COPY packages/text/dto/package.json packages/text/dto/
COPY packages/text/scheme/package.json packages/text/scheme/
COPY packages/typescript/common/package.json packages/typescript/common/
COPY packages/typescript/dto/package.json packages/typescript/dto/
COPY packages/typescript/scheme/package.json packages/typescript/scheme/
COPY packages/workflow-integrations/activepieces/package.json packages/workflow-integrations/activepieces/
COPY packages/workflow-integrations/common/package.json packages/workflow-integrations/common/
COPY packages/workflow-integrations/files/package.json packages/workflow-integrations/files/
COPY packages/workflow-integrations/media/package.json packages/workflow-integrations/media/
COPY packages/workflow-integrations/mysql/package.json packages/workflow-integrations/mysql/
COPY packages/workflow-integrations/openai/package.json packages/workflow-integrations/openai/
COPY packages/workflow-integrations/postgres/package.json packages/workflow-integrations/postgres/
COPY packages/workflow-integrations/schedule/package.json packages/workflow-integrations/schedule/
COPY packages/workflow-integrations/sql-common/package.json packages/workflow-integrations/sql-common/
COPY packages/workflow-integrations/sqlite/package.json packages/workflow-integrations/sqlite/
COPY packages/workflow-integrations/tasks/package.json packages/workflow-integrations/tasks/
COPY packages/workflow-integrations/telegram/package.json packages/workflow-integrations/telegram/
COPY packages/workflow/backend/package.json packages/workflow/backend/
COPY packages/workflow/client-admin/package.json packages/workflow/client-admin/
COPY packages/workflow/client/package.json packages/workflow/client/
COPY packages/workflow/compiler/package.json packages/workflow/compiler/
COPY packages/workflow/dto/package.json packages/workflow/dto/
COPY packages/workflow/e2e-tests/package.json packages/workflow/e2e-tests/
COPY packages/workflow/gateway/package.json packages/workflow/gateway/
COPY packages/workflow/runner/package.json packages/workflow/runner/
COPY packages/workflow/scheme/package.json packages/workflow/scheme/
COPY playground/package.json playground/
COPY playground-workflow/package.json playground-workflow/
RUN npm ci

COPY . .

WORKDIR /app/packages/workflow/runner

# Matches the Pod spec's `securityContext.runAsUser: 1000` (`RunnerProcessManager`) — `node:*`
# images ship a `node` user at uid 1000, so this is redundant under that Pod spec but keeps a plain
# `docker run` of this image non-root too.
USER node

# Not `npx tsx` (or a shell-form `CMD`): both interpose a wrapper process between the container's
# PID 1 and the actual Node process running `main.ts`, and neither forwards `SIGTERM` to it — the
# same bug ADR 0012 (private) already found and fixed for
# `backend`/`npm run start`, hit again here (confirmed live: a pod sent `SIGTERM` on `kubectl
# delete deployment` logged `npm error signal SIGTERM` and exited without `main.ts`'s own handler
# ever running — see ADR 0016 (private)'s "Runner-pod coverage
# collection" implementation notes). `main.ts`'s `SIGTERM` handler (coverage flush-and-push, and
# more generally k8s's own graceful-shutdown signal on every pod deletion, not just
# coverage-instrumented ones) needs to reach the real Node process directly — `sh -c 'exec ...'`
# replaces the shell with it instead of forking, so the process the container is signaled *is* it.
CMD ["sh", "-c", "exec ../../../node_modules/.bin/tsx src/main.ts"]
