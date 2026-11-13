# AGENTS.md

This file provides guidance to coding agents working in this repository.

This is the **community edition** of Falang (AGPL-3.0-only, see `LICENSE`; contributions need a CLA, see
`CONTRIBUTING.md`). Design discussions happen in GitHub Issues/Discussions. Pointers of the form `ADR 00xx (private)`
refer to the maintainers' private architecture decision records — the rule or reason itself is always stated in place,
the pointer only says where the longer history lives.

## Repository overview

npm workspaces monorepo. Node `>=24`, TypeScript 6, `"type": "commonjs"` throughout (except `playground`, which is
`"type": "module"`). Packages publish directly from `src/index.ts`; no build step is needed to consume them in-repo.

The detailed, versioned agent memory lives under `.kimi-code/memory/`. Read the files relevant to the area you are
changing rather than loading the whole directory.

## Memory map

- [Workspace and repository layout](.kimi-code/memory/workspace.md) — repository layout and package-domain overview.
- [Core packages](.kimi-code/memory/packages-core.md) — agent, DI, DTO, MCP, scheme, versioning, and antd.
- [Text and TypeScript packages](.kimi-code/memory/packages-text-typescript.md) — text and TypeScript domains.
- [Workflow runtime packages](.kimi-code/memory/packages-workflow-runtime.md) — DTO, scheme, compiler, backend, runner,
  gateway, integrations, local mode, and mocks.
- [Workflow client packages](.kimi-code/memory/packages-workflow-client.md) — client-common, client-admin, and client.
- [Logic and desktop packages](.kimi-code/memory/packages-logic-desktop.md) — logic constructor, Electron apps, Arduino,
  project filesystem, MCP, and desktop agent hosts.
- [Other packages and applications](.kimi-code/memory/packages-other.md) — simple-code, standalone services, playground,
  and public sites.
- [Commands and verification](.kimi-code/memory/commands.md) — unit/e2e/coverage commands, release commands, and the
  required verification policy.
- [Conventions](.kimi-code/memory/conventions.md) — licensing, imports, decorators, linting, and formatting.
- [Architecture](.kimi-code/memory/architecture.md) — node model, DI, editor runtime, modules, and TypeScript scope.

Keep these notes current when changing the behavior they describe. Update the relevant memory file instead of creating
another monolithic instruction file.

## Quick commands

Run from the repository root unless noted:

```sh
npm ci
npm test
npx oxlint
npm run check -w <package>
npm run test-e2e
```

See [Commands and verification](.kimi-code/memory/commands.md) for focused tests, local e2e, coverage, desktop releases,
and the full verification requirements. In particular, after every task run lint and type-check every changed package;
at the end of each implementation phase run the complete unit and e2e suites as documented there.

## Essential conventions

- End relative import paths in `.js`, even when importing TypeScript sources.
- Prefer relative imports within a package and package names across package boundaries.
- Never add cloud-only code (billing, metering, deployment) under `packages/`.
- Run Prettier with `npm run format`; do not run its Markdown printer on the dense hand-written memory files.
- Before marking work done, check and update any documentation made stale by the change, including this memory, package
  READMEs, and public docs where applicable.

See [Conventions](.kimi-code/memory/conventions.md) and [Architecture](.kimi-code/memory/architecture.md) for details.
