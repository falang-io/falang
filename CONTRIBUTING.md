# Contributing

## License

This project is licensed under the [GNU Affero General Public License v3.0](LICENSE) (`AGPL-3.0-only`).
By contributing you agree that your contribution is licensed under the same terms.

Contributions require signing a Contributor License Agreement (CLA): [link TBD](#).

## Development

Requires Node >= 24 and npm 11.

```sh
npm ci                       # install (npm workspaces monorepo)
npm run check -w <package>   # type-check one package, e.g. npm run check -w @falang/dto
npx oxlint                   # lint (must be clean)
npm test                     # unit tests (Vitest)
npm run format               # Prettier
```

Run `npm run check` for every package you change, plus `npx oxlint`, before opening a pull request.

Conventions (import paths ending in `.js`, package layout, architecture notes) are described in
[`CLAUDE.md`](CLAUDE.md) / [`AGENTS.md`](AGENTS.md).
