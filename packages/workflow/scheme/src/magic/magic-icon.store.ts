import { addFlag, IconFlags, SimpleIconStore } from '@falang/scheme';

/**
 * The single block a `magic` node is drawn as. `HidesChildren` makes `createIconForNode` skip every
 * descendant (they live in the tree, are compiled and counted for scope, but are edited in a popup),
 * and lets `resolveVisibleIconId` map a run/debug/agent location inside to this block.
 */
export class MagicIconStore extends SimpleIconStore {
  constructor(params: ConstructorParameters<typeof SimpleIconStore>[0]) {
    super({ ...params, flags: addFlag(params.flags, IconFlags.HidesChildren) });
  }
}
