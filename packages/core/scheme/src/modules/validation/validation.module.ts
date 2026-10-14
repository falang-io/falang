// oxlint-disable no-console, no-map-spread
import { resolveService } from '@falang/di';
import { autorun, reaction, runInAction, untracked, type IReactionDisposer } from 'mobx';
import { TOKEN_CSS_CLASSES } from '../../di-tokens.js';
import type { Scheme } from '../../scheme/scheme.js';
import type { CssClassesStore } from '../../store/css-classes.store.js';
import type { IModule } from '../../utils/i-module.js';
import { resolveVisibleIconId } from '../../utils/resolve-visible-icon-id.js';
import { ValidationLayer } from './validation.layer.js';
import { ValidationPill } from './validation-pill.cmp.js';
import { defaultValidationQueue, type ValidationQueue } from './validation.queue.js';
import { ValidationStore } from './validation.store.js';
import { TOKEN_VALIDATION_STORE } from './validation.store.token.js';
import {
  TOKEN_NODE_VALIDATORS,
  type INodeValidator,
  type IValidationContext,
  type IValidationIssue,
} from './validation.types.js';

export const VALIDATION_ERROR_CLASS = 'has-error';
export const VALIDATION_WARNING_CLASS = 'has-warning';

const ERROR_COLOR = '#d93025';
const WARNING_COLOR = '#f5a623';

const blockRule = (className: string, color: string) => `
  div.block-body.${className}.${className} {
    border-color: ${color};
    box-shadow: 0 0 0 2px ${color}55;
  }
  svg .block-body.${className}.${className} {
    stroke: ${color};
    stroke-width: 3px;
  }
`;

const validationCss = `
  ${blockRule(VALIDATION_WARNING_CLASS, WARNING_COLOR)}
  ${blockRule(VALIDATION_ERROR_CLASS, ERROR_COLOR)}
  .validation-layer .validation-marker {
    position: absolute;
    width: 14px;
    height: 14px;
    box-sizing: border-box;
    border-radius: 50%;
    color: #fff;
    font: bold 10px/14px sans-serif;
    text-align: center;
    z-index: 1000;
    cursor: help;
  }
  .validation-layer .validation-marker.has-error { background: ${ERROR_COLOR}; }
  .validation-layer .validation-marker.has-warning { background: ${WARNING_COLOR}; }
`;

export interface IValidationModuleParams {
  validators?: INodeValidator[];
  /** Defaults to the window-wide shared queue. */
  queue?: ValidationQueue;
}

let schemeCounter = 0;

/**
 * Background validation of every icon (ADR 0068 (private)). For each node and each validator one MobX reaction runs
 * `validator.describe(node)`; when its input changes (compared by `key`) a check is queued on the shared
 * `ValidationQueue`, and the result lands in `ValidationStore` (`TOKEN_VALIDATION_STORE`). Blocks with issues get
 * the `has-error` / `has-warning` class (mapped to the visible ancestor for icons that hide their children) and a
 * hover marker listing the messages. Validators come from the constructor and from `TOKEN_NODE_VALIDATORS`
 * registrations made by other modules in their `register()`. A `validator?` on `IBlockConfig` is not supported.
 */
export class ValidationModule implements IModule {
  private readonly ownValidators: INodeValidator[];
  private readonly queue: ValidationQueue;
  private readonly schemeKey = `scheme-${(schemeCounter += 1)}`;
  private store: ValidationStore | null = null;
  private cssClasses: CssClassesStore | null = null;
  private readonly nodeReactions = new Map<string, IReactionDisposer[]>();
  private disposers: IReactionDisposer[] = [];
  private sources: string[] = [];

  constructor(params: IValidationModuleParams = {}) {
    this.ownValidators = params.validators ?? [];
    this.queue = params.queue ?? defaultValidationQueue;
  }

  register(scheme: Scheme) {
    scheme.container.registerInstance(TOKEN_VALIDATION_STORE, new ValidationStore());
  }

  initialize(scheme: Scheme) {
    const store = resolveService(TOKEN_VALIDATION_STORE, scheme.container);
    this.store = store;
    const cssClasses = resolveService(TOKEN_CSS_CLASSES, scheme.container);
    this.cssClasses = cssClasses;
    cssClasses.addRootExtraCss(() => validationCss);
    scheme.extraView.registerSchemeLayer(ValidationLayer, 91);
    scheme.extraView.registerCoreSchemeLayer(ValidationPill, 91);
    store.setVisibleIdResolver((nodeId) => resolveVisibleIconId(scheme, nodeId));

    const validators = [...this.ownValidators];
    if (scheme.container.isRegistered(TOKEN_NODE_VALIDATORS, true)) {
      validators.push(...(scheme.container.resolveAll(TOKEN_NODE_VALIDATORS) as INodeValidator[]));
    }
    this.sources = validators.map((v) => v.source);
    const ctx: IValidationContext = { scheme };

    this.disposers.push(
      reaction(
        () => scheme.nodes.ids,
        (ids) => this.syncNodes(scheme, validators, ctx, ids),
        { fireImmediately: true, equals: (a, b) => a.length === b.length && a.every((id, i) => id === b[i]) },
      ),
      autorun(() => this.syncClasses(store, cssClasses)),
    );
  }

