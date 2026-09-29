import type { DependencyContainer } from 'tsyringe';
import { action, computed, makeObservable, observable } from 'mobx';
import type { NodeStore } from '../store/node.store.js';
import type { SchemeInfrastructure } from './scheme-infrastructure.js';
import type { IModule } from '../utils/i-module.js';
import { SchemeCommandsService } from './scheme-commands.service.js';
import { SchemeIconsStore } from './scheme-icons.store.js';
import { SchemeNodesStore } from './scheme-nodes.store.js';
import { SchemeEventsService } from './scheme-events.service.js';
import { ViewPositionStore } from '../store/view-position.store.js';
import { ThemeStore } from '../store/theme.store.js';
import type { IDomRect } from '../types/dom-rect.js';
import { ModeStore } from '../store/mode.store.js';
import { ExtraViewStore } from '../store/extra-view.store.js';
import { MousePositionStore } from '../store/mouse-position.store.js';
import type { IconStore } from '../store/icon.store.js';

export interface ISchemeConstructorParams {
  container: DependencyContainer;
  infra: SchemeInfrastructure;
  modules?: IModule[];
  id?: string;
  name?: string;
  /** Builds the scheme with `isEditing = false` from the start — see the "Read-only mode" section of `CLAUDE.md`. */
  readOnly?: boolean;
}

export class Scheme {
  readonly id: string;
  @observable name: string;
  readonly icons = new SchemeIconsStore();
  readonly nodes = new SchemeNodesStore();
  readonly events = new SchemeEventsService(this);
  readonly infra: SchemeInfrastructure;
  readonly viewPosition = new ViewPositionStore();
  readonly theme = new ThemeStore();
  readonly mode = new ModeStore(this);
  readonly extraView = new ExtraViewStore();
  readonly mousePosition = new MousePositionStore();
  private readonly modules: IModule[];
  @observable rootNode: NodeStore | null = null;
  @observable isEditing = true;

  readonly container: DependencyContainer;
  readonly commands = new SchemeCommandsService(this);

  constructor({ container, infra, modules, id, name, readOnly }: ISchemeConstructorParams) {
    this.container = container;
    this.infra = infra;
    this.modules = modules ?? [];
    this.id = id ?? '';
    this.name = name ?? '';
    if (readOnly) this.isEditing = false;
    makeObservable(this);
  }

  @action registerModules() {
    this.modules.forEach((m) => m.register && m.register(this));
  }

  @action initializeModules() {
    this.modules.forEach((m) => m.initialize && m.initialize(this));
    this.mode.initialize();
    this.extraView.initialize();
  }

  dispose() {
    this.modules.forEach((m) => m.dispose && m.dispose(this));
    this.container.dispose();
  }

  @computed get rootDivId() {
    const id = this.rootNode?.id ?? 'unknown';
    return `scheme-${id}`;
  }

  getDomRect(): IDomRect {
    if (!globalThis.document) {
      return {
        height: 768,
        width: 1024,
        x: 0,
        y: 0,
      };
    }
    const element = globalThis.document.querySelector(`#${this.rootDivId}`);
    if (!element) throw new Error(`Element not found by id: ${this.rootDivId}`);
    return element.getBoundingClientRect();
  }

  get rootIcon(): IconStore | null {
    const rootNode = this.rootNode;
    if (!rootNode) return null;
    return this.icons.getIconSafe(rootNode.id);
  }
}
