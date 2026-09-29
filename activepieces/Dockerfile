# Standalone image for falang-workflow-activepieces — deliberately built from this folder alone
# (build context ./activepieces in docker-compose.workflow.yml), not the whole monorepo, since this
# service and its ActivePieces npm dependencies are intentionally outside the npm workspace — see
# ADR 0010 (private).

FROM node:24-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY . .

EXPOSE 4100

CMD ["npm", "run", "start"]
