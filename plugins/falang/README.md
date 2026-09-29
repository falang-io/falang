# falang Claude Code plugin

Lets a coding agent (Claude Code today; the skills/MCP config are standard formats other
MCP-speaking agents can reuse) edit and run falang projects: the hosted workflow product, and the
offline desktop `logic`/`simple-code`/Arduino apps. The full design (shared tool set, per-product MCP servers, agent-held document locks) lives in
the main [falang monorepo](https://github.com/falang-io/falang).

This plugin ships:

- Three skills teaching the agent falang's document/node model and product-specific tools:
  `falang-schemes` (the shared mental model — every product), `falang-arduino` (pin/driver nodes,
  the Arduino C++ target's constraints), `falang-workflow` (dev/prod build/run/publish, triggers,
  credentials).
- An `.mcp.json` entry for the **workflow** product's MCP server (Streamable HTTP, in `backend`).
- No entry for the **desktop** MCP server — that one is per-project, not per-plugin: each project
  folder created by the desktop apps (`packages/desktop/app-sketch`, `packages/desktop/app-arduino`) gets its
  own `.mcp.json` written into it automatically, pointing at the app's bundled stdio server.

## Install

```bash
claude plugin marketplace add <path-or-url-to-this-repo-or-its-mirror>
claude plugin install falang@falang
```

For local testing against a checkout of this monorepo, add the marketplace by path from the repo
root:

```bash
claude plugin marketplace add ./plugins
claude plugin install falang@falang
```

This repo is the source of truth for the plugin (versioned together with the code it describes,
per the ADR's "in-repo plus a published mirror" decision); a public marketplace repo mirroring this
`plugins/` directory is intended for people who don't want to clone the whole monorepo, but is not
itself part of this repo.

## Using it with the hosted workflow product

1. In the workflow web app, go to your user settings and create a **Personal access token** (PAT) —
   shown once, optionally scoped to one project.
2. Set two environment variables before starting Claude Code:
   ```bash
   export FALANG_MCP_URL="https://workflow.falang.ru/mcp"   # or your self-hosted instance
   export FALANG_TOKEN="<your personal access token>"
   ```
3. Start `claude` anywhere with this plugin installed. The `falang-workflow` MCP server connects
   using `Authorization: Bearer ${FALANG_TOKEN}` against `${FALANG_MCP_URL}`, and the
   `falang-schemes`/`falang-workflow` skills load automatically when you ask the agent to work on a
   workflow project.

## Using it on the desktop apps

Desktop projects (`packages/desktop/app-sketch`, `packages/desktop/app-arduino`) don't use this plugin's
`.mcp.json` at all — each project folder gets its own `.mcp.json` (pointing at the app's bundled
stdio MCP server) and a short `CLAUDE.md` written into it the moment the project is created. Just:

```bash
cd <project-folder>
claude
```

Claude Code will prompt you to trust the project's `.mcp.json` the first time; accept it and the
project's own MCP server + this plugin's `falang-schemes`/`falang-arduino` skills are both
available. No `FALANG_MCP_URL`/`FALANG_TOKEN` needed for this path — there's no network hop, no
credential, just the local project files.
