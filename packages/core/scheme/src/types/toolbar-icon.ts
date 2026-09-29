import React from 'react';

export const DEFAULT_MODES = {
  START: 'start',
  TRANSFER: 'transfer',
} as const;

export type IDefaultMode = (typeof DEFAULT_MODES)[keyof typeof DEFAULT_MODES];
export type IIconComponent = React.FC<{
  width: number;
  height: number;
}>;

export type IToolbarIcon = IDefaultMode | IIconComponent;
