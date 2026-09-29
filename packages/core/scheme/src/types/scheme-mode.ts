import type { IToolbarIcon } from './toolbar-icon.js';

export interface ISchemeMode {
  name: string;
  icon?: IToolbarIcon;
  priority?: number;
}
