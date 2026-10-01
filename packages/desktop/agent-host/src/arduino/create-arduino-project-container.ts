import { container, resolveService, type DependencyContainer } from '@falang/di';
import {
  registerTypescriptProjectService,
  setMonacoLibVariant,
  TOKEN_TYPESCRIPT_PROJECT_SERVICE,
} from '@falang/typescript-scheme';
// Deep import (not the package barrel, which pulls `node:fs` into a renderer bundle).
import { ARDUINO_BUILTIN_DECLARATIONS } from '@falang/desktop-arduino-dto/src/arduino-builtins.js';

/**
 * `app-arduino`'s per-project DI container, exactly as `ArduinoProjectStore`'s constructor builds it.
 *
 * Every Arduino sketch compiles to C++ only, through the same `@falang/logic-constructor` statement compiler the
 * 'logic' project type uses — real JS/TS never runs here either, so the editor gets the portable lib variant, layered with
 * the same Arduino builtin declarations (`digitalWrite`/`millis`/`Serial`/pin constants/…) `compileArduinoProject` feeds
 * `@falang/logic-constructor`'s own type-check via `extraDeclarations` (one shared array, so editor and compile can't
 * drift). The whole UI is light, so the project service's theme is switched explicitly. Needs no Monaco itself.
 *
 * The driver node kinds come from the module-level cache in `@falang/desktop-arduino-scheme`
 * (`initializeDriverRegistry`) — call that once before building schemes.
 */
export const createArduinoProjectContainer = (): DependencyContainer => {
  setMonacoLibVariant('portable', ARDUINO_BUILTIN_DECLARATIONS.join('\n'));
  const child = container.createChildContainer();
  registerTypescriptProjectService(child);
  resolveService(TOKEN_TYPESCRIPT_PROJECT_SERVICE, child).setTheme('light');
  return child;
};
