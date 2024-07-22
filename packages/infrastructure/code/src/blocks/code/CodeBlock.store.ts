import { computed, makeObservable, runInAction } from "mobx";
import React from "react";

import 'prismjs/components/prism-rust';
import 'prismjs/components/prism-c';
import 'prismjs/components/prism-cpp';
import 'prismjs/components/prism-php';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-markup-templating';
import { CodeBlockComponent } from './CodeBlock.cmp';
import { CodeStore } from '../../store/Code.store';
import { IBlockStoreParams } from '@falang/editor-scheme';
import { SchemeStore } from '@falang/editor-scheme';
import { BlockStore } from '@falang/editor-scheme';


interface CodeBlockStoreParams extends IBlockStoreParams {
  scheme: SchemeStore,
  code: string,
  language: string
}

export const DEFAULT_ALIAS_CODE_BLOCK = 'code'

export class CodeBlockStore extends BlockStore {
  public changed = false;
  readonly codeStore: CodeStore;

  constructor(params: CodeBlockStoreParams) {
    super({
      ...params,
    });
    this.codeStore = new CodeStore({
      code: params.code,
      language: params.language,
      scheme: params.scheme,
    });

    makeObservable(this);
    runInAction(() => {
      this.codeStore.width = () => this.width;
    });
  }

  protected getRenderer() {
    return CodeBlockComponent;
  }

  get code() {
    return this.codeStore.code;
  }

  protected getHeight(): number {
    return this.codeStore.height;
  }

  dispose(): void {
    super.dispose();
    this.codeStore.dispose();
  }
}
