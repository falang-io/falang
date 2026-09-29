# AGENTS.md

This file provides guidance to agents when working with code in this repository.

npm workspaces monorepo. Node `>=24`, TypeScript 6, `"type": "commonjs"`.

## Packages

| Package               | Path                   | Purpose                                            |
| --------------------- | ---------------------- | -------------------------------------------------- |
| `@falang/di`          | `packages/core/di`     | tsyringe wrapper + `createSchemeToken<T>()`        |
| `@falang/dto`         | `packages/core/dto`    | Node model (zod DTOs, `NodesGroup` / `NodesStack`) |
| `@falang/scheme`      | `packages/core/scheme` | MobX + React editor runtime (`schemeFactory`)      |
| `@falang/antd`        | `packages/core/antd`   | Ant Design UI module                               |
| `@falang/text-dto`    | `packages/text/dto`    | Text-node DTOs                                     |
| `@falang/text-scheme` | `packages/text/scheme` | Text-node scheme runtime                           |
| _(playground)_        | `playground`           | Vite + React dev harness                           |

All packages publish from `src/index.ts` (`main` points at TS source, no build step needed in-repo).

## Commands (run from root)

- `npm test` — Vitest across all workspaces
- `npm run coverage` — same with V8 coverage
- `npm run format` / `format:check` — Prettier
- `npx oxlint` — lint (`.oxlintrc.json`)

Per-package:

- `npm test -w @falang/<name>` — single package tests
- `npm run check -w @falang/scheme` — typecheck (`tsc --noEmit -p tsconfig.build.json`, only scheme has this)
- `npm run stryker -w @falang/<dto|text-dto>` — mutation tests
- `npm run dev -w playground` / `npm run build -w playground`

Single test: `npx vitest run -c vitest.config.ts path/to/file.test.ts -t "test name"` from inside the package directory.

## Conventions

- **Import paths end in `.js`** always (nodenext + `isolatedModules`). Enforced by `.vscode/settings.json`.
- **Decorators enabled** (`experimentalDecorators`, `emitDecoratorMetadata`) — MobX `@observable` and tsyringe rely on this.
- **oxlint** is the only linter; many style rules disabled (`sort-keys`, `no-null`, `curly`, etc.).
- **Prettier**: 120 width, single quotes, trailing commas.

## Architecture notes

- **DTO**: Tree of typed nodes. `INodeConfig` declares a node kind (name, optional zod `data` schema, children policy, factory). Children policy: `true` (any), array (`['nameA','nameB']`), or `childTuple` (fixed positional). `NodesStack` builds a zod discriminated union for `parseNode`/`parseDocument`.
- **Scheme entry**: `schemeFactory({ infra, modules, document })` creates a tsyringe child container, parses doc, creates `NodeStore` instances, registers modules.
- **Stores**: MobX observable classes — `NodeStore`, `SchemeNodesStore`, `SchemeIconsStore`, plus view-model stores resolved via DI tokens.
- **Actions → events**: Mutations (`insertNode`, `deleteNode`, `moveNodes`, etc.) fire typed events via `scheme.events.fireEvent()`.
- **Command bus**: `SchemeCommandsService` dispatches at 5 priority levels (0–4, high→low). Listener returning `true` stops propagation.
- **Module pattern**: Implement `IModule` (`register` → DI bindings, `initialize` → event/command wiring, `dispose` → cleanup). See `src/modules/history/` as canonical example.
- **Test harness**: `getTestInfrastructure()` + `getTestEmptyDoc()` from `packages/core/scheme/test-utils/`. See `src/modules/history/history.test.ts` for setup pattern (build infra, call `schemeFactory`, dispose in cleanup).
