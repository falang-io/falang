import { reaction } from 'mobx';
import { getSchemeBounds, type Scheme } from '@falang/scheme';

export const SETTLE_QUIET_MS = 150;
export const SETTLE_MAX_MS = 3000;

/**
 * Resolves `'ready'` once the root icon's left/right/height have not changed for `quietMs`, or
 * `'timeout'` after `maxMs` in total (ADR 0048 (private), section 5). Block heights are measured after mount,
 * so a freshly mounted scheme keeps changing for a few frames.
 */
export const settleSchemeLayout = (
  scheme: Scheme,
  options: { quietMs?: number; maxMs?: number } = {},
): Promise<'ready' | 'timeout'> =>
  new Promise((resolve) => {
    const quietMs = options.quietMs ?? SETTLE_QUIET_MS;
    const maxMs = options.maxMs ?? SETTLE_MAX_MS;
    let done = false;
    const handles: {
      quiet: ReturnType<typeof setTimeout> | null;
      max: ReturnType<typeof setTimeout> | null;
      stop: (() => void) | null;
    } = { quiet: null, max: null, stop: null };
    const finish = (result: 'ready' | 'timeout'): void => {
      if (done) return;
      done = true;
      if (handles.quiet) clearTimeout(handles.quiet);
      if (handles.max) clearTimeout(handles.max);
      handles.stop?.();
      resolve(result);
    };
    const arm = (): void => {
      if (handles.quiet) clearTimeout(handles.quiet);
      handles.quiet = setTimeout(() => finish('ready'), quietMs);
    };
    handles.stop = reaction(
      () => {
        const bounds = getSchemeBounds(scheme);
        return bounds ? `${bounds.left}|${bounds.right}|${bounds.height}` : 'none';
      },
      () => arm(),
    );
    handles.max = setTimeout(() => finish('timeout'), maxMs);
    arm();
  });
