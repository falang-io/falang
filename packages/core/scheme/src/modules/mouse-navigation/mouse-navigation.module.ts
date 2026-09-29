import type { Scheme } from '../../scheme/scheme.js';
import type { IModule } from '../../utils/i-module.js';
import { registerMouseNavigationHandlers } from './register-mouse-navigation-handlers.js';

export class MouseNavigationModule implements IModule {
  initialize(scheme: Scheme) {
    registerMouseNavigationHandlers(scheme);
  }
}
