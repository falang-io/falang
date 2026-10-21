import { describe, expect, it } from 'vitest';
import { compileTsProject } from '@falang/logic-constructor';
import { DECIMALS_EXPECTED_RESULT_LINES, DECIMALS_PROJECT_DOCUMENTS } from './decimals-project.fixture.js';
import { runTsProject } from './run-ts-project.js';

// The TS target needs no Docker: the generated files run in-process (see `run-ts-project.ts`).
describe('decimals project on the TS target (ADR 0069 (private) §4)', () => {
  it('prints the same lines as every native target', async () => {
    const compiled = compileTsProject({ documents: DECIMALS_PROJECT_DOCUMENTS });
    expect(Object.keys(compiled.files)).toContain('_falang_decimal.ts');
    const lines = await runTsProject(compiled.files, 'main');
    expect(lines).toEqual(DECIMALS_EXPECTED_RESULT_LINES);
  });
});
