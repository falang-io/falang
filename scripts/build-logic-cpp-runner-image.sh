#!/usr/bin/env bash
# Builds the `logic-cpp-runner` Docker image used by `@falang/logic-e2e-tests` to build/run
# generated C++ inside a pinned toolchain (see ADR 0019 (private)).
# `runCppProjectInDocker` (packages/logic/e2e-tests/src/run-cpp-project.ts) also builds this image
# itself on first use, so this script isn't required — it exists so the (slow, one-time) base-image
# pull happens outside any single test's own timeout, the same reason `test-e2e`'s
# `kind-e2e-setup.sh` runs before `docker compose run` rather than inside it.
#
# Usage: ./scripts/build-logic-cpp-runner-image.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

docker build -f "${REPO_ROOT}/docker/logic-cpp-runner.Dockerfile" -t falang-logic-cpp-runner:latest "${REPO_ROOT}/docker"
