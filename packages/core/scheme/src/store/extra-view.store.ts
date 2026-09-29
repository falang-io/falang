import { action, makeObservable, observable } from 'mobx';
import type { IBlockExtraView } from '../types/block-extra-view.js';

interface IPreregisteredLayer {
  priority: number;
  view: React.FC;
}

export class ExtraViewStore {
  @observable blockExtraView: IBlockExtraView | null = null;

  private preregisteredSchemeLayers: IPreregisteredLayer[] | null = [];
  private schemeLayers: React.FC[] = [];
  private preregisteredCoreLayers: IPreregisteredLayer[] | null = [];
  private coreLayers: React.FC[] = [];

  constructor() {
    makeObservable(this);
  }

  @action setBlockExtraView(view: IBlockExtraView | null) {
    this.blockExtraView = view;
  }

  registerSchemeLayer(view: React.FC, priority = 0) {
    if (this.preregisteredSchemeLayers === null) throw new Error('Module already initialized');
    this.preregisteredSchemeLayers.push({ view, priority });
  }

  registerCoreSchemeLayer(view: React.FC, priority = 0) {
    if (this.preregisteredCoreLayers === null) throw new Error('Module already initialized');
    this.preregisteredCoreLayers.push({ view, priority });
  }

  initialize() {
    if (this.preregisteredSchemeLayers) {
      this.preregisteredSchemeLayers.sort((a, b) => b.priority - a.priority);
      this.schemeLayers.push(...this.preregisteredSchemeLayers.map((l) => l.view));
    }
    if (this.preregisteredCoreLayers) {
      this.preregisteredCoreLayers.sort((a, b) => b.priority - a.priority);
      this.coreLayers.push(...this.preregisteredCoreLayers.map((l) => l.view));
    }
  }

  getSchemeLayers(): React.FC[] {
    return this.schemeLayers;
  }

  getCoreLayers(): React.FC[] {
    return this.coreLayers;
  }
}
