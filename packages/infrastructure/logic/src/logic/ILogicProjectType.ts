import { SchemeStore } from '@falang/editor-scheme'
import { IObjectInfo } from './constants'

export interface ILogicProjectType {
  isLogicProjectType: true
  getAvailableStructures(scheme: SchemeStore): Promise<IStructureTypeItem[]>
}

export interface IStructureTypeItem extends IObjectInfo {
  name: string
  schemeName: string
  schemeId: string
  iconId: string
  path: string
}

export const isLogicProjectType = (variable: any): variable is ILogicProjectType => {
  return variable.isLogicProjectType === true;
}
