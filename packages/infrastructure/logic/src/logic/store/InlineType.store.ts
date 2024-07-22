import { action, makeObservable, observable } from 'mobx';
import { FC } from 'react';
import { checker } from '@falang/editor-scheme';
import { EmptyComponent } from '@falang/editor-scheme';
import { IBlockInBlock } from '@falang/editor-scheme';
import { PositionStore } from '@falang/editor-scheme';
import { ShapeStore } from '@falang/editor-scheme';
import { SchemeStore } from '@falang/editor-scheme';
import { InlineType2ViewComponent } from '../cmp/InlineType2.cmp';
import { InlineType2EditorComponent } from '../cmp/InlineTypeEditor2.cmp';
import { InlineTypeViewComponent } from '../cmp/InlineTypeView.cmp';
import { TypeView2Component } from '../cmp/TypeView2.cmp';
import { TVariableInfo } from '../constants';
import { LogicProjectStore } from '../LogicProject.store';
import { getInlineTypeHeight } from '../util/getInlineTypeHeight';

export interface IInlineStoreParams {
  type: TVariableInfo
  allowVoid?: boolean
  scheme: SchemeStore
  projectStore: LogicProjectStore
}

export class InlineTypeStore implements IBlockInBlock<InlineTypeStore> {
  @observable private _variableType: TVariableInfo;
  readonly allowVoid: boolean;
  readonly shape = new ShapeStore();
  readonly position = new PositionStore();
  readonly scheme: SchemeStore;
  readonly projectStore: LogicProjectStore

  constructor(params: IInlineStoreParams) {
    this._variableType = params.type;
    this.allowVoid = typeof params.allowVoid === 'boolean' ? params.allowVoid : false;
    this.scheme = params.scheme;    
    makeObservable(this);
    this.shape.setHeight(() => getInlineTypeHeight(this._variableType));
    this.projectStore = params.projectStore;
  }

  get() {
    return this._variableType;
  }

  @action set(type: TVariableInfo) {
    this._variableType = type;
  }

  dispose(): void {
    this.shape.dispose();
    this.position.dispose();
  }

  getBackground(): FC<{ store: InlineTypeStore; }> {
    return EmptyComponent;
  }

  getEditor(): FC<{ store: InlineTypeStore; }> {
    return InlineType2EditorComponent;
  }

  getRenderer(): FC<{ store: InlineTypeStore; }> {
    return TypeView2Component;
  }

  getErrors(): string[] {
    return [];
  }


}