import type { IInsertNodeCommandParams } from '../actions/insert-node.js';
import type { ISetDataCommandParams } from '../actions/set-data.js';
import type { ISetMetaCommandParams } from '../actions/set-meta.js';
import type { IDeleteNodeCommandParams } from '../actions/delete-node.js';
import type { IMoveNodesCommandParams } from '../actions/move-nodes.js';
import type { ISetOutNodeCommandParams } from '../actions/set-out-node.js';
import type { SchemeCommand } from './scheme-commands.service.js';
import React from 'react';
import type { IconStore } from '../store/icon.store.js';
import type { IValencePoint } from '../types/valence-point-item.js';

export const createCommand = <T>(type?: string): SchemeCommand<T> => ({ type });

export const CMD_DELETE_NODE = createCommand<IDeleteNodeCommandParams>('DELETE_NODE');
export const CMD_INSERT_NODE = createCommand<IInsertNodeCommandParams>('INSERT_NODE');
export const CMD_MOVE_NODES = createCommand<IMoveNodesCommandParams>('MOVE_NODES');
export const CMD_SET_DATA = createCommand<ISetDataCommandParams>('SET_DATA');
export const CMD_SET_META = createCommand<ISetMetaCommandParams>('SET_META');
export const CMD_SET_OUT = createCommand<ISetOutNodeCommandParams>('SET_OUT');

export const CMD_SCHEME_MOUSE_WHEEL = createCommand<React.WheelEvent<HTMLDivElement>>('SCHEME_MOUSE_WHEEL');
export const CMD_SCHEME_MOUSE_MOVE = createCommand<React.MouseEvent<HTMLDivElement, MouseEvent>>('SCHEME_MOUSE_MOVE');
export const CMD_SCHEME_MOUSE_CLICK = createCommand<React.MouseEvent<HTMLDivElement, MouseEvent>>('SCHEME_MOUSE_CLICK');
export const CMD_SCHEME_MOUSE_DOWN = createCommand<React.MouseEvent<HTMLDivElement, MouseEvent>>('SCHEME_MOUSE_DOWN');
export const CMD_SCHEME_MOUSE_UP = createCommand<React.MouseEvent<HTMLDivElement, MouseEvent>>('SCHEME_MOUSE_UP');
export const CMD_SCHEME_MOUSE_LEAVE = createCommand<React.MouseEvent<HTMLDivElement, MouseEvent>>('SCHEME_MOUSE_LEAVE');
export const CMD_SCHEME_CONTEXT_MENU =
  createCommand<React.MouseEvent<HTMLDivElement, MouseEvent>>('SCHEME_CONTEXT_MENU');

export const CMD_OPEN_SIDEBAR = createCommand<React.FC>('OPEN_SIDEBAR');
export const CMD_CLOSE_SIDEBAR = createCommand<null>('CLOSE_SIDEBAR');

export const CMD_ICON_MOUSE_CLICK = createCommand<{ e: React.MouseEvent<HTMLDivElement, MouseEvent>; icon: IconStore }>(
  'ICON_MOUSE_CLICK',
);

export const CMD_ICON_MOUSE_DOWN = createCommand<{ e: React.MouseEvent<HTMLDivElement, MouseEvent>; icon: IconStore }>(
  'ICON_MOUSE_DOWN',
);

export const CMD_ICON_MOUSE_UP = createCommand<{ e: React.MouseEvent<HTMLDivElement, MouseEvent>; icon: IconStore }>(
  'ICON_MOUSE_UP',
);

export const CMD_ICON_MOUSE_DOUBLE_CLICK = createCommand<{
  e: React.MouseEvent<HTMLDivElement, MouseEvent>;
  icon: IconStore;
}>('ICON_DOUBLE_CLICK');

export const CMD_ICON_CONTEXT_MENU = createCommand<{
  e: React.MouseEvent<HTMLDivElement, MouseEvent>;
  icon: IconStore;
}>('ICON_CONTEXT_MENU');

export const CMD_ICON_MOUSE_OVER = createCommand<{ e: React.MouseEvent<HTMLDivElement, MouseEvent>; icon: IconStore }>(
  'ICON_MOUSE_OVER',
);

export const CMD_ICON_MOUSE_MOVE = createCommand<{ e: React.MouseEvent<HTMLDivElement, MouseEvent>; icon: IconStore }>(
  'ICON_MOUSE_MOVE',
);

export const CMD_BLOCK_RESIZE_HANDLE_MOUSE_DOWN = createCommand<{
  e: React.MouseEvent<HTMLDivElement, MouseEvent>;
}>('BLOCK_RESIZE_HANDLE_MOUSE_DOWN');

export const CMD_VALENCE_POINT_CLICKED = createCommand<{
  e: React.MouseEvent<HTMLDivElement, MouseEvent>;
  vp: IValencePoint;
}>('VALENCE_POINT_CLICKED');

export const CMD_VALENCE_POINT_CONTEXT_MENU = createCommand<{
  e: React.MouseEvent<HTMLDivElement, MouseEvent>;
  vp: IValencePoint;
}>('VALENCE_POINT_CONTEXT_MENU');
