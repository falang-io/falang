/** Resolves a `call-function` node's target (`schemeId`, another document in the project) to the name of its compiled function. */
export type TResolveFunctionName = (schemeId: string) => string;

export const throwUnresolvedCallFunction: TResolveFunctionName = (schemeId) => {
  throw new Error(`Cannot compile call-function targeting "${schemeId}" without a project-wide resolveFunctionName`);
};
