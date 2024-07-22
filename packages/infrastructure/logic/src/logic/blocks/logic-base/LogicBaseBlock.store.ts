import { computed, makeObservable } from 'mobx';
import { BlockStore, IBlockStoreParams } from '@falang/editor-scheme';
import { checkerLogic } from '../../../checker-logic';
import { IUnionTypeInfo, TContext, TEnumTypeVariant } from '../../constants';
import { getContextForIcon } from '../../util/getContextForIcon';
import { AutocompleteOption } from '@falang/infrastructure-code';
import { LogicProjectStore } from '../../LogicProject.store';

export class LogicBaseBlockStore extends BlockStore {
  readonly isLogicBaseBlockStore = true;
  constructor(params: IBlockStoreParams) {
    super(params);
    makeObservable(this);
  }
  protected getExportedVariables(): TContext {
    return {};
  }

  @computed get exportedVariables() {
    return this.getExportedVariables();
  }

  @computed get context(): TContext {
    return this.getContext();
  }

  get scopeVariables() {
    return this.getScopeVariables();
  }

  protected getScopeVariables(): TContext {
    return {};
  }

  protected getContext(): TContext {
    const scheme = this.scheme;
    const icon = scheme.icons.getSafe(this.id);
    if (!icon) return {};
    return getContextForIcon(icon);
  }

  getAutoComplete(code: string, index: number, extraContext?: TContext): AutocompleteOption[] {
    return this.getScalarAutoComplete(code, index, extraContext);
  }  

  protected getScalarAutoComplete(code: string, index: number, extraContext?: TContext): AutocompleteOption[] {
    const text = code.substring(0, index);
    //text.match(/[a-zA-Z][a-zA-Z0-9\[\]\]\.]*$/);
    const matchResult = text.match(/[a-zA-Z][a-zA-Z0-9\.]*$/);
    if (!matchResult) return [];
    const result = matchResult[0];
    const context = {
      ...this.context,
      ...extraContext ?? {},
    };  

    if (!result.includes('.')) {
      const foundVars = Object.keys(context).filter(k => k.startsWith(result));
      return foundVars.map((varName) => {
        return {
          comment: '',
          text: varName,
          toInsert: varName.substring(result.length),
        }
      })
    }

    const dottedItems = result.split('.');
    let currentObjectInfo = context[dottedItems[0]];
    if(!currentObjectInfo) return [];
    for(let i = 1; i < dottedItems.length; i++) {
      if(currentObjectInfo.type !== 'struct') return [];
      const struct = this.projectStore.getStructByType(currentObjectInfo);
      if(!struct) break;
      if(i === dottedItems.length - 1) {
        const foundVars = Object.keys(struct.properties).filter(k => dottedItems[i].length ? k.startsWith(dottedItems[i]) : true);
        console.log(foundVars, currentObjectInfo);
        return foundVars.map((varName) => {
          return {
            comment: '',
            text: varName,
            toInsert: varName.substring(dottedItems[i].length),
          }
        })
      }
      currentObjectInfo = struct.properties[dottedItems[i]];
      if(!currentObjectInfo) return [];
    }

    /*
    let varInfo: TVariableInfo | null = null;

    while(dottedIndex < dottedItems.length) {

    }*/
    return [];
  }


  get projectStore(): LogicProjectStore {
    const store = this.scheme.projectStore;
    if(!checkerLogic.isLogicProjectStore(store)) throw new Error('Should be logic store');
    return store;
  }
}