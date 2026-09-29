# Runs @falang/workflow-e2e-tests (Playwright, browser end-to-end tests) against the other
# services in docker-compose.workflow-e2e.yml. Based on node:24-bookworm-slim (matching
# backend.Dockerfile/client.Dockerfile) rather than Playwright's own image, so the Node version
# stays in lockstep with the rest of this repo (`engines.node: >=24`); Playwright's browser +
# system dependencies are installed explicitly instead.
FROM node:24-bookworm-slim

# Chromium + its system deps are installed BEFORE any package manifest is copied, so this
# ~150MB download is cached until the Playwright version itself changes — not on every
# package-lock.json edit (which is where it used to sit, right after `npm ci`). Playwright looks
# a browser up by its own version, so this must match `@playwright/test` in package-lock.json;
# the check after `npm ci` below fails the build loudly if the two drift apart.
ARG PLAYWRIGHT_VERSION=1.61.1
RUN npx --yes playwright@${PLAYWRIGHT_VERSION} install --with-deps chromium

WORKDIR /app

# Copy package manifests first so `npm ci` is cached as long as dependencies don't change.
COPY package.json package-lock.json ./
COPY packages/core/antd/package.json packages/core/antd/
COPY packages/core/di/package.json packages/core/di/
COPY packages/core/dto/package.json packages/core/dto/
COPY packages/core/scheme/package.json packages/core/scheme/
COPY packages/text/dto/package.json packages/text/dto/
COPY packages/text/scheme/package.json packages/text/scheme/
COPY packages/typescript/common/package.json packages/typescript/common/
COPY packages/typescript/dto/package.json packages/typescript/dto/
COPY packages/typescript/scheme/package.json packages/typescript/scheme/
COPY packages/workflow-integrations/common/package.json packages/workflow-integrations/common/
COPY packages/workflow-integrations/openai/package.json packages/workflow-integrations/openai/
COPY packages/workflow-integrations/telegram/package.json packages/workflow-integrations/telegram/
COPY packages/workflow/backend/package.json packages/workflow/backend/
COPY packages/workflow/client-admin/package.json packages/workflow/client-admin/
COPY packages/workflow/client/package.json packages/workflow/client/
COPY packages/workflow/compiler/package.json packages/workflow/compiler/
COPY packages/workflow/dto/package.json packages/workflow/dto/
COPY packages/workflow/e2e-tests/package.json packages/workflow/e2e-tests/
COPY packages/workflow/gateway/package.json packages/workflow/gateway/
COPY packages/workflow/mocks/package.json packages/workflow/mocks/
COPY packages/workflow/runner/package.json packages/workflow/runner/
COPY packages/workflow/scheme/package.json packages/workflow/scheme/
COPY playground/package.json playground/
COPY playground-workflow/package.json playground-workflow/
RUN npm ci

# The browser installed above is only usable by the exact Playwright version that downloaded it.
RUN installed="$(node -p "require('playwright-core/package.json').version")" \
  && test "$installed" = "${PLAYWRIGHT_VERSION}" \
  || { echo "PLAYWRIGHT_VERSION=${PLAYWRIGHT_VERSION} but package-lock.json has playwright-core $installed; update the ARG in docker/e2e-tests.Dockerfile" >&2; exit 1; }

COPY . .

WORKDIR /app/packages/workflow/e2e-tests

CMD ["npm", "test"]
