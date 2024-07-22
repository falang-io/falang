import { CallFunctionBlockTransformer } from './blocks/call-function/CallFunction.block.transformer';

export const logicChecker = {
  isCallFunctionBlockTransformer: (value: any): value is CallFunctionBlockTransformer => {
    return !!(value && value.className === 'CallFunctionBlockTransformer');
  }
} as const;