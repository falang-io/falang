import type { IBlockEditorFactoryParams } from '@falang/scheme';
import { ActionEditorStore } from '../action/action-editor.store.js';
import { decodeLegacyHtml } from './decode-legacy-html.js';

/** A scope-aware code editor for fields that were plain HTML text before (see `decodeLegacyHtml`). */
export class ExpressionEditorStore extends ActionEditorStore {
  constructor(params: IBlockEditorFactoryParams<string>) {
    super({ ...params, data: decodeLegacyHtml(params.data ?? '') });
  }
}
