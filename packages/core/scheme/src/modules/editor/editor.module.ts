import { Lifecycle } from 'tsyringe';
import { resolveService } from '@falang/di';
import type { Scheme } from '../../scheme/scheme.js';
import type { IModule } from '../../utils/i-module.js';
import { EditorService } from './editor.service.js';
import { TOKEN_INLINE_EDITOR_SERVICE } from './editor.service.token.js';
import { initEditorHandlers } from './init-editor-handlers.js';
import { EDITING_INLINE_MODE_NAME } from './constants.js';

export class EditorModule implements IModule {
  private service: EditorService | null = null;

  register(scheme: Scheme) {
    scheme.container.register(TOKEN_INLINE_EDITOR_SERVICE, EditorService, {
      lifecycle: Lifecycle.ContainerScoped,
    });
    scheme.mode.registerMode({
      name: EDITING_INLINE_MODE_NAME,
    });
  }

  initialize(scheme: Scheme) {
    this.service = resolveService(TOKEN_INLINE_EDITOR_SERVICE, scheme.container);
    initEditorHandlers(scheme);
  }

  /**
   * Drops a block editor still open when the scheme goes away (a closed tab, leaving the project) — without saving:
   * the host commits what it wants first (`commitInlineEdit`). An editor left open kept its Monaco models alive, and
   * opening the same node again (models are named after the node id) failed with "Cannot add model because it
   * already exists".
   */
  dispose() {
    this.service?.discardEdit();
    this.service = null;
  }
}
