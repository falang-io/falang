import type { IModule, Scheme } from '@falang/scheme';
// import { ModsSelectorComponent } from './mods-selector.cmp.js';

export class AntModsSelectorModule implements IModule {
  initialize(_scheme: Scheme) {
    // Hidden for now: drag-and-drop covers moving icons, so the start/transfer mode switcher looks unnecessary.
    // Transfer mode itself stays registered (and reachable programmatically); re-enable by restoring the line below.
    // scheme.extraView.registerCoreSchemeLayer(ModsSelectorComponent);
  }
}
