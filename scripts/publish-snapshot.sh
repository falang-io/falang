#!/usr/bin/env bash
# Publish a snapshot of every @falang/* workspace package (as TypeScript sources) to a local registry.
# See scripts/README-registry.md. Options: --registry <url> --dry-run --allow-dirty --tag <dist-tag> --no-git (default tag: latest)
set -euo pipefail

REGISTRY="http://127.0.0.1:4873/"
DRY_RUN=0
ALLOW_DIRTY=0
NO_GIT=0
TAG="latest"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --registry) REGISTRY="$2"; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    --allow-dirty) ALLOW_DIRTY=1; shift ;;
    --no-git) NO_GIT=1; shift ;;
    --tag) TAG="$2"; shift 2 ;;
    -h|--help) sed -n '2,3p' "$0"; exit 0 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
done
REGISTRY="${REGISTRY%/}/"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_CANDIDATE="$(cd "$SCRIPT_DIR/.." && pwd)"
GIT_MODE=1
REPO_ROOT="$REPO_CANDIDATE"
if [[ $NO_GIT -eq 1 ]]; then
  GIT_MODE=0
elif GIT_TOP="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel 2>/dev/null)"; then
  if [[ "$(cd "$GIT_TOP" && pwd -P)" != "$(cd "$REPO_CANDIDATE" && pwd -P)" ]]; then
    echo "Note: $REPO_CANDIDATE is nested inside another git repository ($GIT_TOP); treating it as a non-git checkout." >&2
    GIT_MODE=0
  else
    REPO_ROOT="$GIT_TOP"
  fi
else
  GIT_MODE=0
fi

if [[ $GIT_MODE -eq 1 ]]; then
  if [[ $ALLOW_DIRTY -eq 0 && -n "$(git -C "$REPO_ROOT" status --porcelain)" ]]; then
    echo "Refusing to publish: working tree is dirty (snapshots are built from HEAD, so uncommitted changes would be silently left out)." >&2
    echo "Commit your changes, or pass --allow-dirty to publish HEAD anyway." >&2
    exit 1
  fi
  SHA="$(git -C "$REPO_ROOT" rev-parse HEAD)"
  BRANCH="$(git -C "$REPO_ROOT" branch --show-current)"
  BRANCH="${BRANCH:-detached}"
else
  echo "Non-git checkout: publishing the current directory contents as-is (no dirty check; --allow-dirty ignored)." >&2
  SHA="nogit"
  BRANCH="nogit"
fi
NOW="$(date -u +%Y%m%d.%H%M%S)"
PUBLISHED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
VERSION="0.${NOW}"

WT="$(mktemp -d)"
cleanup() {
  if [[ $GIT_MODE -eq 1 ]]; then
    git -C "$REPO_ROOT" worktree remove --force "$WT" >/dev/null 2>&1 || true
  fi
  rm -rf "$WT"
  if [[ $GIT_MODE -eq 1 ]]; then
    git -C "$REPO_ROOT" worktree prune
  fi
}
trap cleanup EXIT

if [[ $GIT_MODE -eq 1 ]]; then
  git -C "$REPO_ROOT" worktree add --detach "$WT" HEAD >/dev/null 2>&1
else
  # tar preserves file modes; excludes mirror .gitignore so the copy stays small. Names that also occur as
  # real source directories (`out` — packages/core/scheme/src/icons/out/ — `reports`, `old`) are anchored to
  # the places .gitignore means (repo root / a package root), with wildcards that never match "/"; an
  # unanchored `--exclude=out` once silently dropped @falang/scheme's out-icon sources from a snapshot.
  tar -C "$REPO_ROOT" \
    --exclude=node_modules --exclude=.git --exclude=.builds --exclude=coverage --exclude=coverage-reports \
    --exclude=dist --exclude=worker-dist --exclude=test-results --exclude=playwright-report \
    --exclude=blob-report --exclude=.stryker-tmp \
    --anchored --no-wildcards-match-slash \
    --exclude=./old --exclude=./reports --exclude='./packages/*/*/out' --exclude='./packages/*/*/reports' \
    -cf - . | tar -C "$WT" -xf -
fi

node "$SCRIPT_DIR/publish-snapshot.mjs" rewrite "$WT" "$VERSION" "$SHA" "$BRANCH" "$PUBLISHED_AT"

