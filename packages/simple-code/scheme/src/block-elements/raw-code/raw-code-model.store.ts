import type { editor } from 'monaco-editor';
import type monaco from 'monaco-editor';
import { action, makeObservable, observable } from 'mobx';
import { getMonaco } from '@falang/typescript-scheme';
import { CODE_FILE_EXTENSIONS, type TCodeLanguage } from '@falang/simple-code-dto';
import { monacoLanguageId, registerCodeLanguages } from './monaco-languages.js';

export interface IRawCodeModelParams {
  id: string;
  language: TCodeLanguage;
  value?: string;
  name?: string;
}

/**
 * A plain, per-instance Monaco model for one `code`-domain leaf field — no `hiddenPrefix`/hidden
 * areas, no TS diagnostics/`hasErrors` (unlike `@falang/typescript-scheme`'s `CodeModelStore`,
 * which this intentionally does not reuse: it is hard-wired to the real, always-validated
 * `'typescript'` language id). Syntax highlighting only, per `language`.
 */
export class RawCodeModelStore {
  readonly monaco: typeof monaco;
  readonly model: editor.ITextModel;
  readonly language: TCodeLanguage;
  @observable value: string;
  editor: editor.IStandaloneCodeEditor | null = null;

  constructor({ id, language, value, name }: IRawCodeModelParams) {
    this.language = language;
    this.value = value ?? '';
    const monacoApi = getMonaco();
    this.monaco = monacoApi;
    registerCodeLanguages(monacoApi);
    const fileName = `file:///${id}${name ? `-${name}` : ''}.${CODE_FILE_EXTENSIONS[language]}`;
    this.model = monacoApi.editor.createModel(this.value, monacoLanguageId(language), monacoApi.Uri.parse(fileName));
    makeObservable(this);
  }

  @action setValue(value: string): void {
    this.value = value;
    this.model.setValue(value);
  }

  /** Called on `onDidChangeModelContent` to pull the editor's live content back into `value`. */
  @action updateValue(): void {
    this.value = this.model.getValue();
  }

  setEditor(editorInstance: editor.IStandaloneCodeEditor | null): void {
    this.editor = editorInstance;
  }

  dispose(): void {
    this.model.dispose();
  }
}
