import { IconStore } from '../icons/base/Icon.store'
import { SchemeStore } from '../store/Scheme.store';
import { IconType } from 'react-icons';

export interface IDocumentTypeConfig {
  name: string
  infrastructure: string
  createEmpty(scheme: SchemeStore): IconStore
  icon?: IconType
}

export interface IProjectTypeConfig {
  name: string
  documentsConfig: IDocumentTypeConfig[]
  sideBarEditor: React.FC<{ scheme: SchemeStore }> | null
  editableIconColor?: boolean
}
