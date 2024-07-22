import { action, computed, makeObservable, observable } from 'mobx';
import { SchemeStore } from '../../store/Scheme.store';
import type { OutItem } from './OutItem';

export class OutsRegisterer {
  readonly items = observable(new Map<string, OutItem>());

  constructor(readonly scheme: SchemeStore) {
    makeObservable(this);
  }

  @action register(item: OutItem) {
    this.items.set(item.id, item);
  }

  @action unregister(itemId: string) {
    this.items.delete(itemId);
  }

  /**
   * cycleId => breakIds
   */
  @computed.struct get cyclesToBreaks(): Record<string, string[]> {
    const returnValue: Record<string, string[]> = {};
    this.items.forEach((item) => {
      if(item.type === 'break') {
        const targetCycleId = item.targetId;
        if (!targetCycleId) return;
        if(!returnValue[targetCycleId]) returnValue[targetCycleId] = [];
        returnValue[targetCycleId].push(item.id);
      }
    });
    return returnValue;
  }

  @computed.struct get cyclesWithBreaksIds(): string[] {
    const returnValue: string[] = [];
    this.items.forEach((item) => {
      if(item.type === 'break') {
        const targetCycleId = item.targetId;
        if (!targetCycleId) return;
        returnValue.push(targetCycleId);
      }
    });
    return returnValue;
  }

  cycleHasBreak(cycleId: string): boolean {
    return this.cyclesWithBreaksIds.includes(cycleId);
  }

  getBreaksForCycle(cycleId: string): OutItem[] {
    const breaksIds = this.cyclesToBreaks[cycleId];
    if(!breaksIds || !breaksIds.length) return [];
    const returnValue: OutItem[] = [];
    breaksIds.forEach(breakId => {
      const outItem = this.items.get(breakId);
      if(outItem) {
        returnValue.push(outItem);
      }
    });
    return returnValue;
  }

  @computed.struct get cyclesToContinues(): Record<string, string[]> {
    const returnValue: Record<string, string[]> = {};
    this.items.forEach((item) => {
      if(item.type === 'continue') {
        const targetCycleId = item.targetId;
        if (!targetCycleId) return;
        if(!returnValue[targetCycleId]) returnValue[targetCycleId] = [];
        returnValue[targetCycleId].push(item.id);
      }
    });
    return returnValue;
  }

  @computed.struct get cyclesWithContinuesIds(): string[] {
    const returnValue: string[] = [];
    this.items.forEach((item) => {
      if(item.type === 'continue') {
        const targetCycleId = item.targetId;
        if (!targetCycleId) return;
        returnValue.push(targetCycleId);
      }
    });
    return returnValue;
  }

  cycleHasContinue(cycleId: string): boolean {
    return this.cyclesWithContinuesIds.includes(cycleId);
  }

  getContinuesForCycle(cycleId: string): OutItem[] {
    const continuesIds = this.cyclesToContinues[cycleId];
    if(!continuesIds || !continuesIds.length) return [];
    const returnValue: OutItem[] = [];
    continuesIds.forEach(continueId => {
      const outItem = this.items.get(continueId);
      if(outItem) {
        returnValue.push(outItem);
      }
    });
    return returnValue;
  }  

  @computed.struct get functionToReturns(): Record<string, string[]> {
    const returnValue: Record<string, string[]> = {};
    this.items.forEach((item) => {
      if(item.type === 'return') {
        const targetFunctionId = item.targetFunctionId;
        if (!targetFunctionId) return;
        if(!returnValue[targetFunctionId]) returnValue[targetFunctionId] = [];
        returnValue[targetFunctionId].push(item.id);
      }
    });
    return returnValue;
  }

  @computed.struct get functionsWithReturnsIds(): string[] {
    const returnValue: string[] = [];
    this.items.forEach((item) => {
      if(item.type === 'return') {
        const targetFunctionId = item.targetFunctionId;
        if (!targetFunctionId) return;
        returnValue.push(targetFunctionId);
      }
    });
    return returnValue;
  }

  functionHasReturn(functionId: string): boolean {
    return this.functionsWithReturnsIds.includes(functionId);
  }

  getReturnsForFunction(cycleId: string): OutItem[] {
    const returnsIds = this.functionToReturns[cycleId];
    if(!returnsIds || !returnsIds.length) return [];
    const returnValue: OutItem[] = [];
    returnsIds.forEach(returnId => {
      const outItem = this.items.get(returnId);
      if(outItem) {
        returnValue.push(outItem);
      }
    });
    return returnValue;
  }  
}