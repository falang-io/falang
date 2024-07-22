import { action, computed, makeObservable, observable } from 'mobx';
import { FC } from 'react';
import { EmptyComponent } from '@falang/editor-scheme';
import { CELL_SIZE, FONT_SIZE, LINE_HEIGHT, TEXT_PADDING_HEIGHT, TEXT_PADDING_WIDTH } from '@falang/editor-scheme';
import { IBlockInBlock } from '@falang/editor-scheme';
import { getComputedValue } from '@falang/editor-scheme';
import { PositionStore } from '@falang/editor-scheme';
import { ShapeStore } from '@falang/editor-scheme';
import { TNumberComputed } from '@falang/editor-scheme';
import { SchemeStore } from '@falang/editor-scheme';
import { Text2Component } from '../cmp/Text2.cmp';
import { Text2EditorComponent } from '../cmp/Text2.editor.cmp';
import { calculateWordWidths, calculateLines, WordsWidthResult, TextLine } from '@falang/editor-scheme';

export type TSingleLineAlign = 'left' | 'middle';

export type TText2StoreParams = {
  text?: string
  minHeight?: number
  singleLine?: boolean
  singleLineAlign?: TSingleLineAlign
  scheme: SchemeStore;
  computedText?: () => string;
};

export class Text2Store implements IBlockInBlock<Text2Store> {
  readonly scheme: SchemeStore;
  @observable private _text: string = '';
  readonly position = new PositionStore();
  readonly shape = new ShapeStore();
  public changed = false;
  readonly singleLine: boolean
  readonly minHeight: number;
  readonly singleLineAlgin: TSingleLineAlign;
  private readonly computedText: (() => string) | null;

  constructor(params: TText2StoreParams) {
    makeObservable(this);
    this.setText(params.text ?? '');
    this.scheme = params.scheme;
    this.minHeight = params.minHeight ?? CELL_SIZE * 2;
    this.singleLine = !!params.singleLine;
    this.singleLineAlgin = params.singleLineAlign ?? 'middle';
    this.shape.setHeight(() => this.getHeight());
    this.computedText = params.computedText ?? null;
  }

  protected getHeight(): number {
    return this.singleLine ? this.minHeight : Math.max(this.minHeight, this.lines.length * CELL_SIZE);
  }

  get text() {
    return this.getText();
  }

  protected getText() {
    return this.computedText ? this.computedText() : this._text;
  }

  get editable() {
    return !this.computedText;
  }

  setWidth(width: TNumberComputed) {
    this.shape.setWidth(width);
  }


  @computed get startX(): number {
    return TEXT_PADDING_WIDTH;
  }

  @computed get startY(): number {
    return (TEXT_PADDING_HEIGHT + FONT_SIZE);
  }

  @computed get wordsWithComputedWidth(): WordsWidthResult[] {
    return this.calculateWordWidths(this.text);
  }

  @computed get lines(): TextLine[] {
    return this.calculateLines(this.wordsWithComputedWidth, getComputedValue(this.shape.width, 0) - TEXT_PADDING_WIDTH * 2)
  }


  @computed get firstLineWidth(): number {
    return this.wordsWithComputedWidth[0]?.wordsWithComputedWidth[0]?.width ?? 0;
  }

  @computed get lineHeight(): number {
    return LINE_HEIGHT;
  }

  @computed get linesCount(): number {
    return this.lines.length;
  }

  @action setText(text: string) {
    this.changed = true;
    const newText = (this.singleLine && text.includes('\n')) ? text.replaceAll('\n', '') : text;
    //console.log('newText', newText);
    try {
      this._text = newText;
    } catch (err) {
      console.log('bad error');
      console.error(err);
    }
    
  }

  private calculateWordWidths(text: string): WordsWidthResult[] {
    return calculateWordWidths(text);
  }

  private calculateLines(result: WordsWidthResult[], lineWidth: number): TextLine[] {
    return calculateLines(result, lineWidth);
  }

  getTranslateValue(): string {
    return `translate(${this.position.x} ${this.position.y})`;
  }

  dispose(): void {
    this.setText('');
    this.position.dispose();
    this.shape.dispose();
  } 

  getBackground(): FC<{ store: Text2Store; }> {
    return this.editable ? EmptyComponent: Text2Component;
  }

  getEditor(): FC<{ store: Text2Store; }> {
    return this.editable ? Text2EditorComponent : EmptyComponent;
  }
  getRenderer(): FC<{ store: Text2Store; }> {
    return this.editable ? Text2Component : EmptyComponent;
  }

  getErrors(): string[] {
    return [];
  }
}