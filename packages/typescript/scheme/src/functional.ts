// oxlint-disable no-console
// oxlint-disable max-lines
import type { ISchemeFactoryParams, Scheme } from '@falang/scheme';
import {
  schemeFactory,
  MouseNavigationModule,
  rectangleShape,
  SchemeInfrastructure,
  EditorModule,
  ValencePointsModule,
  CMD_VALENCE_POINT_CLICKED,
  CMD_INSERT_NODE,
  ContextMenuModule,
  type IModule,
  IconsGroup,
  getIfIconConfig,
  getSwitchIconConfig,
  getForeachIconNodeConfig,
  getFunctionIconConfig,
  getSimpleIconNodeConfig,
  TOKEN_CONTEXT_MENU,
  getParallelIconConfig,
  getPseudoCycleIconNodeConfig,
  checker,
  getWhileIconNodeConfig,
  IconsTransferModule,
  getPseudoBlockConfig,
  CELL_SIZE_4,
  outIconConfig,
  emptyShape,
  getCycleDepth,
  getParentsIds,
  TOKEN_I18N,
  CMD_SET_OUT,
  CMD_DELETE_NODE,
  isIconDeletable,
  canHaveOut,
  buildSwitchTrueFalseMenu,
  BlockResizeModule,
  CoreLocalesModule,
} from '@falang/scheme';
import { functionNodesGroup } from '@falang/typescript-dto';
import { AntContextMenuModule, AntModsSelectorModule } from '@falang/antd';
import type { DependencyContainer } from '@falang/di';
import { resolveService } from '@falang/di';
import { createINodeByName } from '@falang/scheme';
import type { IconStore } from '@falang/scheme';
import type { ContextMenuBuilder } from '@falang/scheme';
import { TypescriptSchemeLocalesModule } from './locales/typescript-scheme-locales.js';
import { functionBodyBlockConfig } from './blocks/function-body/function-body.block.config.js';
import { textBlockConfig } from './blocks/text/text-block.config.js';
import { createVarBlockConfig } from './blocks/create-var/create-var.block.config.js';
import { arrOpReturningBlockConfig } from './blocks/arr-op-returning/arr-op-returning.block.config.js';
import { arrOpInputBlockConfig } from './blocks/arr-op-input/arr-op-input.block.config.js';
import { arrInsertBlockConfig } from './blocks/arr-insert/arr-insert.block.config.js';
import { arrSliceBlockConfig } from './blocks/arr-slice/arr-slice.block.config.js';
import { callFunctionBlockConfig } from './blocks/call-function/call-function.block.config.js';
import { callApiBlockConfig } from './blocks/call-api/call-api.block.config.js';
import { foreachHeaderBlockConfig } from './blocks/foreach-header/foreach-header.block.config.js';
import { fromToCycleHeaderBlockConfig } from './blocks/from-to-cycle-header/from-to-cycle-header.block.config.js';
import { actionBlockConfig } from './blocks/action/action.block.config.js';
import { logBlockConfig } from './blocks/log/log.block.config.js';
import { ifBlockConfig } from './blocks/if/if.block.config.js';

const getFunctionIconsGroup = () => {
  const block = textBlockConfig;

  return new IconsGroup(functionNodesGroup, {
    'create-var': getSimpleIconNodeConfig(createVarBlockConfig, true),
    action: getSimpleIconNodeConfig(actionBlockConfig, true),
    ...getFunctionIconConfig({
      name: 'function',
      header: block,
      body: functionBodyBlockConfig,
      footer: block,
    }),
    ...getIfIconConfig({
      name: 'if',
      block: ifBlockConfig,
    }),
    foreach: getForeachIconNodeConfig({ block: foreachHeaderBlockConfig }),
    'from-to-cycle': getForeachIconNodeConfig({ block: fromToCycleHeaderBlockConfig }),
    while: getWhileIconNodeConfig({ block }),
    'pseudo-cycle': getPseudoCycleIconNodeConfig('pseudo-cycle'),
    ...getParallelIconConfig('parallel'),
    ...getSwitchIconConfig({
      name: 'switch',
      block,
      child: block,
    }),
    'call-function': getSimpleIconNodeConfig(callFunctionBlockConfig, true),
    'call-api': getSimpleIconNodeConfig(callApiBlockConfig, true),
    log: getSimpleIconNodeConfig(logBlockConfig, true),
    'arr-pop': getSimpleIconNodeConfig(arrOpReturningBlockConfig, true),
    'arr-push': getSimpleIconNodeConfig(arrOpInputBlockConfig, true),
    'arr-shift': getSimpleIconNodeConfig(arrOpReturningBlockConfig, true),
    'arr-insert': getSimpleIconNodeConfig(arrInsertBlockConfig, true),
    'arr-slice': getSimpleIconNodeConfig(arrSliceBlockConfig, true),
    'arr-unshift': getSimpleIconNodeConfig(arrOpInputBlockConfig, true),
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
    // TODO: 'contour' is not part of getFunctionNodesGroup() yet (only getTextGroup() declares it)
    // - add a matching node config to functionNodesGroup before wiring its icon here again.
  });
};

