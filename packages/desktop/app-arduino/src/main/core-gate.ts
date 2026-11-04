import { checkArduinoCli, listInstalledCores } from '@falang/desktop-arduino-cli';
import { boardLabel, boardPackageIndexUrl, boardPlatformId } from '@falang/desktop-arduino-dto/src/board.js';
import type { IArduinoCoreMissingOutcome, IArduinoCoreStatus } from '../shared/arduino-core-ipc-types.js';

/** Looks up whether the core `fqbn` needs is installed. Never throws; a CLI that is missing or cannot list cores is reported, not guessed. */
export const getCoreStatus = async (fqbn: string): Promise<IArduinoCoreStatus> => {
  const platformId = boardPlatformId(fqbn);
  const packageIndexUrl = boardPackageIndexUrl(fqbn);
  const common = { platformId, boardLabel: boardLabel(fqbn) };
  const withUrl = <T extends object>(status: T): T & { packageIndexUrl?: string } =>
    typeof packageIndexUrl === 'string' ? { ...status, packageIndexUrl } : status;
  const cli = await checkArduinoCli();
  if (!cli.available) return withUrl({ ...common, installed: false, cliAvailable: false });
  const listed = await listInstalledCores();
  if (!listed.ok) return withUrl({ ...common, installed: false, cliAvailable: true, error: listed.message });
  const core = listed.cores.find((entry) => entry.id === platformId);
  return withUrl({
    ...common,
    installed: Boolean(core),
    ...(core && core.version !== '' ? { version: core.version } : {}),
    cliAvailable: true,
  });
};

/**
 * What a status means for a Build/Upload: only a certain "the CLI works and the core is not there" refuses.
 * A missing CLI or an unreadable core list is left to the normal path to report, never blocked here.
 */
export const decideCoreGate = (status: IArduinoCoreStatus): IArduinoCoreMissingOutcome | null => {
  if (!status.cliAvailable || typeof status.error === 'string' || status.installed || status.platformId === null)
    return null;
  return {
    stage: 'core-missing',
    platformId: status.platformId,
    boardLabel: status.boardLabel,
    message: `The board core ${status.platformId} for ${status.boardLabel} is not installed. Install it first.`,
  };
};

/** `null` = go ahead; otherwise the outcome to return instead of building. */
export const checkCoreGate = async (fqbn: string): Promise<IArduinoCoreMissingOutcome | null> =>
  decideCoreGate(await getCoreStatus(fqbn));
