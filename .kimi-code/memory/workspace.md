# Workspace and repository layout

This is the **community edition** of Falang (AGPL-3.0-only, see `LICENSE`; contributions need a CLA, see
`CONTRIBUTING.md`). Design discussions happen in GitHub Issues/Discussions. Pointers of the form `ADR 00xx (private)`
refer to the maintainers' private architecture decision records — the rule or reason itself is always stated in place,
the pointer only says where the longer history lives.

## Workspace layout

npm workspaces monorepo. Node `>=24`, TypeScript 6, `"type": "commonjs"` throughout (except `playground` which is `"type": "module"`).
