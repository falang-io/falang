import type {
  IArduinoCliFullStatus,
  IArduinoCliProgress,
  IArduinoCliSettingsInput,
} from '../../shared/arduino-cli-ipc-types.js';

/** Which "arduino-cli is not usable" notice the build panel shows (`none` = the CLI resolves fine). */
export type TCliAlertKind = 'none' | 'not-found' | 'custom-missing' | 'managed-missing';

export const cliAlertKind = (status: Pick<IArduinoCliFullStatus, 'available' | 'problem'> | null): TCliAlertKind => {
  if (status === null || status.available) return 'none';
  return status.problem ?? 'not-found';
};

/** The "arduino-cli X is available" notice: only for a managed CLI with a newer cached release. */
export const shouldOfferCliUpdate = (status: IArduinoCliFullStatus | null): boolean =>
  status !== null &&
  status.source === 'managed' &&
  status.updateAvailable === true &&
  typeof status.latestVersion === 'string';

const BYTES_IN_MB = 1024 * 1024;

export const formatMegabytes = (bytes: number): string => `${(bytes / BYTES_IN_MB).toFixed(1)} MB`;

export interface IProgressView {
  /** 0–100, or `null` when the total size is unknown. */
  readonly percent: number | null;
  readonly text: string;
}

export const describeDownloadProgress = (progress: IArduinoCliProgress): IProgressView => {
  if (typeof progress.total !== 'number' || progress.total <= 0) {
    return { percent: null, text: formatMegabytes(progress.received) };
  }
  const percent = Math.min(100, Math.floor((progress.received / progress.total) * 100));
  return { percent, text: `${formatMegabytes(progress.received)} / ${formatMegabytes(progress.total)}` };
};

/** The settings form as the modal edits it. */
export interface ICliSettingsForm {
  readonly source: IArduinoCliSettingsInput['source'];
  readonly customPath: string;
  readonly checkUpdates: boolean;
}

export const buildSettingsInput = (form: ICliSettingsForm): IArduinoCliSettingsInput => ({
  source: form.source,
  ...(form.source === 'custom' ? { customPath: form.customPath.trim() } : {}),
  checkUpdates: form.checkUpdates,
});

/** Choosing "Downloaded" with nothing downloaded must download first rather than save a dead setting. */
export const needsDownloadBeforeSave = (
  form: ICliSettingsForm,
  status: Pick<IArduinoCliFullStatus, 'managedVersion'> | null,
): boolean => form.source === 'managed' && typeof status?.managedVersion !== 'string';

export const MAX_CORE_OUTPUT_LINES = 200;

/** Appends output lines keeping only the last `MAX_CORE_OUTPUT_LINES`. */
export const appendOutputLines = (lines: readonly string[], added: string): readonly string[] => {
  const next = [...lines, added];
  return next.length > MAX_CORE_OUTPUT_LINES ? next.slice(next.length - MAX_CORE_OUTPUT_LINES) : next;
};
