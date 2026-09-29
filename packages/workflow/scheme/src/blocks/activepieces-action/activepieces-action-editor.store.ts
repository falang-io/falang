import { resolveService } from '@falang/di';
import type { IBlockEditorFactoryParams } from '@falang/scheme';
import { CodeModelStore, ExpressionBlockEditorStore } from '@falang/typescript-scheme';
import {
  activepiecesVendorFor,
  type IActivepiecesActionCatalogEntry,
  type IActivepiecesPieceCatalogEntry,
  type IActivepiecesPropertyCatalogEntry,
} from '@falang/workflow-integrations-activepieces';
import type { IIntegrationInstance } from '@falang/workflow-integrations-common';
import { action, makeObservable, observable, reaction, runInAction } from 'mobx';
import {
  TOKEN_ACTIVEPIECES_CATALOG_PROVIDER,
  TOKEN_ACTIVEPIECES_FIELD_OPTIONS_PROVIDER,
  TOKEN_CREDENTIALS_PROVIDER,
  type IActivepiecesCatalogProvider,
  type IActivepiecesFieldOptionsProvider,
} from '../../registry/di-tokens.js';
import {
  decodeDropdownValue,
  decodeMultiDropdownValue,
  encodeMultiDropdownValue,
  toOptionKey,
} from './activepieces-dropdown-codec.js';
import type { TActivepiecesActionData } from '@falang/workflow-dto';

const isDynamicDropdown = (type: string): boolean => type === 'DROPDOWN' || type === 'MULTI_SELECT_DROPDOWN';

export interface ISelectOption {
  readonly value: string;
  readonly label: string;
}

/**
 * The one editor store behind every `activepieces-action` node — see
 * `@falang/workflow-dto`'s `activepieces-action-nodes.ts` and
 * ADR 0010 (private). Unlike `IntegrationActionEditorStore` (whose
 * field list is fixed per node *kind*, looked up from a statically registered `IActionDescriptor`),
 * this node's prop list varies per *instance* and is only known once the catalog (fetched from the
 * standalone `falang-workflow-activepieces` service) is loaded and `pieceName`/`actionName` are set.
 *
 * Two states, never reversed once the second is reached: `pieceName`/`actionName` empty -> picker
 * (`pick()` sets them); both set -> props form (`codeStores`, one `CodeModelStore` per prop, same
 * pattern `IntegrationActionEditorStore` uses).
 */
export class ActivepiecesActionEditorStore extends ExpressionBlockEditorStore<TActivepiecesActionData> {
  @observable.ref catalog: readonly IActivepiecesPieceCatalogEntry[] = [];
  @observable catalogLoading = true;
  @observable pieceName: string;
  @observable actionName: string;
  @observable credentialId: string;
  readonly codeStores = new Map<string, CodeModelStore>();
  @observable.shallow private readonly dynamicOptionsByProp = observable.map<string, readonly ISelectOption[]>();
  @observable.shallow private readonly optionsLoadingByProp = observable.map<string, boolean>();
  private readonly dynamicOptionDisposers: (() => void)[] = [];
  private readonly catalogProvider: IActivepiecesCatalogProvider;
  private readonly fieldOptionsProvider: IActivepiecesFieldOptionsProvider;
  private readonly credentialInstances: readonly IIntegrationInstance[];
  private readonly nodeId: string;

  constructor(params: IBlockEditorFactoryParams<TActivepiecesActionData>) {
    super(params);
    makeObservable(this);
    this.nodeId = params.icon.id;
    this.catalogProvider = resolveService(TOKEN_ACTIVEPIECES_CATALOG_PROVIDER, params.container);
    this.fieldOptionsProvider = resolveService(TOKEN_ACTIVEPIECES_FIELD_OPTIONS_PROVIDER, params.container);
    this.credentialInstances = resolveService(TOKEN_CREDENTIALS_PROVIDER, params.container).getInstances();
    this.pieceName = params.data.pieceName;
    this.actionName = params.data.actionName;
    this.credentialId = params.data.credentialId;
    this.loadCatalog(params.data.propsValue).catch(() => {
      // loadCatalog never rejects (all failure paths are caught internally) — this is unreachable,
      // just here to satisfy the "no floating promise" posture.
    });
  }

  private async loadCatalog(initialPropsValue: Readonly<Record<string, string>>): Promise<void> {
    let catalog: readonly IActivepiecesPieceCatalogEntry[] = [];
    try {
      catalog = await this.catalogProvider.getPieces();
    } catch {
      catalog = [];
    }
    runInAction(() => {
      this.catalog = catalog;
      this.catalogLoading = false;
      if (this.pieceName && this.actionName) this.buildPropStores(initialPropsValue);
    });
  }

  get selectedPiece(): IActivepiecesPieceCatalogEntry | undefined {
    return this.catalog.find((piece) => piece.pieceName === this.pieceName);
  }

  get selectedAction(): IActivepiecesActionCatalogEntry | undefined {
    return this.selectedPiece?.actions.find((candidate) => candidate.name === this.actionName);
  }

