import type { IActionDescriptor } from '@falang/workflow-integrations-common';
import { mediaAudioActions } from './actions-audio.js';
import { mediaImageActions } from './actions-image.js';
import { mediaVideoActions } from './actions-video.js';

/** Every `media-*` action, 1:1 with the operation catalog — ADR 0041 (private) §2. Split across `actions-image.ts`/`actions-video.ts`/`actions-audio.ts` to keep every file under the repo's `max-lines` budget. */
export const mediaActions: readonly IActionDescriptor[] = [
  ...mediaImageActions,
  ...mediaVideoActions,
  ...mediaAudioActions,
];
