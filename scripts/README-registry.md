# Local @falang snapshot registry

A private "cloud" repo consumes this monorepo's packages through a Verdaccio registry running on the developer's machine. Packages are published **as TypeScript sources** (every package's `main` is `src/index.ts`, no build step).

The registry serves only the `@falang` scope and has **no npmjs uplink**: anything else 404s on purpose. Its storage (named volume `falang-registry-storage`) is a cache, not a source of truth; it is disposable, and everything can be republished from git.

## Start / stop

```bash
docker compose -f docker-compose.registry.yml up -d
curl http://127.0.0.1:4873/-/ping      # 200 when ready
docker compose -f docker-compose.registry.yml down          # keeps the volume
docker compose -f docker-compose.registry.yml down -v       # also wipes storage
```

## Publish a snapshot

```bash
scripts/publish-snapshot.sh              # publish HEAD of the current checkout
scripts/publish-snapshot.sh --dry-run    # npm pack --dry-run for every package
```

Options: `--registry <url>` (default `http://127.0.0.1:4873/`), `--allow-dirty` (otherwise a dirty tree is refused, since snapshots are built from `HEAD`), `--tag <dist-tag>` (default `latest` — npm resolves a `"*"` range to the `latest` dist-tag whenever that version satisfies it, and Verdaccio only sets `latest` on a package's _first_ publish, so publishing under any other tag would pin every consumer to the first snapshot forever).

Auth: `FALANG_REGISTRY_TOKEN`, or else the script registers/logs in `FALANG_REGISTRY_USER`/`FALANG_REGISTRY_PASSWORD` (defaults `falang`/`falang-local`). The token is written only into a throwaway worktree's `.npmrc`.

The script checks out `HEAD` into a throwaway `git worktree`, rewrites each publishable package's `package.json` there (version, `falangSnapshot`, `@falang/*` dependency specs to `"*"`, a default `files` field if missing), and publishes them sequentially, continuing on error. `packages/*/*` only; `playground*` and `"private": true` packages are skipped. The worktree is always removed afterwards.

## Non-git checkouts

If the checkout is not a git repository (or `--no-git` is passed), the script copies the tree with `tar` (excluding `node_modules`, `.git`, `.builds`, build/coverage/report directories, `old`) into the temp dir instead of `git worktree add`, skips the dirty check (`--allow-dirty` is ignored) and records `falangSnapshot` as `sha: 'nogit'`, `shortSha: 'nogit'`, `branch: 'nogit'`. The same mode is used when the checkout is a plain folder nested inside another git repository (for example a gitignored `community/` inside a private repo): git's toplevel is compared with the directory above `scripts/`, and if they differ the script says so and does not publish the outer repository's `HEAD`. In this mode the current files are published exactly as they are on disk, uncommitted changes included.

## Consuming

In the consumer repo, a one-line `.npmrc`:

```
@falang:registry=http://127.0.0.1:4873/
```

then `npm install @falang/dto` and later `npm update <every @falang/* name>` — note `npm update '@falang/*'` does **not** glob (npm treats it as a literal package name); pass the exact package names, e.g. those listed in the consumer's `package-lock.json`.

## Version scheme

`0.<YYYYMMDD>.<HHMMSS>` in UTC, e.g. `0.20260929.165230`. The commit is recorded in each published `package.json` under `falangSnapshot` (`sha`, `shortSha`, `branch`, `publishedAt`).

Why not `0.0.0-<sha>`: semver `*` ranges (used for internal deps) ignore prerelease versions, and several prereleases would be ordered by the sha string rather than by time. A plain numeric, time-ordered version is matched by `*`, and the newest snapshot always sorts highest.
