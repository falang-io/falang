import type { IModule, ISchemeFactoryParams, Scheme } from '@falang/scheme';
import {
  BlockResizeModule,
  CELL_SIZE_4,
  ContextMenuModule,
  CoreLocalesModule,
  EditorModule,
  emptyShape,
  getForeachIconNodeConfig,
  getFunctionIconConfig,
  getIfIconConfig,
  getPseudoBlockConfig,
  getPseudoCycleIconNodeConfig,
  getSimpleIconNodeConfig,
  getSwitchIconConfig,
  getWhileIconNodeConfig,
  IconsGroup,
  IconsTransferModule,
  MouseNavigationModule,
  outIconConfig,
  rectangleShape,
  schemeFactory,
  SchemeInfrastructure,
  ValencePointsModule,
} from '@falang/scheme';
import { AntContextMenuModule, AntModsSelectorModule } from '@falang/antd';
import type { DependencyContainer } from '@falang/di';
import { CODE_ROOT_NODE_NAME, codeFunctionNodesGroup, type TCodeLanguage } from '@falang/simple-code-dto';
import { CodeFunctionalModule } from './code-functional.module.js';
import { getRawCodeBlockConfig } from './blocks/raw-code/raw-code-block.config.js';

const getCodeIconsGroup = (language: TCodeLanguage) => {
  const block = getRawCodeBlockConfig(language);

  return new IconsGroup(codeFunctionNodesGroup, {
    action: getSimpleIconNodeConfig(block),
    ...getFunctionIconConfig({
      name: CODE_ROOT_NODE_NAME,
      header: block,
      body: block,
      footer: block,
    }),
    ...getIfIconConfig({
      name: 'if',
      block,
    }),
    foreach: getForeachIconNodeConfig({ block }),
    while: getWhileIconNodeConfig({ block }),
    'pseudo-cycle': getPseudoCycleIconNodeConfig('pseudo-cycle'),
    ...getSwitchIconConfig({
      name: 'switch',
      block,
      child: block,
    }),
    throw: {
      block,
      icon: outIconConfig,
      shape: rectangleShape,
    },
    return: {
      block,
      icon: outIconConfig,
      shape: rectangleShape,
    },
    continue: {
      block: getPseudoBlockConfig('icon:continue', CELL_SIZE_4),
      icon: outIconConfig,
      shape: emptyShape,
    },
    break: {
      block: getPseudoBlockConfig('icon:break', CELL_SIZE_4),
      icon: outIconConfig,
      shape: emptyShape,
    },
  });
};

/** One `SchemeInfrastructure` per language, memoized — each language's `code`-function document
 * gets its own `NodesStack` (same node *names* across languages, but they never share a document,
 * so no collision), differing only in which raw-code block config (and therefore monaco language
 * id) its blocks resolve to. */
const infraByLanguage = new Map<TCodeLanguage, SchemeInfrastructure>();

const getInfra = (language: TCodeLanguage): SchemeInfrastructure => {
  const cached = infraByLanguage.get(language);
  if (cached) return cached;
  const infra = new SchemeInfrastructure([getCodeIconsGroup(language)]);
  infraByLanguage.set(language, infra);
  return infra;
};

export interface ICodeFunctionalSchemeFactoryParams extends Omit<ISchemeFactoryParams, 'infra' | 'modules'> {
  parentContainer: DependencyContainer;
  language: TCodeLanguage;
  /** Extra modules appended to the base module set — e.g. `HistoryModule`/`AgentModule` for the desktop `code` project type's own agent wiring (see ADR 0026 (private)). */
  extraModules?: IModule[];
}

export const codeFunctionalSchemeFactory = ({
  language,
  parentContainer,
  extraModules,
  ...props
}: ICodeFunctionalSchemeFactoryParams): Scheme =>
  schemeFactory({
    ...props,
    infra: getInfra(language),
    modules: [
      new MouseNavigationModule(),
      new EditorModule(),
      new ValencePointsModule(),
      new ContextMenuModule(),
      new AntContextMenuModule(),
      new AntModsSelectorModule(),
      new IconsTransferModule(),
      new BlockResizeModule(),
      new CoreLocalesModule(),
      new CodeFunctionalModule(),
      ...(extraModules ?? []),
    ],
    parentContainer,
  });
