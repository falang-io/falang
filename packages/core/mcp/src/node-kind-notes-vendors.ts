/**
 * Vendor-specific `NODE_KIND_NOTES` entries (`node-kinds.ts`'s own doc comment explains why these
 * live here at all: `@falang/mcp-core` has no dependency on, or knowledge of, any vendor package, yet
 * still wants to attach a plain-English footnote to a vendor's node kind by name). Split out purely
 * to stay under this repo's 300-line-per-file lint cap (see CLAUDE.md's "Conventions") — `node-kinds.ts`
 * merges `VENDOR_NODE_KIND_NOTES` into its own `NODE_KIND_NOTES` via a plain object spread at the
 * lookup site, so this file changes nothing about how a caller (`describeNodeKind`/`describeNodeKinds`)
 * reads notes, only where the entries are declared.
 */

/** Telegram/AI/files/HTTP entries, moved verbatim from `node-kinds.ts` (2026-09-22/2026-09-27 findings — see ADR 0009 (private)'s own "Found and fixed" sections for the real chats that prompted each one). */
export const VENDOR_NODE_KIND_NOTES: Record<string, string> = {
  'telegram-question': [
    'Sends the message with real, tappable Telegram inline-keyboard buttons — one per',
    "`telegram-question-option` child, in order, each child's `data.label` becoming that button's",
    'visible text — and pauses the workflow until the user taps one. This is the ONLY way to let a',
    'Telegram user answer a yes/no or multiple-choice question. Do **not** try to read the answer by',
    "matching the *next* incoming message's text (e.g. comparing `message.text.toLowerCase()` against",
    '`"да"`/`"нет"` in a `switch`) — the user is expected to tap a button, not type a reply, and a',
    'plain trigger has no way to correlate a later free-text message back to this particular question',
    'anyway. Each option child runs when its button is tapped; give it an `out` the same way a',
    "`switch-option`'s branch would, to control a surrounding loop or end the function — see",
    "`telegram-question-option`'s notes for which out to pick.",
  ].join(' '),
  'telegram-question-option': [
    "One button of the enclosing `telegram-question`'s inline keyboard, in the order its siblings",
    "appear — `data.label` is both that button's visible text and the value used to confirm the user's",
    "pick. Its children run when that button is tapped; set its `out` the same way a `switch-option`'s",
    'branch would: `continue` to ask another question (next loop iteration), `break` to leave the loop and',
    'carry on with whatever comes *after* the loop, `return` to end the whole function right here. When',
    'the code after the loop is only meant for the loop running out (e.g. a "sorry, I gave up" message), a',
    'branch that has already finished the conversation (e.g. the guess was confirmed and a final message',
    'was sent) must use `return`, not `break` — `break` would still run that trailing code.',
  ].join(' '),
  'call-ai-choice':
    "One synchronous call asking an AI model to pick among its declared options and return typed data alongside the pick — it never talks to an end user by itself, unlike `telegram-question`. Pair it with the chat vendor's own question node for that. Also accepts optional `attachments` (a `File[]`, see `call-ai-text`).",
  'call-ai-choice-option': [
    "One branch of the enclosing `call-ai-choice`, selected when the AI call returns this option's",
    "`alias` — its typed `data` is bound to the `variable` name and in scope for this branch's",
    'children.',
  ].join(' '),
  'call-ai-text':
    'Optional `attachments` (a `File[]`) become extra message parts alongside `prompt` (images/PDF/text) — leave blank for plain text; never attach audio, use `call-ai-transcribe` instead.',
  'call-ai-image': 'Generates an image from `prompt`; the result is a `File` reference, never inline bytes.',
  'call-ai-transcribe': 'Transcribes an audio `File` to text — the only way to read a voice/audio attachment.',
  'files-download': [
    'Downloads a URL into a `File` — a REFERENCE (id/name/size/mime), never raw bytes; the ONLY way a',
    "URL becomes a `File` (any `File`-typed field needs this/`files-from-text`/`files-info`'s output).",
  ].join(' '),
  'files-read-text': [
    "Decodes a `File`'s bytes as text, refusing over `maxBytes` (default ~1 MiB; workflow state must",
    'stay small) — only for text the workflow inspects; a merely-forwarded `File` should not be read.',
  ].join(' '),
  'files-publish': [
    'Mints a `publicUrl` on a `File` (a separate unguessable link — `File.id` alone is never public),',
    'idempotent; a fresh `File` has none until this runs. `files-unpublish` revokes it, not the file.',
  ].join(' '),
  'http-request': '`responseAs: "file"` puts a File in `result.body`; `body` may itself be a `File`.',
  'telegram-send-file': '`file` is a `File` variable (e.g. `message.photo`), never a URL; `as: "auto"` picks by mime.',
  'media-probe': [
    "Reads a File's duration/dimensions/codec/bitrate/mime without changing it — run this before deciding",
    'how to resize/transcode/convert, or whether a video even has an audio track. Every `media-*` op takes a',
    '`File` (a REFERENCE), never a URL — run `files-download` first if what you have is a URL.',
  ].join(' '),
  'media-image-resize': 'Takes and returns a `File`; the input is untouched, the result is a new `File`.',
  'media-image-convert': 'Takes and returns a `File`; the input is untouched, the result is a new `File`.',
  'media-video-trim': 'Takes and returns a `File`; the input is untouched, the result is a new `File`.',
  'media-video-concat': [
    'Needs 2 or more input Files of (ideally) the same format/codec — set `reencode: "true"` when they',
    'differ (e.g. different resolutions/codecs), otherwise the plain stream-copy concat can fail or',
    'produce a broken file. Takes and returns Files; every input is untouched.',
  ].join(' '),
  'media-video-thumbnail': 'Takes a video File and returns a new jpeg image File — the input video is untouched.',
  'media-video-transcode': 'Takes and returns a `File`; the input is untouched, the result is a new `File`.',
  'media-audio-extract': 'Takes a video File and returns a new audio File — the input video is untouched.',
  'media-audio-convert': [
    'Takes and returns a `File`; the input is untouched. Run this before `call-ai-transcribe` on a',
    'Telegram voice message (`message.voice`, ogg/opus) — transcription needs a common format like mp3,',
    'not the raw voice format.',
  ].join(' '),
  'human-task': [
    'BLOCKS the whole workflow until the project owner resolves it from the Tasks page — place it',
    'AFTER whatever data it needs (`payload`/`attachments`) has already been gathered, never before.',
    'Set `timeout` (e.g. `48h`, `3d`) to add a mandatory extra `timeout` branch the flow takes if',
    'nobody resolves it in time — this branch always exists once `timeout` is non-empty and cannot be',
    'deleted. Each `human-task-option` child is one button the owner can press; a `task` variable',
    '(`task.resolvedBy`, `task.resolvedAt`) is in scope inside every branch, including `timeout`.',
  ].join(' '),
  'human-task-option': [
    "One button on the task page — `data.label` is the button's visible text. `data.dataType`",
    'controls what the owner enters before confirming: `void` is a bare button with nothing else;',
    '`string`/`number`/`boolean` show a typed input (captioned by `data.prompt`, e.g. "Reason") whose',
    'value is bound to a `data` variable in scope for this branch only — this is how you collect a',
    'rejection reason or a corrected amount, there is no separate free-text comment field. Set its',
    "`out` the same way a `switch-option`'s branch would.",
  ].join(' '),
};

