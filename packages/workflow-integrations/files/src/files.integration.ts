import type { IWorkflowIntegration } from '@falang/workflow-integrations-common';
import { filesActions } from './actions.js';
import { FILES_VENDOR } from './constants.js';
import { filesFileType } from './file-types.js';

export * from './constants.js';
export * from './file-types.js';
export * from './activity-helpers.js';
export * from './actions.js';

/**
 * Generic "hold/move/produce a binary" vendor — closes the gap ADR 0038 (private)'s "Problem"
 * section lists (no `File` type, no way to stream a binary through `http-request`, Telegram media
 * dropped, no image/transcription support). Credential-free like `http-request`/`webhook`: a `File`
 * is a bare reference (id/name/size/mime/publicUrl?) reachable only through this project's own
 * internal/JWT-guarded routes — there is no external account to authenticate against.
 */
export const filesIntegration: IWorkflowIntegration = {
  vendor: FILES_VENDOR,
  label: 'files:label',
  notes:
    'Files / binary data: download a URL into a File, turn generated text into a File, read a File back as text, ' +
    'delete/re-hydrate/publish a File. A File is always a REFERENCE (id/name/size/mime, and a publicUrl once ' +
    'published) — never raw bytes in workflow state. Needed whenever a workflow deals with an attachment, ' +
    'document, image, PDF, download URL, upload, or a public link to something it produced.',
  locales: {
    en: () => import('./locales/en.json'),
    ru: () => import('./locales/ru.json'),
  },
  credentialFields: [],
  triggers: [],
  types: [filesFileType],
  actions: filesActions,
  // `deleteFile`/`getFileMeta`/`publishFile`/`readFileBytes`/`unpublishFile`/`uploadFileFromStream`
  // are real, exported functions of this same package (`activity-helpers.ts`) — imported here rather
  // than duplicated as TS source text, the same "import the shared package" shape
  // `amocrm.integration.ts`'s `sharedActivityCode` uses for `resolveOAuth2AccessToken`. `heartbeat`
  // backs the streaming actions' `heartbeatTimeout` (see `actions.ts`'s `STREAMING_ACTIVITY_OPTIONS`);
  // `@temporalio/activity` is already a `@falang/workflow-runner` dependency (see `log`'s own
  // unconditional import in `compile-activities.ts`).
  sharedActivityCode: [
    "import { heartbeat } from '@temporalio/activity';",
    "import type { IFileRef } from '@falang/workflow-integrations-files';",
    'import {',
    '  deleteFile,',
    '  getFileMeta,',
    '  publishFile,',
    '  readFileBytes,',
    '  unpublishFile,',
    '  uploadFileFromStream,',
    "} from '@falang/workflow-integrations-files';",
  ].join('\n'),
};
