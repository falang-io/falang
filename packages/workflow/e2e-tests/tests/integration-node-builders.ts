import type { INode } from '@falang/dto';
import type { TVariableInfo } from '@falang/typescript-dto';

/**
 * Builds a `trigger-function` document's root node. Unlike `buildFunctionNode`, this is only used
 * to *replace* an already-UI-created document's root (see `createTriggerFunctionViaUI`) — the
 * `trigger-function-body`'s `vendor`/`triggerName`/`scopeVariableName`/`scopeType` must match the
 * bound `ITriggerDescriptor` exactly (see `@falang/workflow-integrations-common`), so callers pass
 * those straight from the registered integration's descriptor rather than hardcoding them here.
 */
export const buildTriggerFunctionRootNode = (
  id: string,
  triggerFields: {
    readonly vendor: string;
    readonly triggerName: string;
    readonly credentialId: string;
    readonly scopeVariableName: string;
    readonly scopeType: TVariableInfo;
    /** Only needed when `bodyChildren` ends in a `return` node with an actual value (see `buildReturnNode`) — e.g. the webhook trigger echoing `request.body` back so a test can await the signalled workflow's own result instead of a side effect in an external mock. */
    readonly returnValue?: TVariableInfo;
  },
  bodyChildren: readonly INode[] = [],
): INode => ({
  id,
  name: 'trigger-function',
  children: [
    { id: `${id}-header`, name: 'function-header', data: '' },
    { id: `${id}-body`, name: 'trigger-function-body', data: { ...triggerFields }, children: [...bodyChildren] },
    { id: `${id}-footer`, name: 'function-footer', data: '' },
  ],
});

interface ICallAiTextFields {
  readonly integration: string;
  readonly model: string;
  readonly prompt: string;
  readonly resultVariable: string;
}

/** `call-ai-text` node — `prompt` is plain text (may contain `${expr}`, wrapped by the compiler, see `openai.integration.ts`'s `promptFields`), `result` is left as plain text output. */
export const buildCallAiTextNode = (id: string, fields: ICallAiTextFields): INode => ({
  id,
  name: 'call-ai-text',
  data: {
    integration: fields.integration,
    model: fields.model,
    prompt: fields.prompt,
    result: '{"type":"string"}',
    resultVariable: fields.resultVariable,
  },
});

export interface ICallAiChoiceOption {
  readonly alias: string;
  readonly dataType: TVariableInfo;
  /** Identifier the branch binds its picked data to — see `choice-emitters.ts`. Defaults to `'data'`. */
  readonly variable?: string;
  readonly children?: readonly INode[];
}

/** `call-ai-choice` node — one `call-ai-choice-option` child per option, each carrying its own branch statements (see `choice-emitters.ts`). */
export const buildCallAiChoiceNode = (
  id: string,
  fields: { readonly integration: string; readonly model: string; readonly prompt: string },
  options: readonly ICallAiChoiceOption[],
): INode => ({
  id,
  name: 'call-ai-choice',
  data: {
    integration: fields.integration,
    model: fields.model,
    prompt: fields.prompt,
    options: options.map((option) => ({
      alias: option.alias,
      dataType: option.dataType,
      variable: option.variable ?? 'data',
    })),
  },
  children: options.map((option, index) => ({
    id: `${id}-option-${index}`,
    name: 'call-ai-choice-option',
    data: { alias: option.alias, dataType: option.dataType, variable: option.variable ?? 'data' },
    children: [...(option.children ?? [])],
  })),
});

interface IHttpRequestFields {
  readonly method: string;
  readonly url: string;
  readonly headers?: string;
  readonly body?: string;
  readonly resultVariable: string;
}

/** `http-request` node — `url` may contain `${expr}` interpolation (wrapped by the compiler, see `http-request.integration.ts`'s `url` field), `headers`/`body` are raw TS expressions (empty resolves to `undefined` at the call site). */
export const buildHttpRequestNode = (id: string, fields: IHttpRequestFields): INode => ({
  id,
  name: 'http-request',
  data: {
    method: fields.method,
    url: fields.url,
    headers: fields.headers ?? '',
    body: fields.body ?? '',
    resultVariable: fields.resultVariable,
  },
});

interface ITelegramSendMessageFields {
  readonly credentialId: string;
  readonly chatId: string;
  readonly text: string;
}

/** `telegram-send-message` node — `chatId` is a raw expression (e.g. `'message.chat.id'`), `text` is plain text that may contain `${expr}`. */
export const buildTelegramSendMessageNode = (id: string, fields: ITelegramSendMessageFields): INode => ({
  id,
  name: 'telegram-send-message',
  data: { credentialId: fields.credentialId, chatId: fields.chatId, text: fields.text },
});

/**
 * `activepieces-action` node — the single generic node kind backing every ActivePieces piece
 * action (see `@falang/workflow-dto`'s `activepieces-action-nodes.ts` and
 * ADR 0010 (private)). `propsValue` entries are raw expression
 * code, same convention as `http-request`'s `headers`/`body` — a plain string literal like
 * `'"hello"'` for a fixed value.
 */
export const buildActivepiecesActionNode = (
  id: string,
  fields: {
    readonly pieceName: string;
    readonly actionName: string;
    readonly credentialId: string;
    readonly propsValue: Record<string, string>;
  },
): INode => ({
  id,
  name: 'activepieces-action',
  data: {
    pieceName: fields.pieceName,
    actionName: fields.actionName,
    credentialId: fields.credentialId,
    propsValue: fields.propsValue,
  },
});

export interface ITelegramQuestionOption {
  readonly label: string;
  readonly children?: readonly INode[];
}

/** `telegram-question` node — one `telegram-question-option` child per button, each carrying its own branch statements. */
export const buildTelegramQuestionNode = (
  id: string,
  fields: { readonly credentialId: string; readonly chatId: string; readonly question: string },
  options: readonly ITelegramQuestionOption[],
): INode => ({
  id,
  name: 'telegram-question',
  data: {
    credentialId: fields.credentialId,
    chatId: fields.chatId,
    question: fields.question,
    options: options.map((option) => option.label),
  },
  children: options.map((option, index) => ({
    id: `${id}-option-${index}`,
    name: 'telegram-question-option',
    data: { label: option.label },
    children: [...(option.children ?? [])],
  })),
});
