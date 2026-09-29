export const OPENAI_VENDOR = 'openai';
export const CALL_AI_TEXT_NAME = 'call-ai-text';
export const CALL_AI_CHOICE_NAME = 'call-ai-choice';
export const CALL_AI_IMAGE_NAME = 'call-ai-image';
export const CALL_AI_TRANSCRIBE_NAME = 'call-ai-transcribe';

/**
 * Same trick `@falang/workflow-integrations-files`'s own `actions.ts` already uses (`FILE_REF_TYPE`):
 * `activitySignature` is spliced verbatim into `workflows.ts`'s `proxyActivities<{...}>()` type
 * literal — a *different* generated file from `activities.ts`, which is the only one this vendor's
 * `sharedActivityCode` imports the real `IFileRef` into. A bare `IFileRef` here would type-check
 * inside `activities.ts` but fail as an unresolved name in `workflows.ts`, so every `activitySignature`
 * below inlines this same shape instead of importing it.
 */
export const FILE_REF_TYPE = '{ id: string; name: string; size: number; mime: string; publicUrl?: string }';

/** `call-ai-image`'s `size` field — a fixed vendor-declared list, not fetched (unlike `model`). */
export const IMAGE_SIZE_OPTIONS = ['1024x1024', '1024x1536', '1536x1024', 'auto'] as const;
