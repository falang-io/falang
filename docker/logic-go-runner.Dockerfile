# Compiles and runs Go output from `@falang/logic-constructor`'s `golang` target, inside a container
# instead of on the host — see ADR 0019 (private)'s Docker harness
# notes (same reasoning as `logic-cpp-runner.Dockerfile`, this is its Go counterpart).
#
# Unlike the cpp harness (which avoids the official `gcc` image over slow pulls), the official
# `golang` image pulled in well under a minute in this environment — no reason to trade a real
# version pin (Go 1.23) for the weaker "whatever apt ships" compromise `logic-cpp-runner.Dockerfile`
# had to make for g++/cmake.
FROM golang:1.23-bookworm

WORKDIR /workspace
