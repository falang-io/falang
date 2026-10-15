# Builds and runs C# output from `@falang/logic-constructor`'s `sharp` target, inside a container
# instead of on the host — see ADR 0019 (private)'s Docker harness
# notes (same reasoning as `logic-cpp-runner.Dockerfile`/`logic-go-runner.Dockerfile`/
# `logic-rust-runner.Dockerfile`, this is the C# counterpart).
#
# Like the Go/Rust harnesses (and unlike the cpp harness's debian-slim/apt compromise), the official
# image pulled fine in this environment, so this is a major-version pin: .NET 8 (LTS; the patch level
# floats with the `8.0` tag). The full SDK
# image, not the smaller `runtime`/`aspnet` ones — this harness compiles source, it doesn't just run a
# prebuilt assembly.
FROM mcr.microsoft.com/dotnet/sdk:8.0

# Keeps generated numbers/dates formatted identically regardless of any host locale the container might
# otherwise inherit — the expected stdout this harness compares against is culture-sensitive (e.g. a
# `float`'s decimal separator).
ENV DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=1

# The tests run this container under the host's own uid:gid (so `bin/`/`obj/` stay owned by the host user),
# and that uid has no entry in the image's /etc/passwd. With SDK 8.0.426 / runtime 8.0.32 (the `8.0` tag
# since 2026-10-13) named mutexes don't work for such a uid: the CLI first-run setup and then NuGet restore
# fail with `IOException ... 'NuGet-Migrations'`. The run script appends a passwd entry for its own uid,
# which needs the file to be writable — harmless in a throwaway test container. See ADR 0019 (private).
RUN chmod a+w /etc/passwd

WORKDIR /workspace
