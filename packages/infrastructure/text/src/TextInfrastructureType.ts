import { IContextMenuItem } from '@falang/frontend-core';
import { SchemeStore } from '@falang/editor-scheme';
import { BlockStore } from '@falang/editor-scheme';
import { IconWithSkewerStore } from '@falang/editor-scheme';
import { IValencePointsRegisterItem } from '@falang/editor-scheme';
import { InfrastructureType } from '@falang/editor-scheme';
import { getTextInfrastructureConfig } from './TextInfrastructure.config';

export class TextInfrastructureType extends InfrastructureType<ReturnType<typeof getTextInfrastructureConfig>> {
  constructor() {
    super(getTextInfrastructureConfig());
  }
/*
  getOnCLickIconForInsert(scheme: SchemeStore): string | IconStore<BlockStore> | null {
    
  }
*/
  getContextMenuForValencePoint(scheme: SchemeStore, vp: IValencePointsRegisterItem): IContextMenuItem[] {
    return super.getContextMenuForValencePoint(scheme, vp);
  }

  protected getContextMenuForSkewer(scheme: SchemeStore, vp: IValencePointsRegisterItem, icon: IconWithSkewerStore): IContextMenuItem[] {
    if(scheme.root.alias !== 'tree') {
      return super.getContextMenuForSkewer(scheme, vp, icon);
    }
    return [];
  }
}
