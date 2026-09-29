import { resolveService } from '@falang/di';
import type { Scheme } from '../../scheme/scheme.js';
import type { IModule } from '../../utils/i-module.js';
import { ValencePointsService } from './valence-points.service.js';
import { TOKEN_VALENCE_POINTS } from './valence-points.service.token.js';
import { TOKEN_CSS_CLASSES } from '../../di-tokens.js';
import { ValencePointsLayer } from './valence-points.layer.js';

const valencePointsCss = `
  .valence-point {
    position: absolute;
    width: 8px;
    height: 8px;
    border-radius: 4px;
    background: #666;
  }
  .selected-valence-point {
    position: absolute;
    width: 20px;
    height: 20px;
    background: orange;
    border: 1px solid #555;
    border-radius: 11px;
    z-index: 1001;
    cursor: pointer; 
  }
`;

export class ValencePointsModule implements IModule {
  register(scheme: Scheme) {
    scheme.container.registerInstance(TOKEN_VALENCE_POINTS, new ValencePointsService(scheme));
    scheme.extraView.registerSchemeLayer(ValencePointsLayer, 100);
  }

  initialize(scheme: Scheme) {
    const css = resolveService(TOKEN_CSS_CLASSES, scheme.container);
    css.addRootExtraCss(() => valencePointsCss);
  }
}
