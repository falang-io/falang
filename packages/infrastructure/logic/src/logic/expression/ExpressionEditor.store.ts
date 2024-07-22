import { action, computed, runInAction } from "mobx";
import React from "react";
import { CELL_SIZE, FONT_SIZE, LINE_HEIGHT, TEXT_PADDING_HEIGHT, TEXT_PADDING_WIDTH } from '@falang/editor-scheme';
import { ExpressionStore } from './Expression.store';
import { SchemeStore } from '@falang/editor-scheme';
import { getComputedValue } from '@falang/editor-scheme';
import { codeStyle } from '@falang/infrastructure-code';
import { getInEditorBlockStyle } from '@falang/editor-scheme';
import { getInEditorLineStyle } from '../util/getInEditorLineStyle';

export interface IExpressionEditorStoreConstructorParams {
  scheme: SchemeStore,
  language: string,
}

export class ExpressionEditorStore {
  readonly oldExpression: string;
  expressionStore: ExpressionStore
  scheme: SchemeStore
  language: string

  constructor(store: ExpressionStore) {
    this.scheme = store.scheme;
    this.language = store.scheme.infrastructure.config.language ?? '';    
    this.expressionStore = store;
    this.oldExpression = store.expression;
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

  @action setExpression(code: string) {
    this.expressionStore.setExpression(code);
  }


  protected getHeight(): number {
    return this.expressionStore.height;
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
    const height = Math.round((this.expressionStore.height - TEXT_PADDING_HEIGHT * 2 + LINE_HEIGHT - FONT_SIZE) * scale);
    const width = Math.round((getComputedValue(this.expressionStore.code.width, 0) - TEXT_PADDING_WIDTH * 2) * scale) - 2;
    return {
      ...codeStyle,
      padding: `0px`,
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

  reset(): void {
    this.expressionStore.setExpression(this.oldExpression);
  }

  closeWithoutSaving(): void {
    this.reset();
    this.scheme.editing.stopEdit();
  }

  dispose(): void {

  }

  saveAndClose(): void {
    this.scheme.editing.stopEdit();
  }

  getInEditorLineStyle(textX: number, textY: number): React.CSSProperties {
    return getInEditorLineStyle(this.scheme, textX, textY);
  }

  getInEditorBlockStyle(textX: number, textY: number, textWidth: number, textHeight?: number): React.CSSProperties {
    return getInEditorBlockStyle(this.scheme, textX, textY, textWidth, textHeight);
  }
}
