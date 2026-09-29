import { Lifecycle } from 'tsyringe';
import type { Scheme } from '../../scheme/scheme.js';
import type { IModule } from '../../utils/i-module.js';
import { EditorService } from './editor.service.js';
import { TOKEN_INLINE_EDITOR_SERVICE } from './editor.service.token.js';
import { initEditorHandlers } from './init-editor-handlers.js';
import { EDITING_INLINE_MODE_NAME } from './constants.js';

export class EditorModule implements IModule {
  register(scheme: Scheme) {
    scheme.container.register(TOKEN_INLINE_EDITOR_SERVICE, EditorService, {
      lifecycle: Lifecycle.ContainerScoped,
    });
    scheme.mode.registerMode({
      name: EDITING_INLINE_MODE_NAME,
    });
  }

  initialize(scheme: Scheme) {
    initEditorHandlers(scheme);
  }
}