  dispose() {
    for (const disposer of this.disposers) disposer();
    this.disposers = [];
    for (const id of this.nodeReactions.keys()) this.removeNode(id);
    this.queue.cancelScheme(this.schemeKey);
    this.store?.clearAll();
    this.cssClasses?.removeClassFromAllBlocks(VALIDATION_ERROR_CLASS);
    this.cssClasses?.removeClassFromAllBlocks(VALIDATION_WARNING_CLASS);
    this.cssClasses = null;
    this.store = null;
  }

  /** The key this scheme's jobs carry on the queue (for `queue.setPriorityScheme`). */
  getSchemeKey(): string {
    return this.schemeKey;
  }

  private syncNodes(scheme: Scheme, validators: INodeValidator[], ctx: IValidationContext, ids: string[]) {
    const present = new Set(ids);
    for (const id of this.nodeReactions.keys()) {
      if (!present.has(id)) this.removeNode(id);
    }
    for (const id of ids) {
      if (this.nodeReactions.has(id)) continue;
      const node = scheme.nodes.getNodeSafe(id);
      if (!node) continue;
      this.nodeReactions.set(
        id,
        validators.map((validator) => this.watch(validator, id, ctx)),
      );
    }
  }

  private watch(validator: INodeValidator, nodeId: string, ctx: IValidationContext): IReactionDisposer {
    const { source } = validator;
    const describe = () => {
      const node = ctx.scheme.nodes.getNodeSafe(nodeId);
      if (!node) return { input: null, key: null };
      try {
        const input = validator.describe(node, ctx);
        if (input === null) return { input: null, key: null };
        return { input, key: validator.key ? validator.key(input) : JSON.stringify(input) };
      } catch (error) {
        console.warn(`[validation] describe "${source}" on node ${nodeId} failed`, error);
        return { input: null, key: null };
      }
    };
    return reaction(
      describe,
      ({ input }) => {
        const store = this.store;
        if (!store) return;
        if (input === null) {
          this.queue.cancel(this.schemeKey, nodeId, source);
          store.setIssues(nodeId, source, []);
          return;
        }
        this.queue.enqueue({
          schemeKey: this.schemeKey,
          nodeId,
          source,
          check: async () => {
            const drafts = await validator.check(input, ctx);
            return drafts.map<IValidationIssue>((draft) => ({ ...draft, nodeId: draft.nodeId ?? nodeId, source }));
          },
          apply: (issues) => {
            store.setIssues(nodeId, source, issues);
            store.markSettled(nodeId, source);
          },
          discard: () => store.markSettled(nodeId, source),
        });
        store.markPending(nodeId, source);
      },
      { fireImmediately: true, equals: (a, b) => a.key === b.key },
    );
  }

  private removeNode(nodeId: string) {
    const disposers = this.nodeReactions.get(nodeId);
    if (!disposers) return;
    for (const disposer of disposers) disposer();
    this.nodeReactions.delete(nodeId);
    for (const source of this.sources) this.queue.cancel(this.schemeKey, nodeId, source);
    this.store?.clearNode(nodeId);
  }

  private appliedClasses = new Map<string, string>();

  private syncClasses(store: ValidationStore, cssClasses: CssClassesStore) {
    const wanted = new Map<string, string>();
    for (const [iconId, issues] of store.issuesByIcon) {
      if (issues.some((issue) => issue.severity === 'error')) wanted.set(iconId, VALIDATION_ERROR_CLASS);
      else if (issues.length > 0) wanted.set(iconId, VALIDATION_WARNING_CLASS);
    }
    untracked(() =>
      runInAction(() => {
        for (const [iconId, className] of this.appliedClasses) {
          if (wanted.get(iconId) !== className) cssClasses.removeBlockClass(iconId, className);
        }
        for (const [iconId, className] of wanted) {
          if (this.appliedClasses.get(iconId) !== className) cssClasses.addBlockClass(iconId, className);
        }
      }),
    );
    this.appliedClasses = wanted;
  }
}
