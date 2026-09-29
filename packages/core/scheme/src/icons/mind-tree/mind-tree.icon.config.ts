import { emptyShape } from '../../shapes/empty-shape.js';
import { rectangleRoundedShape } from '../../shapes/rectangle-rounded.js';
import { rectangleShape } from '../../shapes/rectangle.js';
import { IconWithThreadsComponent } from '../../threads/icon-with-threads.cmp.js';
import type { IBlockConfig } from '../../types/block-config.js';
import type { IIconConfig, IIconNodeConfig } from '../../types/icon-config.js';
import { simpleIconConfig } from '../simple/simple.icon.config.js';
import { MindTreeBodyIconStore } from './mind-tree-body.icon.store.js';
import { MindTreeChildIconComponent } from './mind-tree-child.icon.cmp.js';
import { MindTreeChildIconStore } from './mind-tree-child.icon.store.js';
import { MindTreeRootIconComponent } from './mind-tree-root.icon.cmp.js';
import { MindTreeRootIconStore } from './mind-tree-root.icon.store.js';
import { MindTreeThreadIconComponent } from './mind-tree-thread.icon.cmp.js';
import { MindTreeThreadIconStore } from './mind-tree-thread.icon.store.js';

/**
 * Per-part icon title, additive/opt-in — omitting a part (or the whole `title` object) keeps that
 * part title-less, exactly as before this option existed. See `IIconNodeConfig['title']` for the
 * `string | true` shape itself (`true` renders `icon:{name}-{part}`).
 */
export interface IGetMindTreeIconConfigTitles {
  header?: string | true;
  body?: string | true;
  thread?: string | true;
  child?: string | true;
}

export interface IGetMindTreeIconConfigParams<
  TName extends string = string,
  THeaderData = unknown,
  TBodyData = unknown,
  TThreadData = unknown,
  TChildData = unknown,
> {
  name: TName;
  header: IBlockConfig<THeaderData>;
  body: IBlockConfig<TBodyData>;
  thread: IBlockConfig<TThreadData>;
  child: IBlockConfig<TChildData>;
  /** Opt-in title per part (header/body/thread/child) — see `IGetMindTreeIconConfigTitles`. Omit to keep every part title-less (unchanged default behavior). */
  title?: IGetMindTreeIconConfigTitles;
}

export const getMindTreeIconConfig = <
  TName extends string = string,
  THeaderData = unknown,
  TBodyData = unknown,
  TThreadData = unknown,
  TChildData = unknown,
>({
  name,
  header,
  body,
  thread,
  child,
  title,
}: IGetMindTreeIconConfigParams<TName, THeaderData, TBodyData, TThreadData, TChildData>) => {
  const mindTreeIcon = {
    view: MindTreeRootIconComponent,
    factory: (params) => new MindTreeRootIconStore(params),
  } as const satisfies IIconConfig<MindTreeRootIconStore>;
  const mindTreeIconConfig = {
    shape: emptyShape,
    block: { view: () => null },
    icon: mindTreeIcon,
  } as const satisfies IIconNodeConfig<unknown, MindTreeRootIconStore>;
  const mindTreeHeaderIconConfig = {
    shape: rectangleRoundedShape,
    block: header,
    icon: simpleIconConfig,
    title: title?.header,
  } satisfies IIconNodeConfig;
  const mindTreeBodyIconConfig = {
    shape: rectangleRoundedShape,
    block: body,
    icon: {
      view: IconWithThreadsComponent,
      factory: (params) => new MindTreeBodyIconStore(params),
    },
    title: title?.body,
  } satisfies IIconNodeConfig<unknown, MindTreeBodyIconStore>;

  const mindTreeThreadIconConfig = {
    shape: rectangleShape,
    block: thread,
    icon: {
      view: MindTreeThreadIconComponent,
      factory: (params) => new MindTreeThreadIconStore(params),
    },
    title: title?.thread,
  } satisfies IIconNodeConfig<unknown, MindTreeThreadIconStore>;

  const mindTreeChildIconConfig = {
    shape: rectangleShape,
    block: child,
    icon: {
      view: MindTreeChildIconComponent,
      factory: (params) => new MindTreeChildIconStore(params),
    },
    title: title?.child,
  } satisfies IIconNodeConfig<unknown, MindTreeChildIconStore>;

  const returnValue = {
    [name]: mindTreeIconConfig,
    [`${name}-header` as `${TName}-header`]: mindTreeHeaderIconConfig,
    [`${name}-body` as `${TName}-body`]: mindTreeBodyIconConfig,
    [`${name}-thread` as `${TName}-thread`]: mindTreeThreadIconConfig,
    [`${name}-child` as `${TName}-child`]: mindTreeChildIconConfig,
  } as Record<TName, typeof mindTreeIconConfig> &
    Record<`${TName}-header`, typeof mindTreeHeaderIconConfig> &
    Record<`${TName}-body`, typeof mindTreeBodyIconConfig> &
    Record<`${TName}-thread`, typeof mindTreeThreadIconConfig> &
    Record<`${TName}-child`, typeof mindTreeChildIconConfig>;

  return returnValue;
};
