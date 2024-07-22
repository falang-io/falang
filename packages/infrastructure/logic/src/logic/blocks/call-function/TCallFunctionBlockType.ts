export const CallFunctionBlockTypes = ['internal', 'api'] as const;
export type TCallFunctionBlockType = typeof CallFunctionBlockTypes[number];
