import { DataSource, type Repository } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ProjectVersion } from './project-version.entity.js';
import { isUniqueViolation, nextVersionNumber, saveNewVersion } from './publish-version.js';

const FIELDS = { workflowBundle: 'b', activitiesSource: 'a', commitId: null };

describe('publish version numbering (security audit P1-3)', () => {
  // oxlint-disable-next-line init-declarations
  let dataSource: DataSource;
  // oxlint-disable-next-line init-declarations
  let versions: Repository<ProjectVersion>;
  // oxlint-disable-next-line init-declarations
  let projectId: string;

  beforeEach(async () => {
    // Only the table under test: the unique `(project_id, version_number)` index comes from the entity.
    dataSource = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      synchronize: true,
      entities: [ProjectVersion],
    });
    await dataSource.initialize();
    versions = dataSource.getRepository(ProjectVersion);
    projectId = '11111111-1111-4111-8111-111111111111';
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  it('two concurrent publishes get distinct numbers (the unique index forces the loser to retry)', async () => {
    const results = await Promise.all([
      saveNewVersion(versions, projectId, 1, FIELDS),
      saveNewVersion(versions, projectId, 1, FIELDS),
      saveNewVersion(versions, projectId, 1, FIELDS),
    ]);
    const numbers = results.map((version) => version.versionNumber).toSorted();
    expect(numbers).toEqual([1, 2, 3]);
    expect(results.map((version) => version.buildId).toSorted()).toEqual(['v1', 'v2', 'v3']);
  });

  it('the unique index rejects a duplicate number and the error is recognised', async () => {
    await versions.save(versions.create({ ...FIELDS, projectId, versionNumber: 1, buildId: 'v1' }));
    const failure = await versions
      .save(versions.create({ ...FIELDS, projectId, versionNumber: 1, buildId: 'v1' }))
      .catch((error: unknown) => error);
    expect(isUniqueViolation(failure)).toBe(true);
  });

  it('nextVersionNumber is max + 1, not a count (a deleted middle version leaves a gap)', async () => {
    await saveNewVersion(versions, projectId, 1, FIELDS);
    await saveNewVersion(versions, projectId, 2, FIELDS);
    await saveNewVersion(versions, projectId, 3, FIELDS);
    await versions.delete({ projectId, versionNumber: 2 });
    expect(await nextVersionNumber(versions, projectId)).toBe(4);
  });
});
