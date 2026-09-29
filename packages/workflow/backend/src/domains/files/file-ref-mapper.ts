import type { IApiFile, IFileRef } from './file.types.js';

/** Narrows an `IApiFile` (the project/JWT surface's shape) down to the plain `IFileRef` the internal (runner-pod-facing) API returns — see the contract's internal-API section. */
export const toFileRef = (file: IApiFile): IFileRef => ({
  id: file.id,
  name: file.name,
  size: file.size,
  mime: file.mime,
  ...(file.publicUrl ? { publicUrl: file.publicUrl } : {}),
});
