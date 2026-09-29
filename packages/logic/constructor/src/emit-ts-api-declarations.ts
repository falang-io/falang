import { tsReturnTypeName, variableInfoToTsTypeName } from './ts-type-name.js';
import type { ITsApiEndpoint } from './ts-statement-context.js';

/**
 * One `external-api-structure` group (a thread — see `mindTreeCfg`'s root/header/body/thread/child
 * shape), scoped to the document it belongs to. `compile-ts-project.ts` derives this list from
 * `buildExternalApiRegistry`'s own per-document `documentId` field rather than re-walking the project.
 */
export interface ITsApiGroup {
  readonly id: string;
  readonly name: string;
}

/**
 * Emits one `<ApiDoc>.ts` file's worth of declarations (Contract 4): one `I<Endpoint>Params` interface
 * plus one `<Group>` interface per group (a thread), then the containing `<ApiDoc>` interface combining
 * them — the TS-target analogue of `emit-go-api-declarations.ts`'s `emitGoApiDeclarations`, but scoped
 * to a single document and nested one level deeper (Go/cpp/C# each give a *group* its own top-level
 * interface/trait with no containing-document concept at all; only the TS and Rust targets need one,
 * see `ts-statement-context.ts`'s own doc comment on `ITsApiEndpoint`). A document with no groups at
 * all (shouldn't happen for a real `external-api-structure` document, but guarded the same way
 * `emitGoApiDeclarations` guards an empty registry) emits an empty `<ApiDoc>` interface.
 */
/** `{\n}` for an empty body (no blank line inside), `{\n<lines>\n}` otherwise — avoids the stray blank line a naive `` `{\n${lines}\n}` `` leaves behind when `lines` is `''` (a zero-parameter endpoint, a group with zero endpoints, …), matching the reference `code/ts` output's own `export interface IGetButtonsStateParams {\n}`. */
const braceBlock = (lines: string): string => (lines === '' ? '{\n}' : `{\n${lines}\n}`);

export const emitTsApiDeclarations = (
  apiDocName: string,
  groups: readonly ITsApiGroup[],
  endpoints: ReadonlyMap<string, ITsApiEndpoint>,
  structNames: ReadonlyMap<string, string>,
): string => {
  const blocks: string[] = [];
  const groupFieldLines: string[] = [];

  for (const group of groups) {
    const groupEndpoints = [...endpoints.values()].filter((endpoint) => endpoint.groupId === group.id);
    for (const endpoint of groupEndpoints) {
      const fields = endpoint.parameters
        .map((parameter) => `  ${parameter.name}: ${variableInfoToTsTypeName(parameter.type, structNames)};`)
        .join('\n');
      blocks.push(`export interface I${endpoint.name}Params ${braceBlock(fields)}`);
    }
    const methods = groupEndpoints
      .map(
        (endpoint) =>
          `  ${endpoint.name}(params: I${endpoint.name}Params): ${tsReturnTypeName(endpoint.returnValue, structNames)};`,
      )
      .join('\n');
    blocks.push(`export interface ${group.name} ${braceBlock(methods)}`);
    groupFieldLines.push(`  ${group.name}: ${group.name};`);
  }

  blocks.push(`export interface ${apiDocName} ${braceBlock(groupFieldLines.join('\n'))}`);
  return blocks.join('\n\n');
};
