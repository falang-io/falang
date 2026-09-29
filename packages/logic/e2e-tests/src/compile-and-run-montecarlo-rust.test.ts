import { describe, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compileRustProject } from '@falang/logic-constructor';
import { MAIN_DOCUMENT_ID, MONTECARLO_PROJECT_DOCUMENTS } from './montecarlo-project.fixture.js';
import {
  buildNoApiRustDriver,
  runRustCargoProjectInDocker,
  writeRustCargoFalangProjectFiles,
} from './run-rust-project.js';
import { MONTECARLO_EXPECTED_RESULT_LINES } from './expected-output.js';
import { expectResultLinesMatch } from './expect-result-lines.js';

/**
 * Unlike every other Rust compile-and-run test, this one goes through the `cargo`-based harness
 * (`runRustCargoProjectInDocker`/`writeRustCargoProjectFiles`), not the plain-`rustc` one
 * (`runRustProjectInDocker`) — MonteCarlo's `Math.random` mapping needs the external `rand` crate,
 * which a single-file `rustc main.rs` invocation can't pull in. See ADR 0019 (private)'s MonteCarlo
 * implementation notes and `docker/logic-rust-runner.Dockerfile`'s own comment on how `rand` is
 * pre-fetched into the image so this still runs offline.
 */

// Cargo's own build (even pre-fetched/offline) is slower than plain rustc's — same generous budget as every other compile-and-run test regardless, since it's dominated by a cold image build on a standalone run either way.
const DOCKER_BUILD_TIMEOUT_MS = 600_000;

describe('MonteCarlo project on the Rust target (ADR 0019 (private))', () => {
  it(
    "compiles MonteCarlo's Math.random mapping (the external rand crate, via a cargo-based Docker harness) and reproduces (within result.txt's own non-deterministic prefix match) the old app's expected output",
    async () => {
      const compiled = compileRustProject({
        documents: MONTECARLO_PROJECT_DOCUMENTS,
        entryDocumentId: MAIN_DOCUMENT_ID,
      });

      const dir = await mkdtemp(join(tmpdir(), 'falang-logic-montecarlo-rust-'));
      try {
        await writeRustCargoFalangProjectFiles(dir, compiled, buildNoApiRustDriver());
        const lines = await runRustCargoProjectInDocker(dir);
        expectResultLinesMatch(lines, MONTECARLO_EXPECTED_RESULT_LINES);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
    DOCKER_BUILD_TIMEOUT_MS,
  );
});
