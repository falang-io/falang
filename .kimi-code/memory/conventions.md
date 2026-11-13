# Conventions

## Conventions

- **License is AGPL-3.0-only** (root `LICENSE`, `"license"` in every manifest, `CONTRIBUTING.md`; CLA link still TBD) — the repository is being split into a public community monorepo and a private cloud root per ADR 0044 (private); never add cloud-only code (billing, metering, deploy) under `packages/`.
- **Import paths end in `.js`** even when importing TS sources (nodenext + `isolatedModules`). The VSCode workspace enforces this via `ts.preferences.importModuleSpecifierEnding: "js"`. When adding or moving files, keep the `.js` suffix on relative imports.
- Prefer relative imports within a package; use the package name (`@falang/di`, `@falang/dto`) when crossing package boundaries.
- Decorators are enabled (`experimentalDecorators`, `emitDecoratorMetadata`) — MobX (`@observable`) and tsyringe both rely on this.
- oxlint is the only linter. Many stylistic rules are disabled in `.oxlintrc.json`; don't reintroduce them without a reason.
- Prettier is the formatter; VSCode is configured to format-on-save. Run `npm run format` before committing.
- The `old/` directory is gitignored and its `.ts` files are treated as plaintext in VSCode — it's a dump for deprecated/archived code, not a working directory.
