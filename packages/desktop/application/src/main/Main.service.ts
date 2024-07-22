import { IMessageBoxService } from '@falang/frontend-core';
import { BrowserWindow, dialog } from 'electron';
import { IMainService } from '../common/IMain.service';
import { IMainContextMenuService } from '../common/IMainContextMenu.service';
import { ContextMenuService } from './ContextMenu.service';
import { FileSystemService } from './Fs.service';
import { MessageBoxService } from './MessageBox.service';

export class MainService implements IMainService {
  readonly fs: FileSystemService
  readonly messageBox: IMessageBoxService;
  readonly contextMenu: IMainContextMenuService;
  events = {};
  methods = {};
  
  constructor(readonly win?: BrowserWindow) {
    this.fs = new FileSystemService(win);
    this.messageBox = new MessageBoxService(win);
    this.contextMenu = new ContextMenuService(win);
  }
}