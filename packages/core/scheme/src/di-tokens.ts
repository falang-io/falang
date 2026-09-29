import { createSchemeToken } from '@falang/di';
import type { CssClassesStore } from './store/css-classes.store.js';
import type { Scheme } from './scheme/scheme.js';
import type { SelectionStore } from './store/selection.store.js';
import type { I18NStore } from './store/i18n.store.js';

export const TOKEN_CSS_CLASSES = createSchemeToken<CssClassesStore>('CSS_CLASSES');
export const TOKEN_SCHEME = createSchemeToken<Scheme>('SCHEME');
export const TOKEN_SELECTION = createSchemeToken<SelectionStore>('SELECTION_STORE');
export const TOKEN_I18N = createSchemeToken<I18NStore>('I18N');
