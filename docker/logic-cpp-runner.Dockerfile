# Compiles and runs C++ output from `@falang/logic-constructor`'s `cpp` target, inside a container
# instead of on the host — see ADR 0019 (private)'s Docker harness
# notes (the old app compiled these test projects directly on the developer's machine).
#
# `debian:bookworm-slim` + apt's own `g++`/`cmake` rather than the official `gcc` image — that image
# pulls very slowly (in some environments effectively hangs) and is far larger for what's actually
# needed here; `bookworm-slim` is a small, already-widely-cached base. Version pin is therefore
# "whatever Debian bookworm ships" rather than a specific GCC release: as of writing, g++ 12.2.0 and
# cmake 3.25.1 — good enough since nothing here depends on a specific GCC/CMake feature.
FROM debian:bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends g++ cmake make \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace
