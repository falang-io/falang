# Two usable targets:
#   (default, last stage `dev`)  @falang/workflow-client's Vite dev server — what docker-compose.workflow*.yml use
#                                (the e2e stack relies on it for browser coverage via Vite source maps). Unchanged.
#   --target production          static `dist` served by unprivileged nginx with a Content-Security-Policy and the
#                                other security headers (security audit P1-6); see docker/client-nginx/ and the
#                                "Production client image" section of README.md.
FROM node:24-bookworm-slim AS deps

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

# ---- build the two-entry bundle (main app + /admin) ----
FROM deps AS build
COPY . .
WORKDIR /app/packages/workflow/client
# The API base URL is baked into the bundle: pass the public origin of the backend, e.g.
#   docker build --target production --build-arg VITE_BACKEND_URL=https://api.example.com -f docker/client.Dockerfile .
ARG VITE_BACKEND_URL=http://localhost:4000
ENV VITE_BACKEND_URL=$VITE_BACKEND_URL
RUN npx vite build

# ---- production: static files only, no node, no node_modules ----
FROM nginxinc/nginx-unprivileged:1.27-alpine AS production
COPY --from=build /app/packages/workflow/client/dist /usr/share/nginx/html
COPY docker/client-nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --chmod=755 docker/client-nginx/entrypoint.sh /csp-entrypoint.sh
# CSP_PRESETS: smartcaptcha | recaptcha (match the backend's CAPTCHA_PROVIDER); see docker/client-nginx/entrypoint.sh.
# API_ORIGIN is required at run time (same value as VITE_BACKEND_URL).
ENV CSP_PRESETS=""
EXPOSE 8080
ENTRYPOINT ["/csp-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]

# ---- dev (default target: it must stay the LAST stage) ----
FROM deps AS dev
COPY . .
WORKDIR /app/packages/workflow/client

EXPOSE 5175

CMD ["npm", "run", "dev", "--", "--host"]
