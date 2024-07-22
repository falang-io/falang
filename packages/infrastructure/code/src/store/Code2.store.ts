import { action, comparer, computed, makeObservable, observable } from "mobx";
import React from "react";
import Prism from 'prismjs';

import 'prismjs/components/prism-rust';
import 'prismjs/components/prism-c';
import 'prismjs/components/prism-cpp';
import 'prismjs/components/prism-php';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-markup-templating';
import { CELL_SIZE, FONT_SIZE, LINE_HEIGHT, TEXT_PADDING_HEIGHT, TEXT_PADDING_WIDTH } from '@falang/editor-scheme';
import { getComputedValue } from '@falang/editor-scheme';
import { ShapeStore } from '@falang/editor-scheme';
import { PositionStore } from '@falang/editor-scheme';
import { IBlockInBlock } from '@falang/editor-scheme';
import { EmptyComponent } from '@falang/editor-scheme';
import { Code2EditorComponent } from '../cmp/Code2Editor.cmp';
import { Code2Component } from '../cmp/Code2.cmp';
import { getSpaceWidth, getTextWidth } from '@falang/editor-scheme';
import { SchemeStore } from '@falang/editor-scheme';
import { PrismLanguages } from './PrismLanguages';


interface ITokenInfo {
  value: string
  width: number
  type: string
  breakable: boolean
  className?: string
}

export interface ITokenLineWord {
  x: number
  value: string
  className: string
  breakable: boolean
  width: number
}

interface WordWidthInfo {
  word: string,
  width: number,
}

interface WordsWidthResult {
  wordsWithComputedWidth: WordWidthInfo[],
  spaceWidth: number,
}

interface Line {
  value: string
  width: number
}

export interface Code2StoreParams {
  scheme: SchemeStore,
  code: string,
  language: string
  minHeight?: number
  singleLine?: boolean
  alwaysOnLeft?: boolean
}

export const getCodeWidth = (text: string): number => {
  return getTextWidth(text);
}

const breakableTokens: string[] = ['.', ',', ';'];

export class Code2Store implements IBlockInBlock<Code2Store> {
  readonly scheme: SchemeStore;
  @observable code: string;
  public changed = false;
  readonly shape = new ShapeStore();
  readonly position = new PositionStore();
  readonly language: string;
  readonly minHeight: number;
  readonly singleLine: boolean;
  readonly alwaysOnLeft: boolean;

  constructor(params: Code2StoreParams) {
    this.code = params.code;
    this.language = params.language;
    if (!Prism.languages[PrismLanguages[this.language]]) {
      throw new Error(`Wrong language: '${this.language}', available languages: [${Object.keys(Prism.languages).join(", ")}]`);
    }
    this.scheme = params.scheme;
    this.minHeight = params.minHeight ?? CELL_SIZE * 2;
    this.singleLine = !!params.singleLine;
    this.alwaysOnLeft = typeof params.alwaysOnLeft === 'boolean' ? params.alwaysOnLeft : true;
    this.shape.setHeight(() => this.height);
    makeObservable(this);
  }

  @computed get firstLineWidth(): number {
    const firstLine = this.computedLines[0];
    if (!firstLine.length) return 0;
    const lastItem = firstLine[firstLine.length - 1];
    return lastItem.x + lastItem.width;
  }

  @computed get lineHeight(): number {
    return LINE_HEIGHT * this.scheme.viewPosition.scale;
  }

  @computed get linesCount(): number {
    return this.computedLines.length;
  }

  @action setCode(code: string) {
    if(this.singleLine && code.includes('\n')) {
      code = code.replaceAll('\n', '');
    }
    this.changed = true;
    this.code = code;
  }

  @computed get renderCode2(): boolean {
    return !this.scheme.busy;
  }

  calculateTokenWidth(value: string): number {
    if (value === ' ') {
      return getSpaceWidth();
    }
    return getTextWidth(value);
  }

  @computed get computedLines(): ITokenLineWord[][] {
    const code = this.code;
    const width = this.shape.width - TEXT_PADDING_WIDTH * 2;
    const tokens = this.calculateTokens(code);
    const lines = this.calculateLines(tokens, width);
    return lines;
  }

  @computed get height(): number {
    return Math.max(this.minHeight, TEXT_PADDING_HEIGHT * 2 + this.linesCount * LINE_HEIGHT);
  }

