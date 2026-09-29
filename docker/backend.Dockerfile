# Builds @falang/workflow-backend. Runs from the full monorepo (no per-package build step; see
# ADR 0002 (private)) since `backend` itself and the `runner` process
# it spawns via `tsx` both execute TypeScript straight from source through npm workspace symlinks.

# `backend` shells out to the `temporal` CLI itself (not just the separate `temporal-admin-tools`
# compose service) to manage Worker Deployment versions — see
# ADR 0004 (private). Pinned to the same CLI build already used by
# `temporal-admin-tools` in docker-compose.workflow*.yml.
FROM temporalio/admin-tools:1.29.1-tctl-1.18.4-cli-1.5.0 AS temporal-cli

FROM node:24-bookworm-slim

WORKDIR /app

# Copy package manifests first so `npm ci` is cached as long as dependencies don't change.
COPY package.json package-lock.json ./
COPY packages/core/antd/package.json packages/core/antd/
COPY packages/core/debug/package.json packages/core/debug/
COPY packages/core/di/package.json packages/core/di/
COPY packages/core/dto/package.json packages/core/dto/
COPY packages/core/mcp/package.json packages/core/mcp/
COPY packages/core/scheme/package.json packages/core/scheme/
COPY packages/simple-code/dto/package.json packages/simple-code/dto/
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

COPY --from=temporal-cli /usr/local/bin/temporal /usr/local/bin/temporal

COPY . .

WORKDIR /app/packages/workflow/backend

EXPOSE 4000

CMD ["npm", "run", "start"]