const infra = new SchemeInfrastructure([getFunctionIconsGroup()]);

// Gated by `canHaveOut` (`@falang/scheme`) rather than a bespoke `isWithThreads`/index check — the
// shared helper also enforces this at the action level (`setOutNode`), so the menu and the hard guard
// can never drift apart. Note this is slightly wider than the old "non-first branch of if/switch/
// parallel" check: it's keyed off the node's own DTO position (children[0] of its own parent) rather
// than off being a thread member specifically, so it now also offers `out` at the end of a
// `cycle`("while")/`pseudo-cycle` body whenever that loop isn't itself the first statement of its own
// parent — previously never offered at all for those kinds, since their parent icon is never a
// `ThreadsStore`. See ADR 0035 (private) for the full writeup.
const buildOutsMenu = (scheme: Scheme, parent: IconStore, builder: ContextMenuBuilder) => {
  // `canHaveOut` is the structural rule (a `children[0]` never carries an `out`); the threads check on
  // top of it keeps the menu off `cycle`/`pseudo-cycle` nodes, whose own skewer always reports
  // `isFirst` (only `updateThreadsChildPositions` ever clears it), so an `out` there would render as
  // `SkewerStore.hasOutError`'s red error box.
  if (checker.isWithThreads(parent.parent) && canHaveOut(scheme, parent.id)) {
    const t = resolveService(TOKEN_I18N, scheme.container).t;
    const cycleDepth = getCycleDepth(parent);
    let returnsCount = 1;
    const root = scheme.rootIcon;
    if (checker.isContour(root)) {
      const parentsIds = getParentsIds(parent);
      const parentFunction = root.body.children.find((child) => parentsIds.includes(child.id));
      if (parentFunction) {
        returnsCount = parentFunction.footer.list.iconsIds.length;
      }
    }
    for (let currentCycleDepth = 1; currentCycleDepth <= cycleDepth; currentCycleDepth += 1) {
      builder.addButtons({
        group: 'outs',
        items: [
          {
            onClick: () => {
              const node = createINodeByName('break', scheme, { outLevel: currentCycleDepth });
              scheme.commands.dispatchCommand(CMD_SET_OUT, {
                id: parent.id,
                outNode: node,
              });
            },
            text: `${t('icon:break')}${currentCycleDepth > 1 ? ` ${currentCycleDepth}` : ''}`,
            type: 'button',
          },
          {
            onClick: () => {
              const node = createINodeByName('continue', scheme, { outLevel: currentCycleDepth });
              scheme.commands.dispatchCommand(CMD_SET_OUT, {
                id: parent.id,
                outNode: node,
              });
            },
            text: `${t('icon:continue')}${currentCycleDepth > 1 ? ` ${currentCycleDepth}` : ''}`,
            type: 'button',
          },
        ],
      });
    }
    builder.addButtons({
      group: 'outs',
      items: [
        {
          onClick: () => {
            const node = createINodeByName('throw', scheme);
            scheme.commands.dispatchCommand(CMD_SET_OUT, {
              id: parent.id,
              outNode: node,
            });
          },
          text: t('icon:throw'),
          type: 'button',
        },
      ],
    });
    for (let currentReturnIndex = 1; currentReturnIndex <= returnsCount; currentReturnIndex += 1) {
      builder.addButtons({
        group: 'outs',
        items: [
          {
            onClick: () => {
              const node = createINodeByName('return', scheme, { outLevel: currentReturnIndex });
              scheme.commands.dispatchCommand(CMD_SET_OUT, {
                id: parent.id,
                outNode: node,
              });
            },
            text: `${t('icon:return')}${currentReturnIndex > 1 ? ` ${currentReturnIndex}` : ''}`,
            type: 'button',
          },
        ],
      });
    }
  }
};

class TypescriptFunctionalModule implements IModule {
  private readonly extraInsertableItems: readonly (string | { name: string; label?: string })[];
  private readonly defaultInsertNodeName: () => string;

  constructor(
    extraInsertableItems: readonly (string | { name: string; label?: string })[] = [],
    defaultInsertNodeName: () => string = () => 'action',
  ) {
    this.extraInsertableItems = extraInsertableItems;
    this.defaultInsertNodeName = defaultInsertNodeName;
  }

