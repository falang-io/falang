import { describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compileSharpProject } from '@falang/logic-constructor';
import {
  ALIASING_MAIN_DOCUMENT_ID,
  ARRAYS_ALIASING_EXPECTED_RESULT_LINES,
  ARRAYS_ALIASING_PROJECT_DOCUMENTS,
} from './arrays-aliasing-project.fixture.js';
import { runSharpProjectInDocker, writeSharpProjectFiles } from './run-sharp-project.js';

/** Inserting an `arr-slice` result into another array must leave the sliced array untouched (TypeScript semantics) — see `arrays-aliasing-project.fixture.ts`. */
const DOCKER_BUILD_TIMEOUT_MS = 600_000;

describe('arrays aliasing project on the C# target (ADR 0019 (private))', () => {
  it(
    'arr-slice + arr-insert do not alias the sliced array',
    async () => {
      const code = compileSharpProject({
        documents: ARRAYS_ALIASING_PROJECT_DOCUMENTS,
        entryDocumentId: ALIASING_MAIN_DOCUMENT_ID,
      });
      const dir = await mkdtemp(join(tmpdir(), 'falang-logic-arrays-aliasing-sharp-'));
      try {
        await writeSharpProjectFiles(dir, code);
        const lines = await runSharpProjectInDocker(dir);
        expect(lines.slice(0, ARRAYS_ALIASING_EXPECTED_RESULT_LINES.length)).toEqual(
          ARRAYS_ALIASING_EXPECTED_RESULT_LINES,
        );
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
    DOCKER_BUILD_TIMEOUT_MS,
  );
});
