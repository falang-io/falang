/**
 * A `function`/`trigger-function` document's `name` is compiled verbatim into a real identifier —
 * `export async function ${name}(...)` in `@falang/workflow-compiler`, `${returnType} ${name}(...)`
 * in `@falang/logic-constructor`'s cpp target and app-arduino's own compiler. Nothing sanitizes it on
 * the way in, so a free-text name (Cyrillic, spaces, punctuation) either breaks the generated build or
 * silently produces something no target language accepts. This is the one shared rule every product's
 * "new document"/"rename" form and every document-creation/rename entry point (human UI, the in-app
 * agent, MCP tools) should run the candidate name through before accepting it.
 *
 * Deliberately just a pattern, not a localized error-message string — callers span hosts with very
 * different text conventions (i18n'd React forms in all three products, plain-English exception
 * messages in `backend`, plain-English tool-result errors an LLM reads in the agent/MCP paths), so
 * each one composes its own message around this shared boolean/regex instead of one fixed string
 * being force-fit everywhere.
 */
export const FUNCTION_NAME_PATTERN = /^[a-z][a-zA-Z0-9]*$/;

export const isValidFunctionName = (name: string): boolean => FUNCTION_NAME_PATTERN.test(name);

/**
 * Every document type, across every product, whose `name` is compiled into a real function
 * identifier and therefore needs `isValidFunctionName` enforced: the workflow product's `function`/
 * `trigger-function`, and the `'function'` type both `app-sketch` (its `logic` project type) and
 * `app-arduino` (its one document "kind") share. Deliberately excludes struct-like types
 * (`objects-structure`, `enum-structure`, `external-api-structure`) even though `@falang/logic-
 * constructor` does compile those to identifiers too for `app-sketch` — a known, narrower gap left
 * for a future pass, not something this constant's callers currently sanitize.
 */
export const FUNCTION_LIKE_DOCUMENT_TYPES: ReadonlySet<string> = new Set(['function', 'trigger-function']);
