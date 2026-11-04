export type TManagedArchiveKind = 'tar.gz' | 'zip';

export interface IManagedAsset {
  /** Suffix of the archive name after `arduino-cli_<version>_`. */
  readonly asset: string;
  readonly archive: TManagedArchiveKind;
  /** The one entry to take out of the archive. */
  readonly binaryName: string;
}

const DOWNLOAD_BASE = 'https://downloads.arduino.cc/arduino-cli';

/** The official distribution asset for this machine, or `null` when there is none (ADR 0074 (private) §2). */
export const managedAssetName = (
  platform: NodeJS.Platform,
  arch: string,
  underArm64Translation = false,
): IManagedAsset | null => {
  switch (platform) {
    case 'linux': {
      if (arch === 'x64') return { asset: 'Linux_64bit.tar.gz', archive: 'tar.gz', binaryName: 'arduino-cli' };
      if (arch === 'arm64') return { asset: 'Linux_ARM64.tar.gz', archive: 'tar.gz', binaryName: 'arduino-cli' };
      if (arch === 'arm') return { asset: 'Linux_ARMv7.tar.gz', archive: 'tar.gz', binaryName: 'arduino-cli' };
      return null;
    }
    case 'darwin': {
      if (arch === 'arm64' || (arch === 'x64' && underArm64Translation)) {
        return { asset: 'macOS_ARM64.tar.gz', archive: 'tar.gz', binaryName: 'arduino-cli' };
      }
      if (arch === 'x64') return { asset: 'macOS_64bit.tar.gz', archive: 'tar.gz', binaryName: 'arduino-cli' };
      return null;
    }
    case 'win32': {
      // There is no native arm64 build; the x64 one runs emulated.
      if (arch === 'x64' || arch === 'arm64') {
        return { asset: 'Windows_64bit.zip', archive: 'zip', binaryName: 'arduino-cli.exe' };
      }
      return null;
    }
    default: {
      return null;
    }
  }
};

export const managedArchiveName = (version: string, asset: IManagedAsset): string =>
  `arduino-cli_${version}_${asset.asset}`;

export const managedArchiveUrl = (version: string, asset: IManagedAsset): string =>
  `${DOWNLOAD_BASE}/${managedArchiveName(version, asset)}`;

/** Note: no `arduino-cli_` prefix in this name. */
export const managedChecksumsUrl = (version: string): string => `${DOWNLOAD_BASE}/${version}-checksums.txt`;
