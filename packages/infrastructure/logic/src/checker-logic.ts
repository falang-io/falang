import { LogicBaseBlockStore } from './logic/blocks/logic-base/LogicBaseBlock.store';
import { LogicProjectStore } from './logic/LogicProject.store';

export const checkerLogic = {
  isLogicProjectStore(store: any): store is LogicProjectStore {
    return store && store.className === 'LogicProjectStore';
  },
  isLogicBaseBlockStore(store: any): store is LogicBaseBlockStore {
    return store && store.isLogicBaseBlockStore == true;
  },
}