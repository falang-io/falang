# Runs @falang/workflow-mocks — a small Express app standing in for the Telegram/OpenAI HTTP APIs
# in docker-compose.workflow-e2e.yml, so integration e2e specs don't need real vendor credentials.
# No build step (matches every other `workflow/*` package — see ADR 0002 (private)).
FROM node:24-bookworm-slim

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
COPY packages/workflow/egress/package.json packages/workflow/egress/
COPY packages/workflow/gateway/package.json packages/workflow/gateway/
COPY packages/workflow/mocks/package.json packages/workflow/mocks/
COPY packages/workflow/runner/package.json packages/workflow/runner/
COPY packages/workflow/scheme/package.json packages/workflow/scheme/
COPY playground/package.json playground/
COPY playground-workflow/package.json playground-workflow/
RUN npm ci

COPY . .

WORKDIR /app/packages/workflow/mocks

EXPOSE 4100

CMD ["npm", "start"]
