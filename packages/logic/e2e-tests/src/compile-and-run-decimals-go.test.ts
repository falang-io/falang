import { describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compileGoProject } from '@falang/logic-constructor';
import {
  DECIMALS_EXPECTED_RESULT_LINES,
  DECIMALS_MAIN_DOCUMENT_ID,
  DECIMALS_PROJECT_DOCUMENTS,
} from './decimals-project.fixture.js';
import { runGoProjectInDocker } from './run-go-project.js';

// Same generous budget as the cpp pilot test — covers a cold image build on a standalone run.
const DOCKER_BUILD_TIMEOUT_MS = 600_000;

describe('decimals project (ADR 0069 (private) §4)', () => {
  it(
    'compiles exact decimal arithmetic, rounding, stores and printing and prints the same lines on this target',
    async () => {
      const code = compileGoProject({
        documents: DECIMALS_PROJECT_DOCUMENTS,
        entryDocumentId: DECIMALS_MAIN_DOCUMENT_ID,
      });

      const dir = await mkdtemp(join(tmpdir(), 'falang-logic-decimals-go-'));
      try {
        await writeFile(join(dir, 'main.go'), code);
        const lines = await runGoProjectInDocker(dir);
        expect(lines.slice(0, DECIMALS_EXPECTED_RESULT_LINES.length)).toEqual(DECIMALS_EXPECTED_RESULT_LINES);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
    DOCKER_BUILD_TIMEOUT_MS,
  );
});
