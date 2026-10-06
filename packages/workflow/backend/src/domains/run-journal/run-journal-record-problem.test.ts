import { describe, expect, it, vi } from 'vitest';
import type { ProjectsService } from '../projects/projects/projects.service.js';
import type { IRunJournalStore } from './run-journal-store.js';
import { RunJournalService } from './run-journal.service.js';
import type { IRunJournalRow } from './run-journal.types.js';

const build = (storeTexts: boolean | null, appendImpl?: () => Promise<void>) => {
  const rows: IRunJournalRow[] = [];
  const store = {
    append: vi.fn((batch: readonly IRunJournalRow[]) => {
      if (appendImpl) return appendImpl();
      rows.push(...batch);
      return Promise.resolve();
    }),
  } as unknown as IRunJournalStore;
  const projects = { getJournalStoreTexts: vi.fn(() => Promise.resolve(storeTexts)) } as unknown as ProjectsService;
  return { service: new RunJournalService(store, projects), rows, store };
};

const problem = {
  projectId: 'p1',
  env: 'prod' as const,
  workflowId: 'tg-doc-42',
  vendor: 'telegram',
  message: 'Undeliverable input: down',
  data: { errorType: 'Error', signal: 's', payload: { text: 'secret words' } },
};

describe('RunJournalService.recordProblem', () => {
  it('stores an error entry (default warn, no run, b:<uuid> source key)', async () => {
    const { service, rows } = build(true);
    await service.recordProblem(problem);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      projectId: 'p1',
      env: 'prod',
      workflowId: 'tg-doc-42',
      runId: null,
      kind: 'error',
      level: 'warn',
      vendor: 'telegram',
      message: 'Undeliverable input: down',
      textsStripped: false,
    });
    expect(rows[0]?.sourceKey).toMatch(/^b:[0-9a-f-]{36}$/);
    expect(rows[0]?.data).toMatchObject({ payload: { text: 'secret words' } });
  });

  it('applies the "don\'t store texts" policy to the payload', async () => {
    const { service, rows } = build(false);
    await service.recordProblem(problem);
    expect(rows[0]?.textsStripped).toBe(true);
    expect(rows[0]?.data).toMatchObject({ errorType: 'Error', payloadLength: expect.any(Number) });
    expect(JSON.stringify(rows[0]?.data)).not.toContain('secret words');
  });

  it('writes nothing for a vanished project and never throws when the store fails', async () => {
    const gone = build(null);
    await expect(gone.service.recordProblem(problem)).resolves.toBeUndefined();
    expect(gone.store.append).not.toHaveBeenCalled();

    const broken = build(true, () => Promise.reject(new Error('db down')));
    await expect(broken.service.recordProblem({ ...problem, level: 'error', runId: 'r1' })).resolves.toBeUndefined();
  });
});
