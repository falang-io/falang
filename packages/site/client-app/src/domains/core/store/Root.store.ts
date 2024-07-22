import { RouterStore } from 'mobx-router';
import { action, comparer, computed, makeObservable, observable, reaction, runInAction } from 'mobx';
import { getRoutes } from '../../../routes';
import { UserStore } from '../../user/profile/store/UserStore';
import { ModalsStore } from '../modals/ModalsStore';

import { DocumentsListStore } from '../../document/list/store/DocumentsList.store';
import { v4 as uuidV4 } from 'uuid';
import { LocalStore } from './LocalStore';
import { api } from '../../api/api';
import { ResponseDocumentDto } from '../../api';
import { FrontRootStore, IDirectory, IFileSystemService, ILinkInfo, LangState } from '@falang/frontend-core';
import { DropDownMenuStore } from '../dropdown/store/DropDownMenuState';
import { WindowSizeState } from './WindowSize.state';
import { importEditor } from '../../../imports/importEditor';
import { TryPageStore } from '../../try-page/TryPageStore';
import { createRegistry } from '@falang/registry';
import { TSchemeMode } from '@falang/editor-scheme';
import { ExamplesPageStore } from '../../examples/Examples.page.store';
import { getDocumentConfig, infrastructures, isProjectTypeName, projectTypes, TProjectTypeName } from '@falang/infrastructures-all';
import { nanoid } from 'nanoid';
import { DocumentEditorPageStore } from '../../document/editor/DocumentEditor.page.store';

type TRoutes = ReturnType<typeof getRoutes>;

declare global {
  const ym: any;
}

type BluePrintType = Omit<Awaited<typeof import('@blueprintjs/core')>, 'PanelStack2'>;

export class RootStore {
  readonly router: RouterStore<RootStore>;
  readonly i18n = new LangState();
  readonly user: UserStore;
  readonly localStore = new LocalStore();
  readonly modals: ModalsStore;
  readonly documentsList: DocumentsListStore;
  readonly dropdown = new DropDownMenuStore(this);
  readonly examplesPage = new ExamplesPageStore(this);
  private _routes: TRoutes | null = null;
  readonly windowSize = new WindowSizeState();
  readonly tryPage = new TryPageStore(this);

  @observable private busyIndex = 0;
  @observable activationCode: string | null = null;
  readonly documentEditorPage: DocumentEditorPageStore;
  readonly mediaBreakpoints = observable({
    xs: '(max-width: 767px)',
    su: '(min-width: 768px)',
    sm: '(min-width: 768px) and (max-width: 991px)',
    md: '(min-width: 992px) and (max-width: 1199px)',
    mu: '(min-width: 992px)',
    lg: '(min-width: 1200px)',
  });

  constructor() {
    this.router = new RouterStore<RootStore>(this);
    this.modals = new ModalsStore(this);
    this.user = new UserStore(this);
    this.documentsList = new DocumentsListStore(this);
    this.documentEditorPage = new DocumentEditorPageStore({
      dropdown: this.dropdown,
      lang: this.i18n,
      modals: this.modals,
      root: this,
    });
    reaction<[string, any], true>(
      () => {
        return [this.router.currentPath, this.router.queryParams];
      },
      ([url, params]) => {
        ym(91071305, "hit", url, { params });
      },
      {
        fireImmediately: true,
        equals: comparer.structural,
      }
    )
    makeObservable(this);
  }

  set routes(routes: TRoutes) {
    this._routes = routes;
  }

  get routes(): TRoutes {
    if (!this._routes) {
      throw new Error('No routes');
    }
    return this._routes;
  }

  @computed get busy(): boolean {
    return this.busyIndex > 0;
  }

  async waitFor<T>(cb: () => Promise<T>): Promise<T> {
    runInAction(() => this.busyIndex++);
    try {
      const returnValue = await cb();
      return returnValue;
    } finally {
      runInAction(() => this.busyIndex--);
    }
  }
}