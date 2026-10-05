// oxlint-disable no-console, unicorn/prefer-module -- prints the measurements the ADR records
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { IProjectDocument } from '@falang/dto';
import { API_PROJECT_DOCUMENTS } from '@falang/logic-e2e-tests/src/api-project.fixture.js';
import { ARRAYS_PROJECT_DOCUMENTS } from '@falang/logic-e2e-tests/src/arrays-project.fixture.js';
import { CONDITIONS_PROJECT_DOCUMENTS } from '@falang/logic-e2e-tests/src/conditions-project.fixture.js';
import { MONTECARLO_PROJECT_DOCUMENTS } from '@falang/logic-e2e-tests/src/montecarlo-project.fixture.js';
import { OBJECTS_PROJECT_DOCUMENTS } from '@falang/logic-e2e-tests/src/objects-project.fixture.js';
import { describe, expect, it } from 'vitest';
import { INTEGRATIONS } from '../test-utils/project.js';
import { formatReport, runCorpus, type ICorpusProject } from './round-trip-corpus.js';

const SNAKE_DIR = join(__dirname, '../../../../logic/constructor/src/__fixtures__/snake/documents');

const logicProject = (label: string, documents: readonly IProjectDocument[]): ICorpusProject => ({
  input: {
    documents: documents.map((doc) => ({ ...doc, root: doc.root ?? null })),
    instances: [],
    integrations: INTEGRATIONS,
  },
  label,
});

const snake = (): ICorpusProject =>
  logicProject(
    'snake',
    readdirSync(SNAKE_DIR).map((file) => JSON.parse(readFileSync(join(SNAKE_DIR, file), 'utf8')) as IProjectDocument),
  );

/**
 * ADR 0061 spike, G1/G2 over the community's real function trees: the logic constructor's migrated test projects
 * (objects, conditions, arrays, api, MonteCarlo — the old app's own fixtures) and the snake game. Same statement kinds
 * the workflow product uses; `call-api` (logic-only) has no code form in the spike.
 */
describe('round-trip corpus (G1/G2)', () => {
  it('logic fixtures + snake: unchanged files keep every id, single edits change only the touched node', () => {
    const report = runCorpus([
      logicProject('objects', OBJECTS_PROJECT_DOCUMENTS),
      logicProject('conditions', CONDITIONS_PROJECT_DOCUMENTS),
      logicProject('arrays', ARRAYS_PROJECT_DOCUMENTS),
      logicProject('api', API_PROJECT_DOCUMENTS),
      logicProject('montecarlo', MONTECARLO_PROJECT_DOCUMENTS),
      snake(),
    ]);
    console.log(formatReport(report));
    if (report.failures.length > 0) console.log(report.failures.slice(0, 20));
    expect(report.supportedDocuments).toBeGreaterThan(20);
    expect(report.canonicalEqual).toBe(report.supportedDocuments - report.invalidSource);
    expect(report.idsKept).toBe(report.idsTotal);
    for (const kind of ['change', 'insert', 'delete'] as const)
      expect(report.edits[kind].ok).toBe(report.edits[kind].total);
  });
});
