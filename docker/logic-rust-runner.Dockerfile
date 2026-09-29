# Compiles and runs Rust output from `@falang/logic-constructor`'s `rust` target, inside a container
# instead of on the host — see ADR 0019 (private)'s Docker harness
# notes (same reasoning as `logic-cpp-runner.Dockerfile`/`logic-go-runner.Dockerfile`, this is the Rust
# counterpart).
#
# Like the Go harness (and unlike the cpp harness's debian-slim/apt compromise), the official `rust`
# image pulled in about a minute in this environment — no reason to trade a real version pin (Rust
# 1.82) for a weaker "whatever apt ships" one.
FROM rust:1.82-bookworm

# Pre-fetch and pre-compile the `rand` crate (needed by the `Math.random` mapping for the MonteCarlo
# project — see ADR 0019 (private)'s MonteCarlo implementation
# notes) into this image's Cargo registry/target cache at *build* time, so the per-test `cargo build`
# at container *run* time never needs network access — same "pin the toolchain, no flakiness during
# tests" posture as the debian-slim/apt compromise `logic-cpp-runner.Dockerfile` made for a different
# reason. `--offline` at run time (`CARGO_NET_OFFLINE`, set below) then fails fast and loud if this
# cache is ever incomplete, instead of hanging on a network call inside a test.
RUN cargo new --bin /tmp/rand-prefetch \
  && echo 'rand = "0.8"' >> /tmp/rand-prefetch/Cargo.toml \
  && (cd /tmp/rand-prefetch && cargo build --release) \
  && rm -rf /tmp/rand-prefetch \
  # The actual test containers run as the host's own uid/gid (see `run-rust-project.ts`'s
  # `buildUserArgs`), not this build stage's root — the registry cache this step just populated has
  # to be readable (and, since a fresh per-project `Cargo.lock` still needs to write into
  # `$CARGO_HOME`'s cache index, writable) by an arbitrary uid.
  && chmod -R a+rwX "$CARGO_HOME"

ENV CARGO_NET_OFFLINE=true

WORKDIR /workspace
