import { resolveService } from '@falang/di';
import type { Scheme } from '../../scheme/scheme.js';
import type { IModule } from '../../utils/i-module.js';
import { IconsTransferService } from './icons-transfer.service.js';
import { TOKEN_ICONS_TRANSFER_SERVICE } from './icons-transfer.service.token.js';
import { DEFAULT_MODES } from '../../types/toolbar-icon.js';
import { initIconsTransferHandlers } from './init-icons-transfer-handlers.js';
import { ICONS_DRAGGING_MODE_NAME } from './constants.js';
import { IconsDragLayer } from './icons-drag.layer.js';
import { TOKEN_CSS_CLASSES } from '../../di-tokens.js';

const iconsDragCss = `
  .icons-drag-layer {
    position: absolute;
    left: 0;
    top: 0;
    z-index: 1000;
    pointer-events: none;
  }
  .icons-drag-layer div.block-body.drag-ghost {
    background: transparent;
    border-style: dashed;
    opacity: 0.6;
  }
  .icons-drag-layer svg .block-body.drag-ghost {
    fill: none;
    stroke-dasharray: 4 3;
    opacity: 0.6;
  }
`;

export class IconsTransferModule implements IModule {
  register(scheme: Scheme) {
    scheme.container.registerInstance(TOKEN_ICONS_TRANSFER_SERVICE, new IconsTransferService(scheme));
    scheme.mode.registerMode({
      name: DEFAULT_MODES.TRANSFER,
      icon: 'transfer',
    });
    // No icon: the private dragging mode never shows up in the mode selector (same as ICON_RESIZING_MODE_NAME).
    scheme.mode.registerMode({
      name: ICONS_DRAGGING_MODE_NAME,
    });
    // 50 < the valence-points layer's 100: layers render in descending priority order, so the ghost renders after
    // (above) the valence points; its z-index 1000 stays one below `.selected-valence-point`'s 1001.
    scheme.extraView.registerSchemeLayer(IconsDragLayer, 50);
  }

  initialize(scheme: Scheme) {
    initIconsTransferHandlers(scheme);
    resolveService(TOKEN_CSS_CLASSES, scheme.container).addRootExtraCss(() => iconsDragCss);
  }
}
