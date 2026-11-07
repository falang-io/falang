import { mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { ILocalServiceStatus, TLocalServiceName } from './services/types.js';

/**
 * The status file a shell (the Electron app, `test-e2e:fast`) waits for. `packages/desktop/app-flow` mirrors the
 * first seven fields in its own `status-file.ts`; keep them unchanged, add new ones only.
 */
export interface ILocalStatus {
  readonly url: string;
  readonly internalUrl: string;
  readonly temporalAddress: string;
  readonly temporalUiUrl: string | null;
  readonly pid: number;
  readonly firstRun: boolean;
  readonly controlToken: string;
  /** The started optional services: what the e2e test process needs (`testEnv`) and what they provide. */
  readonly services: Readonly<Partial<Record<TLocalServiceName, ILocalServiceStatus>>>;
}

/** Writes the status file atomically (temp file + rename), mode 0600 — it holds the control token. */
export const writeStatusFile = async (file: string, status: ILocalStatus): Promise<void> => {
  await mkdir(path.dirname(file), { recursive: true });
  const tmpFile = `${file}.${process.pid}.tmp`;
  await writeFile(tmpFile, JSON.stringify(status), { mode: 0o600 });
  await rename(tmpFile, file);
};
