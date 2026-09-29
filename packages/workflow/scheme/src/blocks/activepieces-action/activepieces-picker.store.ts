import { resolveService } from '@falang/di';
import { CMD_INSERT_NODE, createINodeByName, type Scheme } from '@falang/scheme';
import { ACTIVEPIECES_ACTION_NAME, type TActivepiecesActionData } from '@falang/workflow-dto';
import { activepiecesVendorFor, type IActivepiecesPieceCatalogEntry } from '@falang/workflow-integrations-activepieces';
import { action, computed, makeObservable, observable, runInAction } from 'mobx';
import {
  TOKEN_ACTIVEPIECES_CATALOG_PROVIDER,
  TOKEN_CREDENTIALS_PROVIDER,
  type IActivepiecesCatalogProvider,
  type ICredentialsProvider,
} from '../../registry/di-tokens.js';

export interface IPieceActionOption {
  readonly value: string;
  readonly label: string;
  readonly pieceName: string;
  readonly actionName: string;
}

interface IPendingInsert {
  readonly parentId: string;
  readonly index: number;
}

/**
 * Backs the modal opened by `ActivepiecesPickerModule`'s `CMD_INSERT_NODE` veto — the user picks a
 * `piece × action` pair from the flat `options` list (restricted to pieces that have a configured
 * credential instance in this project, see `activepiecesVendorFor`) *before* any node is created.
 * `confirm()` is the only place an `activepieces-action` node gets built with `pieceName`/`actionName`
 * already set.
 */
export class ActivepiecesPickerStore {
  @observable opened = false;
  @observable.ref catalog: readonly IActivepiecesPieceCatalogEntry[] = [];
  @observable catalogLoading = true;
  @observable selectedKey = '';
  private pending: IPendingInsert | null = null;
  private readonly catalogProvider: IActivepiecesCatalogProvider;
  private readonly credentialsProvider: ICredentialsProvider;
  private readonly scheme: Scheme;

  constructor(scheme: Scheme) {
    makeObservable(this);
    this.scheme = scheme;
    this.catalogProvider = resolveService(TOKEN_ACTIVEPIECES_CATALOG_PROVIDER, scheme.container);
    this.credentialsProvider = resolveService(TOKEN_CREDENTIALS_PROVIDER, scheme.container);
    this.loadCatalog().catch(() => {
      // loadCatalog never rejects (all failure paths are caught internally) — this is unreachable,
      // just here to satisfy the "no floating promise" posture.
    });
  }

  private async loadCatalog(): Promise<void> {
    let catalog: readonly IActivepiecesPieceCatalogEntry[] = [];
    try {
      catalog = await this.catalogProvider.getPieces();
    } catch {
      catalog = [];
    }
    runInAction(() => {
      this.catalog = catalog;
      this.catalogLoading = false;
    });
  }

  /** Flat `piece × action` list, restricted to pieces backed by a credential instance already configured in this workflow. */
  @computed get options(): readonly IPieceActionOption[] {
    const instances = this.credentialsProvider.getInstances();
    const configuredPieces = this.catalog.filter((piece) =>
      instances.some((instance) => instance.vendor === activepiecesVendorFor(piece.pieceName)),
    );
    return configuredPieces.flatMap((piece) =>
      piece.actions.map((pieceAction) => ({
        value: `${piece.pieceName}::${pieceAction.name}`,
        label: `${piece.displayName}: ${pieceAction.displayName}`,
        pieceName: piece.pieceName,
        actionName: pieceAction.name,
      })),
    );
  }

  @action open(parentId: string, index: number): void {
    this.pending = { parentId, index };
    this.selectedKey = '';
    this.opened = true;
  }

  @action select(value: string): void {
    this.selectedKey = value;
  }

  @action confirm(): void {
    const pending = this.pending;
    const chosen = this.options.find((option) => option.value === this.selectedKey);
    if (!pending || !chosen) return;
    const node = createINodeByName(ACTIVEPIECES_ACTION_NAME, this.scheme);
    const data: TActivepiecesActionData = {
      pieceName: chosen.pieceName,
      actionName: chosen.actionName,
      credentialId: '',
      propsValue: {},
    };
    this.close();
    this.scheme.commands.dispatchCommand(CMD_INSERT_NODE, { ...pending, node: { ...node, data } });
  }

  @action close(): void {
    this.opened = false;
    this.pending = null;
    this.selectedKey = '';
  }
}
