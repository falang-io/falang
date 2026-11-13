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
import { BlockAutoWidthService } from './block-auto-width.service.js';
import { TOKEN_BLOCK_AUTO_WIDTH } from './block-auto-width.service.token.js';

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

export interface IBlockResizeModuleOptions {
  /** Grow a block whose content overflows after an edit or an insert (`BlockAutoWidthService`); on by default. */
  autoWidth?: boolean;
}

export class BlockResizeModule implements IModule {
  private readonly options: IBlockResizeModuleOptions;
  private autoWidthService: BlockAutoWidthService | null = null;

  constructor(options: IBlockResizeModuleOptions = {}) {
    this.options = options;
  }

  register(scheme: Scheme) {
    if (this.options.autoWidth !== false) {
      scheme.container.registerInstance(TOKEN_BLOCK_AUTO_WIDTH, new BlockAutoWidthService(scheme));
    }
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
    if (scheme.container.isRegistered(TOKEN_BLOCK_AUTO_WIDTH, true)) {
      this.autoWidthService = resolveService(TOKEN_BLOCK_AUTO_WIDTH, scheme.container);
      this.autoWidthService.start();
    }
  }

  dispose(): void {
    this.autoWidthService?.dispose();
    this.autoWidthService = null;
  }
}
