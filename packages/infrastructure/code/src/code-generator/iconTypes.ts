import { ActionIconStore } from '@falang/editor-scheme';
import { IconStore } from '@falang/editor-scheme';
import { ForEachIconStore } from '@falang/editor-scheme';
import { FunctionIconStore } from '@falang/editor-scheme';
import { IfIconStore } from '@falang/editor-scheme';
import { LifeGramIconStore } from '@falang/editor-scheme';
import { ParallelIconStore } from '@falang/editor-scheme';
import { PseudoCycleIconStore } from '@falang/editor-scheme';
import { SwitchStore } from '@falang/editor-scheme';
import { WhileStore } from '@falang/editor-scheme';

export const iconTypes = {
  action: ActionIconStore,
  //"timing-side": TimingSideIco,
  foreach: ForEachIconStore,
  function: FunctionIconStore,
  if: IfIconStore,
  lifegram: LifeGramIconStore,
  parallel: ParallelIconStore,
  pseudo_cycle: PseudoCycleIconStore,
  switch: SwitchStore,
  while: WhileStore,
} as const satisfies Record<string, new (...args: any[]) => IconStore>;
