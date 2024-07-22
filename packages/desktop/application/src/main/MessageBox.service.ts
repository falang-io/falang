import { IMessageBoxService, IShowMessageBoxParams } from '@falang/frontend-core';
import { BrowserWindow, dialog } from 'electron';

export class MessageBoxService implements IMessageBoxService {
  constructor(readonly win?: BrowserWindow) { }

  show = async ({ text, buttons }: IShowMessageBoxParams) => {
    if (!this.win) return null;
    const result = await dialog.showMessageBox(this.win, {
      message: text,
      buttons,
      type: 'question'
    })
    return result.response;
  }
}
