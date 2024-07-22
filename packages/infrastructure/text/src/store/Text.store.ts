import { action, computed, makeObservable, observable } from 'mobx';
import { CELL_SIZE, FONT_SIZE, LINE_HEIGHT, TEXT_PADDING_HEIGHT, TEXT_PADDING_WIDTH } from '@falang/editor-scheme';
import { getComputedValue } from '@falang/editor-scheme';
import { calculateLines, calculateWordWidths, TextLine, WordsWidthResult } from '@falang/editor-scheme';
import { TComputedProperty } from '@falang/editor-scheme';
import { textStyle } from '../util/textStyle';

export type TTextStoreParams = {
  text?: string
  minHeight?: number
  singleLine?: boolean
};

export class TextStore {
  @observable private _text: string = '';
  @observable.ref width: TComputedProperty<number> = 0;
  public changed = false;
  readonly singleLine: boolean
  readonly minHeight: number;

  constructor(params: TTextStoreParams) {
    makeObservable(this);
    this.setText(params.text ?? '');
    this.minHeight = params.minHeight ?? CELL_SIZE * 2
    this.singleLine = !!params.singleLine;
  }

  protected getHeight(): number {
    return this.singleLine ? CELL_SIZE : Math.max(this.minHeight, this.lines.length * CELL_SIZE);
  }

  get text() {
    return this.getText();
  }

  protected getText() {
    return this._text;
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
    return this.calculateLines(this.wordsWithComputedWidth, getComputedValue(this.width, 0) - TEXT_PADDING_WIDTH * 2)
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

  getTranslateValue(px: number, py: number): string {
    return `translate(${px} ${py})`;
  }

  dispose(): void {
    this.setText('');
    this.width = 0;
  } 
}