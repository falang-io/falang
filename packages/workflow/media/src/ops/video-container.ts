import type { IProbeInfo } from './types.js';

/** Best-effort output extension for an op that stream-copies a video's own container (trim,
 * concat) rather than transcoding to a fixed target format — falls back to `mp4` (the common
 * case) when the input's own container isn't one of the handful this maps explicitly. */
export const videoExtFromProbe = (probe: IProbeInfo): string => {
  const tokens = probe.formatName.split(',');
  if (tokens.includes('matroska') || tokens.includes('webm')) return tokens.includes('webm') ? 'webm' : 'mkv';
  if (tokens.includes('mov') && !tokens.includes('mp4')) return 'mov';
  return 'mp4';
};
