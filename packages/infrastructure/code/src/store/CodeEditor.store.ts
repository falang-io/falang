import { action, computed, runInAction } from "mobx";
import React from "react";
import { SchemeStore } from '@falang/editor-scheme';
import { CELL_SIZE, FONT_SIZE, LINE_HEIGHT, TEXT_PADDING_HEIGHT, TEXT_PADDING_WIDTH } from '@falang/editor-scheme';
import { CodeStore, codeStyle } from './Code.store';
import { PositionStore } from '@falang/editor-scheme';
import { ShapeStore } from '@falang/editor-scheme';
import { getComputedValue } from '@falang/editor-scheme';

export interface ICodeEditorStoreConstructorParams {
  scheme: SchemeStore,
  language: string,
}

export class CodeEditorStore {
  readonly oldCode: string;
  code: CodeStore
  scheme: SchemeStore
  language: string  

  constructor(store: CodeStore) {
    this.scheme = store.scheme;
    this.language = store.scheme.infrastructure.config.language ?? '';    
    this.code = store;
    this.oldCode = store.code;
  }

  async focusTextarea() {
    for(let i = 0; i < 100; i++) {
      const elements = document.getElementsByClassName('npm__react-simple-code-editor__textarea');
      if(elements.length) {
        (elements[0] as HTMLTextAreaElement).focus();
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  @action setCode(code: string) {
    this.code.setCode(code);
  }


  protected getHeight(): number {
    return this.code.height;
  }

  @action onBlur() {
    this.scheme.editing.stopEdit();
  }

  getTextareaStyle(textX: number, textY: number): React.CSSProperties {
    const { x, y, scale } = this.scheme.viewPosition;
    const left = x + (textX + TEXT_PADDING_WIDTH) * scale;
    const top = y + (textY + TEXT_PADDING_HEIGHT - 1) * scale;
    const fontSize = Math.round(FONT_SIZE * scale);
    const lineHeight = LINE_HEIGHT * scale;
    const height = Math.round((this.code.height - TEXT_PADDING_HEIGHT * 2 + LINE_HEIGHT - FONT_SIZE) * scale);
    const width = Math.round((getComputedValue(this.code.width, 0) - TEXT_PADDING_WIDTH * 2) * scale) - 2;
    return {
      ...codeStyle,
      padding: `0px`,
      border: 'none',
      margin: 0,
      position: 'absolute',
      left: `${left}px`,
      top: `${top}px`,
      width: `${width}px`,
      lineHeight: `${lineHeight}px`,
      fontSize: `${fontSize}px`,
      height: `${height - 3}px`,
    };
  }

  closeWithoutSaving(): void {
    this.code.setCode(this.oldCode);
    this.scheme.editing.stopEdit();
  }

  dispose(): void {

  }

  saveAndClose(): void {
    this.scheme.editing.stopEdit();
  }
}
