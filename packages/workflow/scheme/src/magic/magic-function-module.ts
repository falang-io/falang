import { EVENT_DATA_UPDATED, type IModule, type Scheme } from '@falang/scheme';
import { MAGIC_FUNCTION_HEADER_NAME, type TMagicData } from '@falang/workflow-dto';

/** Popup scheme: reports a finished edit of the header spell. */
export class MagicFunctionModule implements IModule {
  private readonly onHeaderSpellCommitted: ((prev: string, next: string) => void) | undefined;
  private off: (() => void) | null = null;

  constructor(onHeaderSpellCommitted?: (prev: string, next: string) => void) {
    this.onHeaderSpellCommitted = onHeaderSpellCommitted;
  }

  initialize(scheme: Scheme) {
    this.off = scheme.events.subscribeEvent(EVENT_DATA_UPDATED, ({ node, oldData }) => {
      if (node.name !== MAGIC_FUNCTION_HEADER_NAME) return false;
      const prev = (oldData as Partial<TMagicData> | null)?.spell ?? '';
      const next = (node.data as Partial<TMagicData> | null)?.spell ?? '';
      if (prev !== next) this.onHeaderSpellCommitted?.(prev, next);
      return false;
    });
  }

  dispose() {
    this.off?.();
    this.off = null;
  }
}
