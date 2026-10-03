# Runs @falang/workflow-client's Vite dev server. No production build step for the MVP — this
# mirrors how `playground`/`playground-workflow` are run locally (`npm run dev -w <pkg>`).
FROM node:24-bookworm-slim

WORKDIR /app

# Copy package manifests first so `npm ci` is cached as long as dependencies don't change.
COPY package.json package-lock.json ./
COPY packages/simple-code/dto/package.json packages/simple-code/dto/
COPY packages/core/antd/package.json packages/core/antd/
COPY packages/core/di/package.json packages/core/di/
COPY packages/core/dto/package.json packages/core/dto/
COPY packages/core/mcp/package.json packages/core/mcp/
COPY packages/core/scheme/package.json packages/core/scheme/
COPY packages/core/versioning/package.json packages/core/versioning/
COPY packages/text/dto/package.json packages/text/dto/
COPY packages/text/scheme/package.json packages/text/scheme/
COPY packages/typescript/common/package.json packages/typescript/common/
COPY packages/typescript/dto/package.json packages/typescript/dto/
COPY packages/typescript/scheme/package.json packages/typescript/scheme/
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
COPY packages/workflow/egress/package.json packages/workflow/egress/
COPY packages/workflow/runner/package.json packages/workflow/runner/
COPY packages/workflow/scheme/package.json packages/workflow/scheme/
COPY playground/package.json playground/
COPY playground-workflow/package.json playground-workflow/
RUN npm ci

COPY . .

WORKDIR /app/packages/workflow/client

EXPOSE 5175

CMD ["npm", "run", "dev", "--", "--host"]
