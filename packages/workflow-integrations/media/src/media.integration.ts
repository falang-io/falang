import type { IWorkflowIntegration } from '@falang/workflow-integrations-common';
import { mediaActions } from './actions.js';
import { MEDIA_VENDOR } from './constants.js';
import { mediaInfoType } from './media-types.js';

export * from './constants.js';
export * from './media-types.js';
export * from './media-job-client.js';
export * from './actions.js';

/**
 * ffmpeg-backed media processing — closes ADR 0041 (private)'s "Problem"
 * (resize/thumbnail/transcode/convert Files a workflow already holds). Credential-free like
 * `files`/`http-request`: every op runs against the standalone `media` service
 * (`packages/workflow/media`), authenticated with the runner's own project token, never a
 * user-provided credential.
 */
export const mediaIntegration: IWorkflowIntegration = {
  vendor: MEDIA_VENDOR,
  label: 'media:label',
  notes:
    'ffmpeg media processing: probe a File for duration/dimensions/codec, resize/convert an image, ' +
    'trim/concat/thumbnail/transcode a video, extract or convert audio (e.g. Telegram voice to mp3 before ' +
    'transcription). Keywords: ffmpeg, image resize, thumbnail, video, audio, convert, transcode, concat, crop, ' +
    'extract audio, voice to mp3. Every op takes and returns a `files/File` reference — never raw bytes.',
  locales: {
    en: () => import('./locales/en.json'),
    ru: () => import('./locales/ru.json'),
  },
  credentialFields: [],
  triggers: [],
  types: [mediaInfoType],
  actions: mediaActions,
  // `runMediaJob` is a real, exported function of this same package (`media-job-client.ts`) —
  // imported here rather than duplicated as TS source text, the same "import the shared package"
  // shape `files.integration.ts`'s own `sharedActivityCode` uses for its own helpers.
  //
  // `heartbeat` is its own import line, textually identical to `files`/`http-request`'s own
  // `sharedActivityCode` line (`compileActivities` dedupes exact-duplicate import lines — see
  // `@falang/workflow-compiler`'s `compile-activities.ts`) — `activityInfo`/`cancellationSignal` are
  // declared in a *separate* import statement instead of folded into that same line, since combining
  // them would redeclare the `heartbeat` binding a second time once both vendors' shared code lands
  // in the same generated `activities.ts` module (two import statements introducing the very same
  // name from the same module is a `Duplicate identifier` under `typeCheckProject`, even though two
  // *textually identical* statements dedupe away to one).
  sharedActivityCode: [
    "import { heartbeat } from '@temporalio/activity';",
    "import { activityInfo, cancellationSignal } from '@temporalio/activity';",
    "import type { IFileRef } from '@falang/workflow-integrations-files';",
    "import { runMediaJob } from '@falang/workflow-integrations-media';",
    '',
    "/** `(projectId, jobKey)` is this job's idempotency key on the `media` service side — derived from",
    " * the activity's own identity so a Temporal-retried attempt (after a media-pod restart, a lost",
    ' * response, …) rejoins the same job instead of starting a duplicate encode. */',
    'const mediaJobKey = (): string => {',
    '  const info = activityInfo();',
    "  return `${info.workflowExecution?.workflowId ?? 'no-workflow'}:${info.workflowExecution?.runId ?? 'no-run'}:${info.activityId}`;",
    '};',
  ].join('\n'),
};