# Auth: the token goes only into the throwaway worktree's .npmrc.
HOSTPART="${REGISTRY#*://}"
: > "$WT/.npmrc"
if [[ $DRY_RUN -eq 0 ]]; then
  TOKEN="${FALANG_REGISTRY_TOKEN:-}"
  if [[ -z "$TOKEN" ]]; then
    NAME="${FALANG_REGISTRY_USER:-falang}"
    PASSWORD="${FALANG_REGISTRY_PASSWORD:-falang-local}"
    BODY="$(NAME="$NAME" PASSWORD="$PASSWORD" node -e 'const {NAME:name,PASSWORD:password}=process.env;console.log(JSON.stringify({name,password,email:name+"@example.com"}))')"
    RESP="$(curl -sS -X PUT -H 'content-type: application/json' -d "$BODY" "${REGISTRY}-/user/org.couchdb.user:${NAME}")" || { echo "cannot reach registry $REGISTRY" >&2; exit 1; }
    TOKEN="$(printf '%s' "$RESP" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).token||"")}catch{console.log("")}})')"
    if [[ -z "$TOKEN" ]]; then
      # Verdaccio answers a repeated registration of an existing user with 409 "username is already
      # registered" (after checking the password), and 401 "unauthorized access" on a wrong password.
      # An existing user therefore gets no token from this endpoint — fall back to HTTP basic auth,
      # which Verdaccio's htpasswd plugin accepts for publish, after proving the password via /-/whoami.
      if printf '%s' "$RESP" | grep -q 'already registered'; then
        WHO="$(curl -sS -u "$NAME:$PASSWORD" "${REGISTRY}-/whoami" || true)"
        if printf '%s' "$WHO" | grep -q "\"username\""; then
          BASIC="$(printf '%s:%s' "$NAME" "$PASSWORD" | base64 -w0)"
          printf '//%s:_auth=%s\n' "$HOSTPART" "$BASIC" >> "$WT/.npmrc"
          echo "registry user '$NAME' already exists; using basic auth."
        else
          echo "registry login failed for existing user '$NAME' (wrong FALANG_REGISTRY_PASSWORD?): $WHO" >&2
          exit 1
        fi
      else
        echo "registry login failed for user '$NAME': $RESP" >&2
        exit 1
      fi
    fi
  fi
  [[ -z "$TOKEN" ]] || printf '//%s:_authToken=%s\n' "$HOSTPART" "$TOKEN" >> "$WT/.npmrc"
fi
printf '@falang:registry=%s\n' "$REGISTRY" >> "$WT/.npmrc"

OK=0; FAILED=0; FAILED_NAMES=()
while IFS= read -r dir; do
  name="$(node -p "require('$WT/$dir/package.json').name")"
  if [[ $DRY_RUN -eq 1 ]]; then
    cmd=(npm pack --dry-run --json --userconfig "$WT/.npmrc")
  else
    cmd=(npm publish --tag "$TAG" --registry "$REGISTRY" --userconfig "$WT/.npmrc")
  fi
  if out="$(cd "$WT/$dir" && "${cmd[@]}" 2>&1)"; then
    if [[ $DRY_RUN -eq 1 ]]; then
      size="$(printf '%s' "$out" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s)[0].unpackedSize+" B")}catch{console.log("?")}})')"
    else
      size="$(printf '%s\n' "$out" | sed -n 's/^npm notice unpacked size: *//p' | head -1)"
      size="${size:-?}"
    fi
    echo "OK   $name  (unpacked: $size)"
    OK=$((OK+1))
  else
    echo "ERR  $name"
    printf '%s\n' "$out" | tail -5 | sed 's/^/       /'
    FAILED=$((FAILED+1)); FAILED_NAMES+=("$name")
  fi
done < <(node "$SCRIPT_DIR/publish-snapshot.mjs" list "$WT")

echo
echo "Summary: $OK ok, $FAILED failed$([[ $DRY_RUN -eq 1 ]] && echo ' (dry run, nothing published)' || true)"
echo "Version: $VERSION"
echo "Commit:  $SHA ($BRANCH)"
if [[ $FAILED -gt 0 ]]; then
  echo "Failed: ${FAILED_NAMES[*]}" >&2
  exit 1
fi
if [[ $DRY_RUN -eq 0 ]]; then
  cat <<HINT

Consumer setup (.npmrc next to the consumer's package.json):
  @falang:registry=$REGISTRY
Then:
  npm update '@falang/*'      # or: npm install @falang/<pkg>@$TAG
HINT
fi