  register(scheme: Scheme) {
    scheme.commands.registerCommand(CMD_VALENCE_POINT_CLICKED, ({ vp }) => {
      const parentIcon = scheme.icons.getIcon(vp.parentId);
      const nodeConfig = scheme.infra.structure.configsMap.get(parentIcon.name);
      if (!nodeConfig) return false;
      const childName = Array.isArray(nodeConfig.children) ? nodeConfig.children[0] : this.defaultInsertNodeName();
      const newNode = scheme.infra.structure.factory(childName);
      scheme.commands.dispatchCommand(CMD_INSERT_NODE, {
        index: vp.index,
        parentId: vp.parentId,
        node: newNode,
      });
      return true;
    });
  }

  initialize(scheme: Scheme) {
    const contextMenuService = resolveService(TOKEN_CONTEXT_MENU, scheme.container);
    contextMenuService.registerBuilderForValencePoint(({ builder, vp, parent }) => {
      if (!checker.isWithSkewer(parent)) return;
      const t = resolveService(TOKEN_I18N, scheme.container).t;
      const addGroup = (groupKey: string, items: (string | { name: string; label?: string })[]) => {
        if (items.length === 0) return;
        builder.addForIcons({
          group: t(groupKey),
          index: vp.index,
          parentId: vp.parentId,
          items,
        });
      };
      addGroup('menu:group-action', ['create-var', 'action', 'call-function', 'log', 'parallel']);
      addGroup('menu:group-arrays', ['arr-pop', 'arr-push', 'arr-shift', 'arr-insert', 'arr-slice', 'arr-unshift']);
      addGroup('menu:group-condition', ['if', 'switch']);
      addGroup('menu:group-cycles', ['foreach', 'from-to-cycle', 'pseudo-cycle', 'while']);
      addGroup('menu:group-integrations', [...this.extraInsertableItems]);
      const isLastIndex = vp.index === parent.list.iconsIds.length;
      if (isLastIndex) {
        buildOutsMenu(scheme, parent, builder);
      }
    });
    contextMenuService.registerBuilderForIcon(({ icon, builder }) => {
      builder.addButtons({
        group: 'root',
        items: [
          {
            type: 'button',
            onClick: () => {
              console.log(icon);
            },
            text: 'log icon',
          },
        ],
      });
      if (isIconDeletable(scheme, icon.id)) {
        const t = resolveService(TOKEN_I18N, scheme.container).t;
        builder.addButtons({
          group: 'root',
          items: [
            {
              type: 'button',
              onClick: () => {
                scheme.commands.dispatchCommand(CMD_DELETE_NODE, { id: icon.id });
              },
              text: t('menu:delete'),
            },
          ],
        });
      }
    });
    contextMenuService.registerBuilderForIcon(buildSwitchTrueFalseMenu);
  }
}

export interface IFunctionStructureSchemeFactoryParams extends Omit<ISchemeFactoryParams, 'infra'> {
  parentContainer: DependencyContainer;
  extraModules?: IModule[];
  /**
   * Extra `IconsGroup`s merged alongside the base function icons/node-kinds into a fresh
   * `SchemeInfrastructure` (see `@falang/scheme`'s `SchemeInfrastructure` — it merges any number of
   * groups' node configs into one `NodesStack` and their icon configs into one map). Lets a caller
   * (e.g. `@falang/workflow-scheme`) register additional node kinds — `trigger-function`, per-vendor
   * integration actions/triggers — without this package knowing about them. Omit to reuse the
   * memoized default `infra` (no extra `SchemeInfrastructure` allocation).
   */
  extraIconsGroups?: IconsGroup[];
  /** Extra node-kind names appended to the valence-point "add node" menu, alongside the built-in ones. */
  extraInsertableItems?: (string | { name: string; label?: string })[];
  /**
   * Name of the node kind a plain valence-point click inserts under a `children: true` parent (read on every
   * click). Defaults to `'action'`. See ADR 0046 (private) — the magic node.
   */
  defaultInsertNodeName?: () => string;
}

export const functionalSchemeFactory = ({
  parentContainer,
  extraModules,
  extraIconsGroups,
  extraInsertableItems,
  defaultInsertNodeName,
  ...props
}: IFunctionStructureSchemeFactoryParams) => {
  const usedInfra =
    extraIconsGroups && extraIconsGroups.length > 0
      ? new SchemeInfrastructure([getFunctionIconsGroup(), ...extraIconsGroups])
      : infra;
  const scheme = schemeFactory({
    ...props,
    infra: usedInfra,
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
      new TypescriptSchemeLocalesModule(),
      new TypescriptFunctionalModule(extraInsertableItems, defaultInsertNodeName),
      ...(extraModules ?? []),
    ],
    parentContainer,
  });
  return scheme;
};
