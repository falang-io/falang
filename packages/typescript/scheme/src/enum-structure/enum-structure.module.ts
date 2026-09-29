// oxlint-disable no-console
import type { Scheme } from '@falang/scheme';
import {
  CMD_VALENCE_POINT_CLICKED,
  CMD_INSERT_NODE,
  type IModule,
  TOKEN_CONTEXT_MENU,
  checker,
  CMD_DELETE_NODE,
  isIconDeletable,
  TOKEN_VALENCE_POINTS,
} from '@falang/scheme';
import { resolveService } from '@falang/di';
import { ENUM_STRUCTURE_NAME } from '@falang/typescript-dto';

export class TypescriptEnumStructureModule implements IModule {
  register(scheme: Scheme) {
    scheme.commands.registerCommand(CMD_VALENCE_POINT_CLICKED, ({ vp }) => {
      const parentIcon = scheme.icons.getIcon(vp.parentId);
      const nodeConfig = scheme.infra.structure.configsMap.get(parentIcon.name);
      if (!nodeConfig) return false;
      const childName = Array.isArray(nodeConfig.children) ? nodeConfig.children[0] : `${ENUM_STRUCTURE_NAME}-child`;
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
        items: [`${ENUM_STRUCTURE_NAME}-child`],
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

    const valencePointsService = resolveService(TOKEN_VALENCE_POINTS, scheme.container);
    valencePointsService.addValencePointsFilter(`${TypescriptEnumStructureModule.name}-filter`, (points) =>
      points.filter((vp) => {
        const parentIcon = scheme.icons.getIconSafe(vp.parentId);
        return parentIcon?.name !== `${ENUM_STRUCTURE_NAME}-child`;
      }),
    );
  }
}
