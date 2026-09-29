import type { IExternalApiRegistry } from './external-api-registry.js';
import { variableInfoToGoType } from './golang-type-name.js';

/** The interface name a `call-api` node's target API compiles to — same naming scheme as `cppApiInterfaceName`. */
export const goApiInterfaceName = (apiName: string): string => `I${apiName}`;

/** The package-level variable a `call-api` call site reads — the hand-written driver that links against the compiled output sets it to a real implementation before calling into any function that uses it (see ADR 0019 (private)'s "Implementation notes" for `call-api`). */
export const goApiGlobalName = (apiName: string): string => `G${apiName}`;

/**
 * Emits one Go `interface` plus a package-level variable per API in the registry — the Go analogue
 * of `emitCppApiDeclarations`. A project with no APIs at all emits nothing.
 */
export const emitGoApiDeclarations = (
  registry: IExternalApiRegistry,
  structNames: ReadonlyMap<string, string>,
): string => {
  const blocks: string[] = [];
  for (const api of registry.apis.values()) {
    const interfaceName = goApiInterfaceName(api.name);
    const methods = api.endpointIds.map((endpointId) => {
      const endpoint = registry.endpoints.get(endpointId);
      if (!endpoint) throw new Error(`External API "${api.name}" references unknown endpoint "${endpointId}"`);
      const goParams = endpoint.parameters
        .map((parameter) => `${parameter.name} ${variableInfoToGoType(parameter.type, structNames)}`)
        .join(', ');
      const returnType = endpoint.returnValue ? ` ${variableInfoToGoType(endpoint.returnValue, structNames)}` : '';
      return `  ${endpoint.name}(${goParams})${returnType}`;
    });
    blocks.push(
      [`type ${interfaceName} interface {`, ...methods, '}', `var ${goApiGlobalName(api.name)} ${interfaceName}`].join(
        '\n',
      ),
    );
  }
  return blocks.join('\n\n');
};
