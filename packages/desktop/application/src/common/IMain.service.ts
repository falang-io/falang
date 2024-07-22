import { IFileSystemService } from '@falang/frontend-core';
import { IContextMenuItem, IContextMenuService, IMessageBoxService } from '@falang/frontend-core';
import { IMainContextMenuService } from './IMainContextMenu.service';

export interface IMainService {
  fs: IFileSystemService
  messageBox: IMessageBoxService
  contextMenu: IMainContextMenuService
  events?: any
  methods?: any
}