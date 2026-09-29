import type { IModule, Scheme } from '@falang/scheme';
import { ModsSelectorComponent } from './mods-selector.cmp.js';

export class AntModsSelectorModule implements IModule {
  initialize(scheme: Scheme) {
    scheme.extraView.registerCoreSchemeLayer(ModsSelectorComponent);
  }
}
