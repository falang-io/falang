import { IContextMenuItem } from '@falang/frontend-core';
import { checker, generateId } from '@falang/editor-scheme';
import { IconWithSkewerStore } from '@falang/editor-scheme';
import { SchemeStore } from '@falang/editor-scheme';
import { InfrastructureType } from '@falang/editor-scheme';
import { CallFunctionBlockTransformer } from './blocks/call-function/CallFunction.block.transformer';
import { logicChecker } from './logicChecker';
import { getLogicInfrastructureConfig } from './LogicInfrastructure.config';
import { checkerLogic } from '../checker-logic';
import { IconTransformer } from '@falang/editor-scheme';

export class LogicInfrastructureType extends InfrastructureType<ReturnType<typeof getLogicInfrastructureConfig>> {
  constructor() {
    super(getLogicInfrastructureConfig());
  }

  protected getActionsContextMenu(scheme: SchemeStore, index: number, icon: IconWithSkewerStore): IContextMenuItem[] {
    const returnValue = super.getActionsContextMenu(scheme, index, icon);
    const projectStore = scheme.projectStore;
    if (!checkerLogic.isLogicProjectStore(projectStore)) return []
    const functions = projectStore.availableFunctions;
    const apis = projectStore.availableApis;
    const t = scheme.frontRoot.lang.t;
    const functionsMenu: IContextMenuItem[] = [];
    const apisMenu: IContextMenuItem[] = [];
    const transformer = scheme.infrastructure.config.icons['call_function']?.transformer as IconTransformer;
    const blockTransformer = transformer.blockTransformer;
    if (logicChecker.isCallFunctionBlockTransformer(blockTransformer)) {
      functions.forEach((f) => {
        functionsMenu.push({
          text: f.name,
          onClick: () => {
            const id = generateId();
            const block = blockTransformer.createFromFunctionData(scheme, id, f);
            const newIcon = transformer.create(scheme, block, id);
            this.insertIcon(icon, index, newIcon);
          }
        });
      });
    } else {
      console.error('Its no call function block transformer')
    }
    if(functionsMenu.length) {
      returnValue.push({
        text: t('logic:call_function'),
        children: functionsMenu,
      });
    }

    const apiTransformer = scheme.infrastructure.config.icons['call_api']?.transformer as IconTransformer;
    const apiBlockTransformer = apiTransformer.blockTransformer;
    if (logicChecker.isCallFunctionBlockTransformer(apiBlockTransformer)) {
      apis.forEach((f) => {
        apisMenu.push({
          text: f.name,
          onClick: () => {
            const id = generateId();
            const block = apiBlockTransformer.createFromFunctionData(scheme, id, f);
            const newIcon = apiTransformer.create(scheme, block, id);
            this.insertIcon(icon, index, newIcon);
          }
        });
      });
    } else {
      console.error('Its no call function block transformer')
    }

    if(apisMenu.length) {
      returnValue.push({
        text: t('logic:call_api'),
        children: apisMenu,
      });
    }

    return returnValue;
  }
}
