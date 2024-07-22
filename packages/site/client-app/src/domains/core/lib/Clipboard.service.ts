import { IClipboardService } from '@falang/frontend-core';

export const getClipboardService = (): IClipboardService => {
  return {
    getValue() {
      return navigator.clipboard.readText();
    },
    setValue(value: string) {
      return navigator.clipboard.writeText(value);
    }
  }
}