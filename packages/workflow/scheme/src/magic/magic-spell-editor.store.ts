import { BlockEditorStore, type IBlockEditorFactoryParams } from '@falang/scheme';
import { action, makeObservable, observable } from 'mobx';
import type { TMagicData } from '@falang/workflow-dto';

/**
 * Inline editor of a magic node's `spell` (plain text, no Monaco). Escape cancels: `getData()` then
 * returns the data the editor opened with, so the normal "editor closed → `CMD_SET_DATA`" path writes
 * nothing new and `MagicModule` can tell a cancelled edit of a fresh node from a real one.
 */
export class MagicSpellEditorStore extends BlockEditorStore<TMagicData> {
  @observable spell: string;
  private cancelled = false;

  constructor(params: IBlockEditorFactoryParams<TMagicData>) {
    super(params);
    this.spell = params.data?.spell ?? '';
    makeObservable(this);
  }

  @action setSpell(value: string) {
    this.spell = value;
  }

  cancel() {
    this.cancelled = true;
  }

  getData(): TMagicData {
    return this.cancelled ? { ...this.initialData, spell: this.initialData?.spell ?? '' } : { spell: this.spell };
  }
}
