# Builds and runs C# output from `@falang/logic-constructor`'s `sharp` target, inside a container
# instead of on the host — see ADR 0019 (private)'s Docker harness
# notes (same reasoning as `logic-cpp-runner.Dockerfile`/`logic-go-runner.Dockerfile`/
# `logic-rust-runner.Dockerfile`, this is the C# counterpart).
#
# Like the Go/Rust harnesses (and unlike the cpp harness's debian-slim/apt compromise), the official
# image pulled fine in this environment, so this is a real version pin: .NET 8 (LTS). The full SDK
# image, not the smaller `runtime`/`aspnet` ones — this harness compiles source, it doesn't just run a
# prebuilt assembly.
FROM mcr.microsoft.com/dotnet/sdk:8.0

# Keeps generated numbers/dates formatted identically regardless of any host locale the container might
# otherwise inherit — the expected stdout this harness compares against is culture-sensitive (e.g. a
# `float`'s decimal separator).
ENV DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=1

WORKDIR /workspace