  private calculateLines(tokens: ITokenInfo[], width: number): ITokenLineWord[][] {
    const returnValue: ITokenLineWord[][] = [];
    let currentLine: ITokenLineWord[] = [];
    //let lastTokenWorld: ITokenLineWord | null = [];
    returnValue.push(currentLine);
    let currentX = 0;

    const nextLine = () => {
      currentLine = [];
      currentX = 0;
      returnValue.push(currentLine);
    }

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      const isNeedNextLine = currentX + token.width > width;
      const additionalClassName = token.className ? `${token.className} ` : '';
      switch (token.type) {
        case 'linebreak':
          nextLine();
          break;
        case 'space':
          if (isNeedNextLine) {
            nextLine();
          }
          currentLine.push({
            className: `${additionalClassName}token token-space`,
            value: '',
            x: currentX,
            breakable: true,
            width: getSpaceWidth(),
          });
          currentX += token.width;
          break;
        default:
          if (isNeedNextLine) {
            const lastBreakableIndex = findLastIndex(currentLine, (item) => item.breakable);
            if (lastBreakableIndex === -1) {
              nextLine();
            } else {
              const splicedTokens = currentLine.splice(lastBreakableIndex + 1);
              nextLine();
              if(splicedTokens.length) {
                const firstX = splicedTokens[0].x;
                currentX = splicedTokens.reduce<number>((value, next) => value + next.width, 0);
                splicedTokens.forEach((t) => { t.x -= firstX });
              }
              currentLine.push(...splicedTokens);
            }
          }
          currentLine.push({
            className: `${additionalClassName}token ${token.type}`,
            value: token.value,
            x: currentX,
            breakable: token.breakable,
            width: token.width,
          });
          currentX += token.width;
      }
    }
    return returnValue;
  }

  private calculateTokens(code: string): ITokenInfo[] {
    const returnValue: ITokenInfo[] = [];
    const tokens = Prism.tokenize(code, Prism.languages[PrismLanguages[this.language]]);
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      returnValue.push(...this.processToken(token));
    }
    return returnValue;
  }

  private processToken(token: string | Prism.Token, className?: string): ITokenInfo[] {
    const returnValue: ITokenInfo[] = [];
    if (typeof token === 'string') {
      returnValue.push(...this.processStringToken(token, className));
    } else if (Array.isArray(token.content)) {
      const newClassName = className ? token.type : `${className} ${token.type}`;
      token.content.forEach((item) => {
        returnValue.push(...this.processToken(item, newClassName));
      });
    } else if (['comment', 'string'].includes(token.type)) {
      returnValue.push(...this.processStringToken(token.content.toString(), token.type, className));
    } else {
      const value = token.content.toString();
      returnValue.push({
        breakable: breakableTokens.includes(token.type),
        type: token.type,
        value,
        width: this.calculateTokenWidth(value),
        className,
      });
    }
    return returnValue;
  }

  private processStringToken(value: string, type = 'text', className?: string): ITokenInfo[] {
    if (!value.length) return [];
    const returnValue: ITokenInfo[] = [];
    if (value.indexOf('\n') !== -1) {
      const splitted = value.split('\n');
      for (let i = 0; i < splitted.length; i++) {
        const item = splitted[i];
        returnValue.push(...this.processStringToken(item, type, className));
        if (i < splitted.length - 1) {
          returnValue.push({
            breakable: true,
            type: 'linebreak',
            value: '',
            width: 0,
            className,
          });
        }
      }
    } else if (value.indexOf(' ') !== -1) {
      const splitted = value.split(' ');
      for (let i = 0; i < splitted.length; i++) {
        const item = splitted[i];
        returnValue.push(...this.processStringToken(item, type, className));
        if (i < splitted.length - 1) {
          returnValue.push({
            breakable: true,
            type: 'space',
            value: ' ',
            width: getSpaceWidth(),
            className,
          });
        }
      }
    } else {
      returnValue.push({
        breakable: false,
        type,
        value,
        width: this.calculateTokenWidth(value),
        className,
      });
    }
    return returnValue;
  }

  dispose() {
    this.shape.dispose();
    this.position.dispose();
  }

  getBackground(): React.FC<{ store: Code2Store; }> {
    return EmptyComponent;
  }

  getEditor() {
    return Code2EditorComponent;
  }

  getRenderer(): React.FC<{ store: Code2Store; }> {
    return Code2Component;
  }

  getErrors(): string[] {
    return [];
  }
}

function findLastIndex<T>(array: Array<T>, predicate: (value: T, index: number, obj: T[]) => boolean, startIndex = array.length): number {
  let l = startIndex;
  while (l--) {
    if (predicate(array[l], l, array))
      return l;
  }
  return -1;
}
