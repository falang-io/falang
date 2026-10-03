# The ffmpeg job service (ADR 0041 (private)): a separate service/image
# from `runner` on purpose — ffmpeg (a large native binary with a long CVE history for malformed
# inputs) never runs inside a tenant's own runner pod, which is the untrusted-input blast radius
# `0016`'s hardening is built around. One shared image, one ffmpeg process per job (§1), never
# baked with per-project data — every input/output is fetched from/pushed to `backend`'s internal
# file API at job time (see `src/jobs/files-client.ts`).

FROM node:24-bookworm-slim

# The distro build, pinned by this base image's own digest — not a static ffmpeg download from a
# third-party site (see the ADR's "Rejected" list, (c)). `-y --no-install-recommends` keeps the
# image from also pulling in every codec-adjacent recommended package apt would otherwise suggest.
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package manifests first so `npm ci` is cached as long as dependencies don't change — the
# same curated cross-package list `docker/runner.Dockerfile` copies (this service pulls in no
# `@falang/*` package itself, but `npm ci` still needs every workspace's own `package.json` present
# to resolve correctly against the single repo-wide `package-lock.json`), plus this package's own.
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
COPY packages/workflow-integrations/openai/package.json packages/workflow-integrations/openai/
COPY packages/workflow-integrations/telegram/package.json packages/workflow-integrations/telegram/
COPY packages/workflow/backend/package.json packages/workflow/backend/
COPY packages/workflow/client-admin/package.json packages/workflow/client-admin/
COPY packages/workflow/client/package.json packages/workflow/client/
COPY packages/workflow/compiler/package.json packages/workflow/compiler/
COPY packages/workflow/dto/package.json packages/workflow/dto/
COPY packages/workflow/e2e-tests/package.json packages/workflow/e2e-tests/
COPY packages/workflow/egress/package.json packages/workflow/egress/
COPY packages/workflow/gateway/package.json packages/workflow/gateway/
COPY packages/workflow/media/package.json packages/workflow/media/
COPY packages/workflow/runner/package.json packages/workflow/runner/
COPY packages/workflow/scheme/package.json packages/workflow/scheme/
COPY playground/package.json playground/
COPY playground-workflow/package.json playground-workflow/
RUN npm ci

COPY . .

WORKDIR /app/packages/workflow/media

# Same posture as `docker/runner.Dockerfile`'s own `USER node`: matches the Deployment's
# `securityContext.runAsUser`/`runAsNonRoot`, and keeps a plain `docker run` of this image non-root
# too. `node:*` images ship a `node` user at uid 1000.
USER node

# Not `npx tsx` (or a shell-form `CMD` without `exec`): both interpose a wrapper process between
# the container's PID 1 and the actual Node process, and neither forwards `SIGTERM` to it — the
# same gotcha ADR 0012/0016 (private) already found and fixed for `backend`'s `npm run start` and
# `runner`'s own `CMD`. Without a real `SIGTERM` reaching `main.ts` directly, a running job's
# ffmpeg child would be orphaned instead of killed on pod termination (see `main.ts`'s shutdown
# handler).
CMD ["sh", "-c", "exec ../../../node_modules/.bin/tsx src/main.ts"]
