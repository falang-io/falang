# Falang

[![License: AGPL-3.0-only](https://img.shields.io/badge/license-AGPL--3.0--only-blue.svg)](LICENSE)

Falang is a visual programming environment: programs are drawn as flowcharts in a diagram language
inherited from [DRAKON](https://drakon.su/) (skewers, branches, loops, icons) instead of being typed as
text. Expression fields inside the diagram are real TypeScript, edited in Monaco. This monorepo contains
three products built on one editor runtime:

- **Workflow** (`packages/workflow`) - an n8n-like workflow engine. Diagrams compile to
  [Temporal](https://temporal.io) workflows that run in isolated Kubernetes pods. It has integrations
  (Telegram, OpenAI, databases, files, schedules, human tasks, ActivePieces pieces, ...), an LLM agent that
  edits diagrams, a version history and an MCP server.
- **app-sketch** (`packages/desktop/app-sketch`) - an offline desktop IDE (Electron) for text, logic and
  simple-code projects. Logic projects compile to C++, Go, Rust, C# and TypeScript.
- **app-arduino** (`packages/desktop/app-arduino`) - an Arduino sketch IDE (Electron): pin and device driver
  icons, compilation to a `.ino` sketch, upload and a visual debugger via `arduino-cli`.

Documentation: <https://docs.falang.io> (English), <https://docs.falang.ru> (Russian).

## Self-host the workflow product

Prerequisites: Docker, [kind](https://kind.sigs.k8s.io/), Node >= 24 (only needed for the npm scripts).

```sh
./scripts/kind-dev-setup.sh                            # local kind cluster for runner pods (idempotent)
docker compose -f docker-compose.workflow.yml up --build -d   # same as: npm run start-workflow
```

Open <http://localhost:5175> and sign in as `admin` / `admin` (seeded on first boot; change the password
right away). The Temporal UI is on <http://localhost:8080>. Secrets have dev-only defaults; to override them
put a `.env` file next to the compose file (see the header of `docker-compose.workflow.yml`).

Self-service signup is controlled by `SELF_SERVICE_SIGNUP`. The backend defaults to `false` (administrators
create users on the admin page, `/admin`); the bundled dev compose file turns it on for convenience - set it
to `false` for anything reachable from the internet, and set `SEED_DEFAULT_ADMIN=false` too (the backend itself defaults to `false`; with `NODE_ENV=production` it also refuses to start with missing/dev/short `JWT_SECRET`, `DB_PASSWORD` or `CREDENTIALS_ENCRYPTION_KEY`). The full guide
is in the docs (Workflow / Local setup).

## Desktop apps

```sh
npm ci
npm run dev -w @falang/desktop-app-sketch
npm run dev -w @falang/desktop-app-arduino     # needs arduino-cli installed on the host
```

## Development

Node >= 24, npm workspaces monorepo, TypeScript.

```sh
npm ci                # install
npm test              # unit tests (Vitest, all packages)
npx oxlint            # lint
npm run check         # type-check every package
npm run format        # Prettier
npm run test-e2e      # end-to-end suite; heavy, needs Docker + kind
```

See [CONTRIBUTING.md](CONTRIBUTING.md), and [AGENTS.md](AGENTS.md) / [CLAUDE.md](CLAUDE.md) for coding
agents (repository layout, conventions, per-package notes).

## Claude Code plugin and MCP

`plugins/falang` is a Claude Code plugin with skills that teach an agent the Falang document model and an
MCP config for the workflow product's `/mcp` endpoint; the desktop apps write a per-project stdio MCP config
into every project folder. See [plugins/falang/README.md](plugins/falang/README.md).

## Downstream consumers

Packages can be published as TypeScript sources to a local Verdaccio registry for private extensions - see
[scripts/README-registry.md](scripts/README-registry.md).

## License

[AGPL-3.0-only](LICENSE). Contributions require signing a Contributor License Agreement (link TBD, see
[CONTRIBUTING.md](CONTRIBUTING.md)).
