import type { INode } from '@falang/dto';
import type { TVariableInfo } from '@falang/typescript-dto';
import type { IProjectExportPayload } from '../domains/projects/export/project-export.service.js';

/**
 * Node-tree builders for hand-written workflow-tier fixtures — mirrors
 * `@falang/workflow-e2e-tests`' own `node-builders.ts`/`integration-node-builders.ts` shape exactly
 * (same node kinds/data shapes), reimplemented here rather than imported across the package boundary
 * for the same reason `workflow-e2e-client.ts`'s `workflowE2eWaitFor` is. See
 * ADR 0018 (private).
 */
export const buildFunctionNode = (
  id: string,
  bodyChildren: readonly INode[] = [],
  returnValue?: TVariableInfo,
): INode => ({
  id,
  name: 'function',
  children: [
    { id: `${id}-header`, name: 'function-header', data: '' },
    { id: `${id}-body`, name: 'function-body', data: { parameters: [], returnValue }, children: [...bodyChildren] },
    { id: `${id}-footer`, name: 'function-footer', data: '' },
  ],
});

export const buildLogNode = (id: string, message: string): INode => ({ id, name: 'log', data: message });

export const buildReturnNode = (id: string, expression: string): INode => ({ id, name: 'return', data: expression });

export const buildCallFunctionNode = (id: string, targetSchemeId: string): INode => ({
  id,
  name: 'call-function',
  data: { schemeId: targetSchemeId, parameters: [], returnVariable: '' },
});

interface IHttpRequestFields {
  readonly method: string;
  readonly url: string;
  readonly headers?: string;
  readonly body?: string;
  readonly resultVariable: string;
}

/** `http-request` node — mirrors `integration-node-builders.ts`'s `buildHttpRequestNode`. */
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

interface ICallAiTextFields {
  readonly integration: string;
  readonly model: string;
  readonly prompt: string;
  readonly resultVariable: string;
  /** Raw expression code, `expectedType: File[]` — e.g. `'[message.document]'`. See ADR 0038 (private) §6. */
  readonly attachments?: string;
}

/** `call-ai-text` node — mirrors `integration-node-builders.ts`'s `buildCallAiTextNode`. */
export const buildCallAiTextNode = (id: string, fields: ICallAiTextFields): INode => ({
  id,
  name: 'call-ai-text',
  data: {
    integration: fields.integration,
    model: fields.model,
    prompt: fields.prompt,
    attachments: fields.attachments ?? '',
    result: '{"type":"string"}',
    resultVariable: fields.resultVariable,
  },
});

export interface ICallAiChoiceOption {
  readonly alias: string;
  readonly dataType: TVariableInfo;
  readonly variable?: string;
  readonly children?: readonly INode[];
}

/** `call-ai-choice` node — mirrors `integration-node-builders.ts`'s `buildCallAiChoiceNode`. */
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

/**
 * `activepieces-action` node — the single generic node kind backing every ActivePieces piece action
 * (see `@falang/workflow-dto`'s `activepieces-action-nodes.ts` and
 * ADR 0010 (private)). Mirrors `integration-node-builders.ts`'s
 * `buildActivepiecesActionNode`. `propsValue` entries are raw expression code, same convention as
 * `http-request`'s `headers`/`body` — a plain string literal like `'"hello"'` for a fixed value.
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

/**
 * Builds a `trigger-function` document's root node — mirrors `integration-node-builders.ts`'s
 * `buildTriggerFunctionRootNode`. Unlike `buildFunctionNode`, this is only used to *replace* an
 * already-imported document's root (a fixture's `trigger-function` document is a placeholder, since
 * a fixture written before import can't yet know a real credential id) — the `trigger-function-body`'s
 * `vendor`/`triggerName`/`scopeVariableName`/`scopeType` must match the bound `ITriggerDescriptor`
 * exactly (see `@falang/workflow-integrations-common`).
 */
export const buildTriggerFunctionRootNode = (
  id: string,
  triggerFields: {
    readonly vendor: string;
    readonly triggerName: string;
    readonly credentialId: string;
    readonly scopeVariableName: string;
    readonly scopeType: TVariableInfo;
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

interface ITelegramSendMessageFields {
  readonly credentialId: string;
  readonly chatId: string;
  readonly text: string;
}

/** `telegram-send-message` node — mirrors `integration-node-builders.ts`'s `buildTelegramSendMessageNode`. */
export const buildTelegramSendMessageNode = (id: string, fields: ITelegramSendMessageFields): INode => ({
  id,
  name: 'telegram-send-message',
  data: { credentialId: fields.credentialId, chatId: fields.chatId, text: fields.text },
});

interface ITelegramSendFileFields {
  readonly credentialId: string;
  readonly chatId: string;
  /** Raw expression code, `expectedType: File` — e.g. `'message.document'`. */
  readonly file: string;
  readonly as?: 'auto' | 'photo' | 'document' | 'video' | 'audio' | 'voice';
  /** Raw template-string body (may contain `${expr}` interpolation) — see ADR 0038 (private) §5. */
  readonly caption?: string;
}

/** `telegram-send-file` node — mirrors `@falang/workflow-integrations-telegram`'s `telegram-send-file-action.ts` field names exactly. */
export const buildTelegramSendFileNode = (id: string, fields: ITelegramSendFileFields): INode => ({
  id,
  name: 'telegram-send-file',
  data: {
    credentialId: fields.credentialId,
    chatId: fields.chatId,
    file: fields.file,
    as: fields.as ?? 'auto',
    caption: fields.caption ?? '',
  },
});

export interface ITelegramQuestionOption {
  readonly label: string;
  readonly children?: readonly INode[];
}

/** `telegram-question` node — mirrors `integration-node-builders.ts`'s `buildTelegramQuestionNode`. */
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

/**
 * A `POST /projects/import`-shaped payload (`formatVersion: 1`) with a single top-level `function`
 * document — the fixture format ADR 0018 decided on (reuses `ProjectExportService`'s own export
 * shape rather than inventing one). No `folders`/`integrations` document needed: a fresh project
 * already seeds its own pinned `integrations` document on import (see `importProject`), and this
 * fixture's function doesn't reference one.
 */
export const buildSingleFunctionFixture = (
  projectName: string,
  functionName: string,
  bodyChildren: readonly INode[],
): IProjectExportPayload => ({
  formatVersion: 1,
  project: { id: '', name: projectName },
  folders: [],
  documents: [
    {
      id: 'fn',
      type: 'function',
      name: functionName,
      folderId: null,
      pinned: false,
      root: buildFunctionNode('fn', bodyChildren),
      data: null,
    },
  ],
});

// `files-download`/`files-from-text`/`files-read-text`/`files-publish` node builders live in
// `workflow-e2e-fixtures-files.ts` — split out to stay under this file's 300-line lint cap.
