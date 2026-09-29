import type { IExternalApiRegistry } from './external-api-registry.js';
import { buildCppSignatureLine } from './compile-cpp-function.js';

/** The abstract-class name a `call-api` node's target API compiles to — never collides with a real `function` document's own name, since C++ types and functions share no namespace collision risk here (a struct named the same as an API would, but that's already true of `struct-registry.ts`'s own naming and out of scope for this pass). */
export const cppApiInterfaceName = (apiName: string): string => `I${apiName}`;

/** The global pointer a `call-api` call site dereferences — the hand-written driver that links against the compiled output is responsible for setting it to a real implementation before calling into any function that uses it (see ADR 0019 (private)'s "Implementation notes" for `call-api`). */
export const cppApiGlobalName = (apiName: string): string => `g_${apiName}`;

/**
 * Emits one pure-virtual abstract class plus an `extern` global pointer per API in the registry —
 * the cpp analogue of the old app's own `call_api` codegen, which also only ever generated the
 * *shape* of an API (an abstract class), never a real implementation. A project with no APIs at
 * all emits nothing (matches `emitCppStructDeclarations`'s own "nothing to declare" posture).
 */
export const emitCppApiDeclarations = (
  registry: IExternalApiRegistry,
  structNames: ReadonlyMap<string, string>,
): string => {
  const blocks: string[] = [];
  for (const api of registry.apis.values()) {
    const interfaceName = cppApiInterfaceName(api.name);
    const methods = api.endpointIds.map((endpointId) => {
      const endpoint = registry.endpoints.get(endpointId);
      if (!endpoint) throw new Error(`External API "${api.name}" references unknown endpoint "${endpointId}"`);
      const signatureLine = buildCppSignatureLine(
        endpoint.name,
        endpoint.parameters,
        endpoint.returnValue,
        structNames,
      );
      return `  virtual ${signatureLine} = 0;`;
    });
    blocks.push(
      [
        `struct ${interfaceName} {`,
        `  virtual ~${interfaceName}() {}`,
        ...methods,
        '};',
        `extern ${interfaceName}* ${cppApiGlobalName(api.name)};`,
      ].join('\n'),
    );
  }
  return blocks.join('\n\n');
};
