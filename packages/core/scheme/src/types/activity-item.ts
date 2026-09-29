import React from 'react';
import type { IToolbarIcon } from './toolbar-icon.js';

export interface IActivityItem {
  name: string;
  icon: IToolbarIcon;
  view: React.FC;
  priority: number;
}
