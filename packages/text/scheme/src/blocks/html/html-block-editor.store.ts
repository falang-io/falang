import { BlockEditorStore, type IBlockEditorFactoryParams } from '@falang/scheme';
import type { LexicalEditor } from 'lexical';
import { action, makeObservable, observable } from 'mobx';
import { nodesToHtml } from './lexical/html-io.js';

export class HtmlBlockEditorStore extends BlockEditorStore<string> {
  @observable.ref lexicalEditor: LexicalEditor | null = null;

  constructor(params: IBlockEditorFactoryParams<string>) {
    super(params);
    makeObservable(this);
  }

  @action setLexicalEditor(editor: LexicalEditor | null) {
    this.lexicalEditor = editor;
  }

  getData(): string {
    if (!this.lexicalEditor) return typeof this.initialData === 'string' ? this.initialData : '';
    return nodesToHtml(this.lexicalEditor);
  }

  override dispose() {
    this.lexicalEditor = null;
  }
}
