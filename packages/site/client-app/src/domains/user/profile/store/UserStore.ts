import { action, computed, makeObservable, observable, runInAction } from 'mobx';

import { api } from '../../../api/api';
import { BaseStore } from '../../../core/store/Base.store';

import type { RootStore } from '../../../core/store/Root.store';

interface IUserState {
  loggedIn: boolean;
  email: string | null;
  username: string | null;
}

export class UserStore extends BaseStore {
  @observable private state: IUserState = {
    loggedIn: false,
    email: null,
    username: null,
  };

  @observable private loaded = false;

  constructor(root: RootStore) {
    super(root);
    makeObservable(this);
    this.loadState();
  } 
  
  @computed get isLodaded(): boolean {
    return this.loaded;
  }

  @computed get loggedIn(): boolean {
    return this.state.loggedIn;
  }

  @computed get email(): string | null {
    return this.state.email;
  }

  @computed get username(): string | null {
    return this.state.username;
  }

  @action setState(state: IUserState) {
    this.state = state;
  }

  logout() {
    this.root.modals.confirm.ask('Want to log out?', (confirmed) => {
      if(!confirmed) return;
      this.setState({
        loggedIn: false,
        email: null,
        username: null,
      });
      api.user.session.logout({});
    });
  }

  @action loadState() {
    (async () => {
      const info = await api.user.session.info({});
      runInAction(() => {
        this.setState(info);
        this.loaded = true;
      });
    })().catch((err) => { 
      console.error(err);
      setTimeout(() => {
        this.loadState();
      }, 1000);
    });
  }
}
