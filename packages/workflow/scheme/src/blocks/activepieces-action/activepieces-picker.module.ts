import { CMD_INSERT_NODE, type IModule, type Scheme } from '@falang/scheme';
import { ACTIVEPIECES_ACTION_NAME, type TActivepiecesActionData } from '@falang/workflow-dto';
import { TOKEN_ACTIVEPIECES_PICKER } from '../../registry/di-tokens.js';
import { ActivepiecesPickerLayer } from './activepieces-picker.layer.js';
import { ActivepiecesPickerStore } from './activepieces-picker.store.js';

/**
 * Gates `activepieces-action` node creation behind `ActivepiecesPickerStore`'s modal — see ADR
 * 0010's "Insert-node picker at scale" open follow-up. Registers a higher-than-default-priority
 * `CMD_INSERT_NODE` listener: for this node kind, whenever `pieceName` isn't set yet (i.e. this is
 * the context menu's synchronous create-then-insert, see `ContextMenuBuilder.addForIcons`), it
 * vetoes the insert (returns `true`, stopping the default priority-0 `insertNode` listener from
 * ever running) and opens the picker instead. `ActivepiecesPickerStore.confirm()` re-dispatches
 * `CMD_INSERT_NODE` with `pieceName`/`actionName` already set, so this listener lets that second
 * dispatch fall through to the default insert.
 */
export class ActivepiecesPickerModule implements IModule {
  initialize(scheme: Scheme): void {
    const store = new ActivepiecesPickerStore(scheme);
    scheme.container.register(TOKEN_ACTIVEPIECES_PICKER, { useValue: store });
    scheme.extraView.registerCoreSchemeLayer(ActivepiecesPickerLayer);
    scheme.commands.registerCommand(
      CMD_INSERT_NODE,
      (payload) => {
        if (payload.node.name !== ACTIVEPIECES_ACTION_NAME) return false;
        const data = payload.node.data as TActivepiecesActionData | undefined;
        if (data?.pieceName) return false;
        store.open(payload.parentId, payload.index);
        return true;
      },
      1,
    );
  }
}
