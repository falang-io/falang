import type { IExternalApiRegistry } from './external-api-registry.js';
import { variableInfoToSharpType } from './sharp-type-name.js';

/** The interface name a `call-api` node's target API compiles to — same naming scheme as `cppApiInterfaceName`/`goApiInterfaceName`/`rustApiTraitName`. */
export const sharpApiInterfaceName = (apiName: string): string => `I${apiName}`;

/** The static field a `call-api` call site reads through, as `Program.<field>.<Endpoint>(args)` — every compiled function is already a `Program` static method (see `compile-sharp-project.ts`), so a static field on the same class is the natural home, not a standalone holder class. The hand-written driver that links against the compiled output sets it before calling into any function that uses it (see ADR 0019 (private)'s "Implementation notes" for `call-api`). */
export const sharpApiFieldName = (apiName: string): string => apiName;

export interface ISharpApiDeclarations {
  /** Top-level `public interface I<Name> { ... }` declarations, alongside the struct classes. */
  readonly interfaces: string;
  /** `public static I<Name> <Name>;` lines to inject into the `Program` class body. */
  readonly fields: string;
}

/**
 * Emits one C# interface per API in the registry, plus the static field lines `compile-sharp-project.ts`
 * folds into `Program`'s own class body — the C#-target analogue of `emitCppApiDeclarations`/
 * `emitGoApiDeclarations`/`emitRustApiDeclarations`. A project with no APIs at all emits nothing for
 * either part.
 */
export const emitSharpApiDeclarations = (
  registry: IExternalApiRegistry,
  structNames: ReadonlyMap<string, string>,
): ISharpApiDeclarations => {
  const interfaceBlocks: string[] = [];
  const fieldLines: string[] = [];
  for (const api of registry.apis.values()) {
    const interfaceName = sharpApiInterfaceName(api.name);
    const methods = api.endpointIds.map((endpointId) => {
      const endpoint = registry.endpoints.get(endpointId);
      if (!endpoint) throw new Error(`External API "${api.name}" references unknown endpoint "${endpointId}"`);
      const sharpParams = endpoint.parameters
        .map((parameter) => `${variableInfoToSharpType(parameter.type, structNames)} ${parameter.name}`)
        .join(', ');
      const returnType = endpoint.returnValue ? variableInfoToSharpType(endpoint.returnValue, structNames) : 'void';
      return `  ${returnType} ${endpoint.name}(${sharpParams});`;
    });
    interfaceBlocks.push([`public interface ${interfaceName} {`, ...methods, '}'].join('\n'));
    fieldLines.push(`public static ${interfaceName} ${sharpApiFieldName(api.name)};`);
  }
  return { interfaces: interfaceBlocks.join('\n\n'), fields: fieldLines.join('\n') };
};