  get pieceOptions(): readonly ISelectOption[] {
    return this.catalog.map((piece) => ({ value: piece.pieceName, label: piece.displayName }));
  }

  get actionOptions(): readonly ISelectOption[] {
    return (this.selectedPiece?.actions ?? []).map((catalogAction) => ({
      value: catalogAction.name,
      label: catalogAction.displayName,
    }));
  }

  get credentialOptions(): readonly ISelectOption[] {
    const vendor = activepiecesVendorFor(this.pieceName);
    return this.credentialInstances
      .filter((instance) => instance.vendor === vendor)
      .map((instance) => ({ value: instance.id, label: instance.name }));
  }

  /** One-time pick — see the class doc. Never called again once `pieceName`/`actionName` are set. */
  @action pick(pieceName: string, actionName: string): void {
    this.pieceName = pieceName;
    this.actionName = actionName;
    this.credentialId = '';
    this.buildPropStores({});
  }

  @action setCredentialId(id: string): void {
    this.credentialId = id;
  }

  private buildPropStores(initialPropsValue: Readonly<Record<string, string>>): void {
    const catalogAction = this.selectedAction;
    if (!catalogAction) return;
    for (const prop of catalogAction.props) {
      this.codeStores.set(
        prop.name,
        new CodeModelStore({
          id: this.nodeId,
          name: prop.name,
          value: initialPropsValue[prop.name] ?? '',
          hiddenPrefix: this.hiddenScopeCode,
        }),
      );
    }
    for (const prop of catalogAction.props) {
      if (isDynamicDropdown(prop.type)) this.watchDynamicDropdown(prop);
    }
  }

  /** Re-fetches `prop`'s options whenever the credential or any of its `refreshers` sibling values change. */
  private watchDynamicDropdown(prop: IActivepiecesPropertyCatalogEntry): void {
    const disposer = reaction(
      () => [this.credentialId, ...(prop.refreshers ?? []).map((name) => this.codeStores.get(name)?.value ?? '')],
      () => {
        this.refreshDynamicOptions(prop).catch(() => {
          // refreshDynamicOptions never rejects (all failure paths are caught internally).
        });
      },
      { fireImmediately: true },
    );
    this.dynamicOptionDisposers.push(disposer);
  }

  private async refreshDynamicOptions(prop: IActivepiecesPropertyCatalogEntry): Promise<void> {
    if (!this.credentialId) {
      runInAction(() => this.dynamicOptionsByProp.set(prop.name, []));
      return;
    }
    runInAction(() => this.optionsLoadingByProp.set(prop.name, true));
    try {
      const options = await this.fieldOptionsProvider.loadOptions(
        this.credentialId,
        this.pieceName,
        this.actionName,
        prop.name,
        this.snapshotPropsValueForOptions(),
      );
      runInAction(() => this.dynamicOptionsByProp.set(prop.name, options));
    } catch {
      runInAction(() => this.dynamicOptionsByProp.set(prop.name, []));
    } finally {
      runInAction(() => this.optionsLoadingByProp.set(prop.name, false));
    }
  }

  /** Best-effort: a sibling prop already encoded by this feature parses cleanly; a raw hand-written expression degrades to its source text as-is. */
  private snapshotPropsValueForOptions(): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    this.codeStores.forEach((store, name) => {
      try {
        result[name] = JSON.parse(store.value.trim());
      } catch {
        result[name] = store.value;
      }
    });
    return result;
  }

  getDropdownOptions(prop: IActivepiecesPropertyCatalogEntry): readonly ISelectOption[] {
    if (prop.type === 'STATIC_DROPDOWN') {
      return (prop.options ?? []).map((option) => ({ value: toOptionKey(option.value), label: option.label }));
    }
    return this.dynamicOptionsByProp.get(prop.name) ?? [];
  }

  isOptionsLoading(propName: string): boolean {
    return this.optionsLoadingByProp.get(propName) ?? false;
  }

  getDropdownValue(propName: string): string | undefined {
    return decodeDropdownValue(this.codeStores.get(propName)?.value ?? '');
  }

  getMultiDropdownValue(propName: string): string[] {
    return decodeMultiDropdownValue(this.codeStores.get(propName)?.value ?? '');
  }

  @action setDropdownValue(propName: string, key: string | undefined): void {
    this.codeStores.get(propName)?.setValue(key ?? '');
  }

  @action setMultiDropdownValue(propName: string, keys: readonly string[]): void {
    this.codeStores.get(propName)?.setValue(encodeMultiDropdownValue(keys));
  }

  getData(): TActivepiecesActionData {
    const propsValue: Record<string, string> = {};
    this.codeStores.forEach((store, name) => {
      propsValue[name] = store.value;
    });
    return { pieceName: this.pieceName, actionName: this.actionName, credentialId: this.credentialId, propsValue };
  }

  override dispose(): void {
    this.codeStores.forEach((store) => store.dispose());
    this.dynamicOptionDisposers.forEach((dispose) => dispose());
  }
}
