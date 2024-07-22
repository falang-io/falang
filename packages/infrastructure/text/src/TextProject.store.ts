import { FrontRootStore, IContextMenuItem, IFile } from '@falang/frontend-core';
import { computed, observable, runInAction } from 'mobx';
import { FC } from 'react';
import { checker } from '@falang/editor-scheme';
import { MindTreeRootIconTransformer } from '@falang/editor-scheme';
import { ProjectStore } from '@falang/editor-scheme';
import { SchemeStore } from '@falang/editor-scheme';
import { IValencePointsRegisterItem } from '@falang/editor-scheme';

export class TextProjectStore extends ProjectStore {
  @observable private _rootPath = ''

  constructor(readonly frontRoot: FrontRootStore) {
    super(frontRoot);
  }

  onValencePointClick = (vp: IValencePointsRegisterItem, scheme: SchemeStore) => {
    if(!vp.parentId || vp.index === null) return false;
    const parent = scheme.icons.get(vp.parentId);
    if(!checker.isIconWithList(parent)) return false;
    if(scheme.documentType !== 'tree') return false;
    if(!checker.isIconWithSkewer(parent)) return false;
    const transformer  = scheme.infrastructure.config.icons['tree'].transformer as MindTreeRootIconTransformer;
    const iconForInsert = transformer.threadTransformer.childTransformer.create(scheme);
    scheme.infrastructure.insertIcon(parent, vp.index, iconForInsert);
    return true;
  };

  className = 'LogicProjectStore'


  async reload() {
  }

  get rootPath() {
    return this._rootPath;
  }

  afterFileSaved(path: string, scheme: SchemeStore): void {
    this.reload();
  }

  async init() {
    await this.reload();
  }

  dispose() {
  }

  validateSchemeName(name: string): void {
    /*if (!NameRegep.test(name)) {
      const text = this.frontRoot.lang.t('logic:wrong_scheme_name');
      throw new Error(text);
    }*/
  }

 
  getMenu(): IContextMenuItem[] {
    const t = this.frontRoot.lang.t;
    return [/*{
      text: t('logic:build_code'),
      onClick: () => this.buildCode(),
    }*/];
  }
}

const NameRegep = /^[a-zA-Z][a-zA-Z0-9_-]+$/;
