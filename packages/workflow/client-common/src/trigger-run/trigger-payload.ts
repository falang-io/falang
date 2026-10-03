import type { INode } from '@falang/dto';
import type { TTypeInfo, TVariableInfo } from '@falang/typescript-dto';
import { findTriggerDescriptor, type ITriggerFunctionBodyData } from '@falang/workflow-compiler';
import type { ITriggerDescriptor, IWorkflowIntegration } from '@falang/workflow-integrations-common';

/** The trigger a `trigger-function` document's root is bound to, if its vendor is registered (else `null`). */
export const findDocumentTrigger = (
  root: INode | null | undefined,
  integrations: readonly IWorkflowIntegration[],
): ITriggerDescriptor | null => {
  const body = root?.children?.[1];
  if (!body?.data) return null;
  return findTriggerDescriptor(body.data as ITriggerFunctionBodyData, integrations) ?? null;
};

/** Property map of a struct type by id (the project's/vendors' types registry), `null` when unknown. */
export type TResolveStructProperties = (id: string) => Readonly<Record<string, TVariableInfo>> | null;

const SAMPLE_MAX_DEPTH = 4;

const SCALAR_SAMPLES: Readonly<Record<string, unknown>> = { string: '', number: 0, boolean: false };

/**
 * A JSON skeleton of `type` to start a test payload from: required struct properties filled with empty
 * values (`''`, `0`, `false`, `[]`), optional ones left out, recursion cut at a few levels.
 */
export const buildSamplePayload = (type: TTypeInfo, resolveStruct: TResolveStructProperties, depth = 0): unknown => {
  if (type.type in SCALAR_SAMPLES) return SCALAR_SAMPLES[type.type];
  if (type.type === 'array') return [];
  if (type.type === 'any') return {};
  if (type.type === 'union') {
    const [first] = type.unionTypes;
    return first ? buildSamplePayload(first, resolveStruct, depth) : null;
  }
  if (type.type !== 'struct') return null;
  const properties = depth < SAMPLE_MAX_DEPTH ? resolveStruct(type.id) : null;
  if (!properties) return {};
  return Object.fromEntries(
    Object.entries(properties)
      .filter(([, property]) => !property.optional)
      .map(([name, property]) => [name, buildSamplePayload(property, resolveStruct, depth + 1)]),
  );
};

export type TParsedPayload =
  | { readonly ok: true; readonly payload: Record<string, unknown> }
  | { readonly ok: false; readonly error: string };

const parseJson = (text: string): { readonly value: unknown } | { readonly error: string } => {
  try {
    return { value: JSON.parse(text) as unknown };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
};

/** The payload must be a JSON object (what every trigger delivers). */
export const parseTriggerPayload = (text: string): TParsedPayload => {
  const parsed = parseJson(text);
  if ('error' in parsed) return { ok: false, error: `Not valid JSON: ${parsed.error}` };
  const { value } = parsed;
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, error: 'The payload must be a JSON object' };
  }
  return { ok: true, payload: value as Record<string, unknown> };
};

const storageKey = (projectId: string, documentId: string): string =>
  `falang:trigger-payload:${projectId}:${documentId}`;

/** The last payload a trigger-function was run with (per project and document), if any. */
export const loadLastTriggerPayload = (projectId: string, documentId: string): string | null => {
  try {
    return globalThis.localStorage?.getItem(storageKey(projectId, documentId)) ?? null;
  } catch {
    return null;
  }
};

export const saveLastTriggerPayload = (projectId: string, documentId: string, text: string): void => {
  try {
    globalThis.localStorage?.setItem(storageKey(projectId, documentId), text);
  } catch {
    // Storage unavailable (private mode, quota) — the next run just starts from the sample again.
  }
};
