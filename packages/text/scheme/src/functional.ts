// oxlint-disable no-console
// oxlint-disable max-lines
import type { ISchemeFactoryParams, Scheme } from '@falang/scheme';
import {
  schemeFactory,
  MouseNavigationModule,
  rectangleShape,
  SchemeInfrastructure,
  simpleIconConfig,
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
  TOKEN_CONTEXT_MENU,
  getParallelIconConfig,
  getPseudoCycleIconNodeConfig,
  checker,
  getWhileIconNodeConfig,
  getContourIconNodeConfig,
  IconsTransferModule,
  getPseudoBlockConfig,
  CELL_SIZE_2,
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
  sideIconConfig,
  timerShape,
  buildModsMenu,
} from '@falang/scheme';
import { getTextGroup } from '@falang/text-dto';
import { AntContextMenuModule, AntModsSelectorModule } from '@falang/antd';
import { resolveService } from '@falang/di';
import { createINodeByName } from '@falang/scheme';
import type { IconStore } from '@falang/scheme';
import type { ContextMenuBuilder } from '@falang/scheme';
import { contourFunctionFooterBlockConfig } from './blocks/contour-function-footer/contour-function-footer.block.config.js';
import { htmlBlockConfig } from './blocks/html/html-block.config.js';
import { linkBlockConfig } from './blocks/link/link-block.config.js';

const getTestInfrastructure = () => {
  const block = htmlBlockConfig;
  const commonIconConfig = {
    block,
    icon: simpleIconConfig,
    shape: rectangleShape,
  };
  /*const foreachConfig = {
    block,
    icon: foreachIconConfig,
    shape: rectangleShape,
  };*/

  const textNodes = getTextGroup();
  const iconsGroup = new IconsGroup(textNodes, {
    action: commonIconConfig,
    link: { block: linkBlockConfig, icon: simpleIconConfig, shape: rectangleShape },
    foreach: getForeachIconNodeConfig({ block }),
    //if: commonIconConfig,
    //mod1: commonIconConfig,
    //out: commonIconConfig,
    //switch: commonIconConfig,
    ...getFunctionIconConfig({
      name: 'function',
      header: block,
      body: block,
      footer: block,
    }),
    ...getIfIconConfig({
      name: 'if',
      block,
    }),
    ...getSwitchIconConfig({
      name: 'switch',
      block,
      child: block,
    }),
    ...getParallelIconConfig('parallel'),
    'pseudo-cycle': getPseudoCycleIconNodeConfig('pseudo-cycle'),
    while: getWhileIconNodeConfig({ block }),
    ...getContourIconNodeConfig({
      name: 'contour',
      data: block,
      finishData: block,
      finishFooterData: block,
      functionData: block,
      functionReturn: contourFunctionFooterBlockConfig,
      header: block,
    }),
    timer: {
      block: { ...block, defaultWidth: CELL_SIZE_2 },
      icon: sideIconConfig,
      shape: timerShape,
      mod: { placement: 'left' },
    },
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

  return new SchemeInfrastructure([iconsGroup]);
};

const infra = getTestInfrastructure();

// Gated by `canHaveOut` (`@falang/scheme`) rather than a bespoke `isWithThreads`/index check — see the
// matching comment in `@falang/typescript-scheme`'s own `buildOutsMenu` for the full writeup of the
// (slightly wider, deliberate) semantics change.
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

class TextFunctionalModule implements IModule {
  register(scheme: Scheme) {
    scheme.commands.registerCommand(CMD_VALENCE_POINT_CLICKED, ({ vp }) => {
      const parentIcon = scheme.icons.getIcon(vp.parentId);
      const nodeConfig = scheme.infra.structure.configsMap.get(parentIcon.name);
      if (!nodeConfig) return false;
      const childName = Array.isArray(nodeConfig.children) ? nodeConfig.children[0] : 'action';
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
      builder.addForIcons({
        group: 'root',
        index: vp.index,
        parentId: vp.parentId,
        items: ['action', 'link', 'if', 'switch', 'foreach', 'parallel', 'pseudo-cycle', 'while'],
      });
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
    contextMenuService.registerBuilderForIcon(buildModsMenu);
  }
}

export interface IFunctionalSchemeFactoryParams extends Omit<ISchemeFactoryParams, 'infra' | 'modules'> {
  extraModules?: IModule[];
}

export const functionalSchemeFactory = ({ extraModules, ...props }: IFunctionalSchemeFactoryParams = {}) => {
  const scheme = schemeFactory({
    ...props,
    infra,
    modules: [
      new MouseNavigationModule(),
      new EditorModule(),
      new ValencePointsModule(),
      new ContextMenuModule(),
      new AntContextMenuModule(),
      new AntModsSelectorModule(),
      new IconsTransferModule(),
      new TextFunctionalModule(),
      new BlockResizeModule(),
      new CoreLocalesModule(),
      ...(extraModules ?? []),
    ],
  });
  return scheme;
};
