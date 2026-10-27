import type { Repository } from 'typeorm';
import type { ProjectVersion } from './project-version.entity.js';

/** A unique-constraint violation on Postgres (`23505`) or sqlite (the tests' in-memory database). */
export const isUniqueViolation = (error: unknown): boolean => {
  const candidate = error as { code?: unknown; message?: unknown } | null;
  if (!candidate || typeof candidate !== 'object') return false;
  if (candidate.code === '23505') return true;
  const message = typeof candidate.message === 'string' ? candidate.message : '';
  return /UNIQUE constraint failed|duplicate key value/i.test(message);
};

/** The next free version number of a project: highest existing + 1 (a deleted version's number is never reused below the maximum). */
export const nextVersionNumber = async (versions: Repository<ProjectVersion>, projectId: string): Promise<number> => {
  const latest = await versions.findOne({ where: { projectId }, order: { versionNumber: 'DESC' } });
  return (latest?.versionNumber ?? 0) + 1;
};

const MAX_ATTEMPTS = 5;

/**
 * Inserts a new version, allocating its number as `max + 1`. The `(project_id, version_number)` unique index makes two
 * concurrent publishes safe: the loser hits a unique violation, re-reads the maximum and retries with the next number
 * (its `buildId` follows the number). `firstNumber` is the number already announced (e.g. in the commit message).
 */
export const saveNewVersion = async (
  versions: Repository<ProjectVersion>,
  projectId: string,
  firstNumber: number,
  fields: Omit<ProjectVersion, 'id' | 'projectId' | 'versionNumber' | 'buildId' | 'createdAt'>,
): Promise<ProjectVersion> => {
  let versionNumber = firstNumber;
  // oxlint-disable no-await-in-loop -- each retry depends on the previous attempt's failure (bounded by MAX_ATTEMPTS).
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await versions.save(versions.create({ ...fields, projectId, versionNumber, buildId: `v${versionNumber}` }));
    } catch (error) {
      if (!isUniqueViolation(error) || attempt >= MAX_ATTEMPTS) throw error;
      versionNumber = await nextVersionNumber(versions, projectId);
    }
  }
};
