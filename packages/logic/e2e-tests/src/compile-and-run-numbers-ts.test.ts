import { describe, expect, it } from 'vitest';
import { compileTsProject } from '@falang/logic-constructor';
import { NUMBERS_EXPECTED_RESULT_LINES, NUMBERS_PROJECT_DOCUMENTS } from './numbers-project.fixture.js';
import { runTsProject } from './run-ts-project.js';

// The TS target needs no Docker: the generated files run in-process (see `run-ts-project.ts`).
describe('numbers project on the TS target (ADR 0069 (private))', () => {
  it('truncates integer division and float-to-integer stores so the output matches the native targets', async () => {
    const compiled = compileTsProject({ documents: NUMBERS_PROJECT_DOCUMENTS });
    const lines = await runTsProject(compiled.files, 'main');
    expect(lines).toEqual(NUMBERS_EXPECTED_RESULT_LINES);
  });
});
