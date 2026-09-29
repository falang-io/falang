#!/usr/bin/env bash
# Builds the `logic-rust-runner` Docker image used by `@falang/logic-e2e-tests` to build/run
# generated Rust inside a pinned toolchain (see ADR 0019 (private)).
# Same "pull outside any single test's own timeout" reasoning as `build-logic-cpp-runner-image.sh`/
# `build-logic-go-runner-image.sh`.
#
# Usage: ./scripts/build-logic-rust-runner-image.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

docker build -f "${REPO_ROOT}/docker/logic-rust-runner.Dockerfile" -t falang-logic-rust-runner:latest "${REPO_ROOT}/docker"
