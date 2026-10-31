import { promises as fs } from 'node:fs';

/** Mirror of `ILocalStatus` in `@falang/workflow-local` (the shell does not depend on that package). */
export interface ILocalStatus {
  readonly url: string;
  readonly internalUrl: string;
  readonly temporalAddress: string;
  readonly temporalUiUrl: string | null;
  readonly pid: number;
  readonly firstRun: boolean;
  readonly controlToken: string;
}

export const parseStatus = (raw: string): ILocalStatus | null => {
  try {
    const value = JSON.parse(raw) as Partial<ILocalStatus>;
    if (typeof value.url !== 'string' || typeof value.internalUrl !== 'string') return null;
    if (typeof value.controlToken !== 'string') return null;
    return value as ILocalStatus;
  } catch {
    return null;
  }
};

export const readStatusFile = async (file: string): Promise<ILocalStatus | null> => {
  try {
    return parseStatus(await fs.readFile(file, 'utf8'));
  } catch {
    return null;
  }
};
