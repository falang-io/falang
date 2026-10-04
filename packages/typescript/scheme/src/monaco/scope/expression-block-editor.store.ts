import { resolveService } from '@falang/di';
import { BlockEditorStore, type IBlockEditorFactoryParams, type NodeStore } from '@falang/scheme';
import type { zod } from '@falang/dto';
import type { callApiDto, callFunctionDto, TVariableInfo } from '@falang/typescript-dto';
import { computed } from 'mobx';
import { buildHiddenScopeCode } from './build-hidden-scope-code.js';
import { collectScopeVariables, type TScopeContributionResolver } from './collect-scope-variables.js';
import type { IScopeVariable } from '@falang/typescript-common';
import { TOKEN_TYPESCRIPT_PROJECT_SERVICE } from '../../typescript-project-service/typescript-project.service.token.js';
import type { TypescriptProjectService } from '../../typescript-project-service/typescript-project.service.js';

type TCallFunctionData = zod.infer<typeof callFunctionDto>;
type TCallApiData = zod.infer<typeof callApiDto>;

/**
 * Base for block editor stores that back one or more fields with a monaco `CodeModelStore`.
 * Resolves the enclosing scope once and exposes it as `hiddenScopeCode`, reused by every
 * expression field of the block (see arr-op/arr-insert/arr-slice/call-function/foreach-header/from-to-cycle-header).
 */
export abstract class ExpressionBlockEditorStore<TData> extends BlockEditorStore<TData> {
  protected readonly dataNode: NodeStore;
  protected readonly projectService: TypescriptProjectService | null;

  constructor(params: IBlockEditorFactoryParams<TData>) {
    super(params);
    this.dataNode = params.icon.dataNode;
    try {
      this.projectService = resolveService(TOKEN_TYPESCRIPT_PROJECT_SERVICE, params.container);
    } catch {
      this.projectService = null;
    }
  }

  @computed get hiddenScopeCode(): string {
    const variables = collectScopeVariables(this.dataNode, this.resolveDynamicScopeContribution);
    return buildHiddenScopeCode(variables, this.projectService?.typesRegistry ?? null);
  }

  /**
   * Builds a hidden monaco preamble that type-checks a field's expression against an arbitrary
   * `TVariableInfo` (e.g. a resolved function parameter's declared type), on top of the enclosing
   * scope — struct types are resolved/declared the same way `hiddenScopeCode` does. Reused by any
   * field whose expected type isn't fixed in the node's static schema (see `call-function`'s
   * dynamically-typed parameters, driven by the target function's signature).
   */
  protected buildHiddenPrefixForType(type: TVariableInfo): string {
    const variables = [
      ...collectScopeVariables(this.dataNode, this.resolveDynamicScopeContribution),
      { name: '_value', type: { ...type, constant: false } },
    ];
    const scopeCode = buildHiddenScopeCode(variables, this.projectService?.typesRegistry ?? null);
    return `${scopeCode}_value = \n`;
  }

  /**
   * `call-function`/`call-api`'s `returnVariable` isn't a `SCOPE_CONTRIBUTORS` entry (see
   * `@falang/typescript-common`'s `node-scope-contribution.ts`) because its type is the *target*
   * function/API endpoint's declared return type — only resolvable through this project's
   * `functionsRegistry`/`externalApiRegistry`, which that package can't see. Resolved here instead,
   * where `this.projectService` already gives safe, container-scoped (not global) access to them.
   */
  private readonly resolveDynamicScopeContribution: TScopeContributionResolver = (node): IScopeVariable | undefined => {
    if (!this.projectService || !node.data) return;
    if (node.name === 'call-function') {
      const { schemeId, returnVariable } = node.data as TCallFunctionData;
      if (!returnVariable) return;
      const target = this.projectService.functionsRegistry.functions.get(schemeId);
      if (!target?.returnValue || target.returnValue.type === 'void') return;
      return { name: returnVariable, type: { ...target.returnValue, constant: false } };
    }
    if (node.name === 'call-api') {
      const { iconId, returnVariable } = node.data as TCallApiData;
      if (!returnVariable || !iconId) return;
      const endpoint = this.projectService.externalApiRegistry.endpoints.get(iconId);
      if (!endpoint?.returnValue || endpoint.returnValue.type === 'void') return;
      return { name: returnVariable, type: { ...endpoint.returnValue, constant: false } };
    }
  };
}
