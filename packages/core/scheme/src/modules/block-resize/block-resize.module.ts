import { Lifecycle } from 'tsyringe';
import { resolveService } from '@falang/di';
import type { Scheme } from '../../scheme/scheme.js';
import type { IModule } from '../../utils/i-module.js';
import { BlockResizeService } from './block-resize.service.js';
import { TOKEN_BLOCK_RESIZE_SERVICE } from './block-resize.service.token.js';
import { initBlockResizeHandlers } from './init-block-resize-handlers.js';
import { ICON_RESIZING_MODE_NAME } from './constants.js';
import { TOKEN_CSS_CLASSES } from '../../di-tokens.js';
import { BlockResizeLayer } from './block-resize.layer.js';

const blockResizeCss = `
  .block-resize-handle {
    position: absolute;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #666;
    border: 1px solid #555;
    border-radius: 2px;
    cursor: ew-resize;
    z-index: 1002;
  }
`;

export class BlockResizeModule implements IModule {
  register(scheme: Scheme) {
    scheme.container.register(TOKEN_BLOCK_RESIZE_SERVICE, BlockResizeService, {
      lifecycle: Lifecycle.ContainerScoped,
    });
    scheme.mode.registerMode({
      name: ICON_RESIZING_MODE_NAME,
    });
    scheme.extraView.registerSchemeLayer(BlockResizeLayer, 100);
  }

  initialize(scheme: Scheme) {
    initBlockResizeHandlers(scheme);
    const css = resolveService(TOKEN_CSS_CLASSES, scheme.container);
    css.addRootExtraCss(() => blockResizeCss);
  }
}