/** SQL dialect vendors backed by `@falang/workflow-integrations-sql-common`'s shared `buildSqlActions` (see ADR 0039 (private) §6) — one identical set of six action node kinds per vendor, so these notes are generated rather than hand-written per vendor. */
const SQL_DIALECT_VENDORS = ['postgres', 'mysql', 'sqlite'] as const;

const SQL_WHERE_NOTE = [
  '`where` is a small operator DSL, not equality-AND-only: a bare value means `eq` (`null` means',
  '`IS NULL`), or give one column an object of operators — `eq`/`ne`/`gt`/`gte`/`lt`/`lte`/`in`/`notIn`/',
  '`isNull`/`like`/`ilike`/`startsWith`/`contains` — and combine columns/sub-filters with `and`/`or`',
  'arrays, e.g. `{ status: { in: ["new", "paid"] }, total: { gt: 100 } }` or `{ or: [{ id: 1 }, { id: 2 }] }`.',
  'Needs "Sync structure" run on the credential first, or `table` has nothing to offer and there is no',
  '`Row`/`Insert`/`Patch`/`Where` struct type for this table yet (`db:<instanceId>:<table>`, with',
  '`#insert`/`#patch`/`#where` suffixes for the other three) — re-run it after the table changes shape.',
].join(' ');

const SQL_REQUIRES_WHERE_NOTE =
  'Requires a non-empty `where` (the same operator DSL `*-select` uses) — a blank `where` is rejected rather than silently updating/deleting every row.';

const SQL_RETRY_NOTE = [
  'Retries with Temporal defaults on failure, the same as any other activity — a failed call is treated',
  'as "the row was not written", so a retry after an uncertain failure (e.g. the write actually',
  'committed but the acknowledgement never arrived) can insert/update the same row twice. Give a table a',
  'workflow writes to its own unique constraint or an idempotency key if that matters.',
].join(' ');

/** `IWorkflowIntegration.notes`-style caveat, appended to every one of a dialect's action notes below (2026-09-28 — kept short, `sqlite`'s own `IWorkflowIntegration.notes` already spells this out at length). */
const sqlDialectCaveat = (vendor: string): string =>
  vendor === 'sqlite' ? ' SQLite here is local/dev-only — never rely on it surviving in production.' : '';

/** One vendor's six `<vendor>-select/-select-one/-insert/-update/-delete/-query` note entries. */
const buildSqlDialectNodeKindNotes = (vendor: string): Record<string, string> => {
  const caveat = sqlDialectCaveat(vendor);
  return {
    [`${vendor}-select`]: `${SQL_WHERE_NOTE}${caveat}`,
    [`${vendor}-select-one`]: `${SQL_WHERE_NOTE} Throws if no row matches — use \`${vendor}-select\` with \`limit: "1"\` instead when zero matches is a normal outcome.${caveat}`,
    [`${vendor}-insert`]: `${SQL_RETRY_NOTE}${caveat}`,
    [`${vendor}-update`]: `${SQL_WHERE_NOTE} ${SQL_REQUIRES_WHERE_NOTE} ${SQL_RETRY_NOTE}${caveat}`,
    [`${vendor}-delete`]: `${SQL_WHERE_NOTE} ${SQL_REQUIRES_WHERE_NOTE} ${SQL_RETRY_NOTE}${caveat}`,
    [`${vendor}-query`]: `The escape hatch for joins/aggregates — \`sql\` is plain text (never \`\${}\`-interpolated, so it can't smuggle values in), bind values go in \`params\` instead using this vendor's own placeholder syntax (\`$1\`, \`$2\`, … for postgres; \`?\` for mysql/sqlite), e.g. \`params: ["paid"]\`. ${SQL_RETRY_NOTE}${caveat}`,
  };
};

export const SQL_VENDOR_NODE_KIND_NOTES: Record<string, string> = Object.assign(
  {},
  ...SQL_DIALECT_VENDORS.map((vendor) => buildSqlDialectNodeKindNotes(vendor)),
);
