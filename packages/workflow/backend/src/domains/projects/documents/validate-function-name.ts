import { BadRequestException } from '@nestjs/common';
import { FUNCTION_LIKE_DOCUMENT_TYPES, isValidFunctionName } from '@falang/dto';

/** `function`/`trigger-function` documents compile `name` verbatim into a real TS function identifier
 *  (see `@falang/workflow-compiler`'s `compileFunction`/`compileTriggerFunction`) — every other type
 *  (`objects-structure`, the pinned `integrations` document, …) never reaches the compiler at all, so
 *  only `FUNCTION_LIKE_DOCUMENT_TYPES` (`@falang/dto`) is gated. The only chokepoint every write path
 *  (REST `PATCH`/`POST`, and both MCP tools in `domains/mcp/mcp-shared-tools.ts`, which call
 *  `create`/`update` directly and bypass the DTOs'/`ValidationPipe`'s class-validator rules entirely)
 *  is guaranteed to go through. */
export const assertValidFunctionName = (type: string, name: string): void => {
  if (!FUNCTION_LIKE_DOCUMENT_TYPES.has(type)) return;
  if (!isValidFunctionName(name)) {
    throw new BadRequestException(
      `Function name "${name}" is invalid — it must be an English, camelCase identifier ` +
        '(e.g. myFunctionName), with no spaces, punctuation, or non-Latin script',
    );
  }
};
