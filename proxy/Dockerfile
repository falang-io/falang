# Standalone image for falang-proxy — built from this folder alone (not the monorepo).
FROM node:24-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ENV NODE_ENV=production
USER node
EXPOSE 8080

# exec form, no npm/shell wrapper: SIGTERM must reach node directly.
CMD ["node_modules/.bin/tsx", "src/main.ts"]
