import { SchemeStore } from '@falang/editor-scheme';
import { TVariableInfo } from '../constants';
import { LogicProjectStore } from '../LogicProject.store';

export interface IVariableTypeViewComponentParams {  
  variableType: TVariableInfo | null;
  x: number
  y: number
  width: number  
  scheme: SchemeStore
  projectStore: LogicProjectStore,
}

export interface IVariableTypeEditorComponentParams extends IVariableTypeViewComponentParams {  
  setVariableType: (type: TVariableInfo) => void;  
  allowVoid?: boolean
}