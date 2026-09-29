import type { Scheme } from '../../scheme/scheme.js';
import type { IconStore } from '../../store/icon.store.js';
import type { IValencePoint } from '../../types/valence-point-item.js';
import { ContextMenuBuilder } from './context-menu.builder.js';

export interface IContextMenuBuilderForIconParams {
  builder: ContextMenuBuilder;
  icon: IconStore;
  scheme: Scheme;
}

export interface IContextMenuBuilderForValencePointParams {
  builder: ContextMenuBuilder;
  vp: IValencePoint;
  parent: IconStore;
  scheme: Scheme;
}

export type IContextMenuBuilderForIcon = (params: IContextMenuBuilderForIconParams) => void;
export type IContextMenuBuilderForValencePoint = (params: IContextMenuBuilderForValencePointParams) => void;

export class ContextMenuService {
  private iconBuilders: IContextMenuBuilderForIcon[] = [];
  private valencePointBuilders: IContextMenuBuilderForValencePoint[] = [];

  registerBuilderForIcon(builder: IContextMenuBuilderForIcon) {
    this.iconBuilders.push(builder);
  }

  registerBuilderForValencePoint(builder: IContextMenuBuilderForValencePoint) {
    this.valencePointBuilders.push(builder);
  }

  buildForIcon(params: Omit<IContextMenuBuilderForIconParams, 'builder'>) {
    const builder = new ContextMenuBuilder(params.scheme);
    this.iconBuilders.forEach((b) =>
      b({
        ...params,
        builder,
      }),
    );
    return builder.getMenu();
  }

  buildForValencePoint(params: Omit<IContextMenuBuilderForValencePointParams, 'builder'>) {
    const builder = new ContextMenuBuilder(params.scheme);
    this.valencePointBuilders.forEach((b) =>
      b({
        ...params,
        builder,
      }),
    );
    return builder.getMenu();
  }

  dispose() {
    this.iconBuilders = [];
    this.valencePointBuilders = [];
  }
}
