import type { NodeStore } from '@falang/scheme';
import type { zod } from '@falang/dto';
import type { callApiDto, callFunctionDto, TVariableInfo } from '@falang/typescript-dto';
import { collectScopeVariables, type IScopeVariable } from '@falang/typescript-common';
import { buildHiddenScopeCode } from '../monaco/scope/build-hidden-scope-code.js';
import type { TScopeContributionResolver } from '../monaco/scope/collect-scope-variables.js';
import type { TypescriptProjectService } from '../typescript-project-service/typescript-project.service.js';

type TCallFunctionData = zod.infer<typeof callFunctionDto>;
type TCallApiData = zod.infer<typeof callApiDto>;

/**
 * `call-function`/`call-api`'s `returnVariable` isn't a `SCOPE_CONTRIBUTORS` entry (see
 * `@falang/typescript-common`'s `node-scope-contribution.ts`) because its type is the *target* function/API endpoint's
 * declared return type — only resolvable through this project's `functionsRegistry`/`externalApiRegistry`, which that
 * package can't see. Resolved here instead, from the container-scoped project service (never a global registry).
 */
export const createDynamicScopeResolver =
  (projectService: TypescriptProjectService | null): TScopeContributionResolver =>
  (node): IScopeVariable | undefined => {
    if (!projectService || !node.data) return;
    if (node.name === 'call-function') {
      const { schemeId, returnVariable } = node.data as TCallFunctionData;
      if (!returnVariable) return;
      const target = projectService.functionsRegistry.functions.get(schemeId);
      if (!target?.returnValue || target.returnValue.type === 'void') return;
      return { name: returnVariable, type: { ...target.returnValue, constant: false } };
    }
    if (node.name === 'call-api') {
      const { iconId, returnVariable } = node.data as TCallApiData;
      if (!returnVariable || !iconId) return;
      const endpoint = projectService.externalApiRegistry.endpoints.get(iconId);
      if (!endpoint?.returnValue || endpoint.returnValue.type === 'void') return;
      return { name: returnVariable, type: { ...endpoint.returnValue, constant: false } };
    }
  };

/** Every variable visible at `node` (the scope above it), including call results typed by the project registries. */
export const collectNodeScope = (node: NodeStore, projectService: TypescriptProjectService | null): IScopeVariable[] =>
  collectScopeVariables(node, createDynamicScopeResolver(projectService));

/** The hidden `declare`s (scope variables and struct interfaces) every field of `node` is checked against. */
export const buildNodeScopeCode = (node: NodeStore, projectService: TypescriptProjectService | null): string =>
  buildHiddenScopeCode(collectNodeScope(node, projectService), projectService?.typesRegistry ?? null);

/**
 * The scope plus a forced-type assignment (`_value = `), so whatever expression follows must be of `type` (e.g. a
 * resolved function parameter's declared type) — struct types are declared the way `buildNodeScopeCode` does.
 */
export const buildForcedTypePrefix = (
  node: NodeStore,
  projectService: TypescriptProjectService | null,
  type: TVariableInfo,
): string => {
  const variables = [...collectNodeScope(node, projectService), { name: '_value', type: { ...type, constant: false } }];
  return `${buildHiddenScopeCode(variables, projectService?.typesRegistry ?? null)}_value = \n`;
};
