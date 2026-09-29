import type { IExternalApiEndpoint, IExternalApiRegistry } from './external-api-registry.js';
import { variableInfoToRustParamType, variableInfoToRustType } from './rust-type-name.js';

/**
 * The trait method name a `call-api` node's target endpoint compiles to: `<ApiDoc>_<Group>_<Endpoint>`
 * — the `external-api-structure` document's own name, the api thread's own name, then the endpoint's
 * own name, matching the old app's own naming (confirmed against the user's real `example-snake`
 * project's `src/falang/falang_global.rs`, e.g. `GameApi_Drawing_DrawRect`). Every API across every
 * `external-api-structure` document flattens into this one method name space, since — unlike
 * cpp/Go/C#, which each get one interface per API — Rust now gets exactly one `Apis` trait (see
 * `emitRustApisTrait`'s own doc comment for why).
 */
export const rustApiMethodName = (endpoint: IExternalApiEndpoint): string =>
  `${endpoint.documentName}_${endpoint.apiName}_${endpoint.name}`;

/**
 * Emits a single flattened `pub trait Apis { fn <ApiDoc>_<Group>_<Endpoint>(&mut self, ...) -> ...; }`
 * covering every API endpoint in the registry — the Rust analogue of `emitCppApiDeclarations`/
 * `emitGoApiDeclarations`, but a single trait rather than one per API. This mirrors the old app's own
 * generated `falang_global.rs` (ADR 0019 (private)'s "Rust target — old-app layout" implementation
 * notes): a project's hand-written host crate implements this one trait once and threads `&mut dyn Apis`
 * through every compiled function as a plain parameter (dependency injection, not a process-global
 * `static`) — the `OnceLock`-guarded-static/one-trait-per-API design this replaces couldn't compile
 * `#![no_std]` (no safe global mutable state without an allocator-backed primitive this target doesn't
 * otherwise need) and required the host to `.set()` every API before calling any compiled code, an
 * ordering footgun the parameter-threading design doesn't have. A project with no APIs at all still
 * emits `pub trait Apis {}` (not nothing) — every compiled function takes `_apis: &mut dyn Apis`
 * unconditionally (`compile-rust-function.ts`), so the trait must exist even when it has zero methods,
 * and the host still needs *some* type to construct to satisfy that parameter.
 */
export const emitRustApisTrait = (
  registry: IExternalApiRegistry,
  structNames: ReadonlyMap<string, string>,
  structDocuments: ReadonlyMap<string, string>,
): string => {
  const methods = [...registry.endpoints.values()].map((endpoint) => {
    const params = [
      '&mut self',
      ...endpoint.parameters.map(
        (parameter) =>
          `${parameter.name}: ${variableInfoToRustParamType(parameter.type, structNames, structDocuments)}`,
      ),
    ].join(', ');
    const returnType = endpoint.returnValue
      ? ` -> ${variableInfoToRustType(endpoint.returnValue, structNames, structDocuments)}`
      : '';
    return `  fn ${rustApiMethodName(endpoint)}(${params})${returnType};`;
  });
  return ['pub trait Apis {', ...methods, '}'].join('\n');
};
