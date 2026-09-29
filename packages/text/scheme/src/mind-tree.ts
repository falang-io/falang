// oxlint-disable no-console
import type { ISchemeFactoryParams, Scheme } from '@falang/scheme';
import {
  schemeFactory,
  MouseNavigationModule,
  SchemeInfrastructure,
  EditorModule,
  ValencePointsModule,
  CMD_VALENCE_POINT_CLICKED,
  CMD_INSERT_NODE,
  ContextMenuModule,
  type IModule,
  IconsGroup,
  getMindTreeIconConfig,
  TOKEN_CONTEXT_MENU,
  checker,
  IconsTransferModule,
  CMD_DELETE_NODE,
  isIconDeletable,
  BlockResizeModule,
} from '@falang/scheme';
import { NodesGroup, mindTreeCfg } from '@falang/dto';
import { stringDataType } from '@falang/text-dto';
import { htmlBlockConfig } from './blocks/html/html-block.config.js';
import { AntContextMenuModule, AntModsSelectorModule } from '@falang/antd';
import { resolveService } from '@falang/di';

const MIND_TREE_NAME = 'mind-tree';

const getTestInfrastructure = () => {
  const block = htmlBlockConfig;

  const mindTreeNodes = new NodesGroup([
    ...mindTreeCfg({
      name: MIND_TREE_NAME,
      header: stringDataType,
      body: stringDataType,
      thread: stringDataType,
      child: stringDataType,
    }),
  ]);

  const iconsGroup = new IconsGroup(mindTreeNodes, {
    ...getMindTreeIconConfig({
      name: MIND_TREE_NAME,
      header: block,
      body: block,
      thread: block,
      child: block,
    }),
  });

  return new SchemeInfrastructure([iconsGroup]);
};

const infra = getTestInfrastructure();

class MindTreeModule implements IModule {
  register(scheme: Scheme) {
    scheme.commands.registerCommand(CMD_VALENCE_POINT_CLICKED, ({ vp }) => {
      const parentIcon = scheme.icons.getIcon(vp.parentId);
      const nodeConfig = scheme.infra.structure.configsMap.get(parentIcon.name);
      if (!nodeConfig) return false;
      const childName = Array.isArray(nodeConfig.children) ? nodeConfig.children[0] : `${MIND_TREE_NAME}-child`;
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
        items: [`${MIND_TREE_NAME}-child`],
      });
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
        builder.addButtons({
          group: 'root',
          items: [
            {
              type: 'button',
              onClick: () => {
                scheme.commands.dispatchCommand(CMD_DELETE_NODE, { id: icon.id });
              },
              text: 'delete',
            },
          ],
        });
      }
    });
  }
}

export interface IMindTreeSchemeFactoryParams extends Omit<ISchemeFactoryParams, 'infra' | 'modules'> {
  extraModules?: IModule[];
}

export const mindTreeSchemeFactory = ({ extraModules, ...props }: IMindTreeSchemeFactoryParams = {}) => {
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
      new MindTreeModule(),
      new BlockResizeModule(),
      ...(extraModules ?? []),
    ],
  });
  return scheme;
};
