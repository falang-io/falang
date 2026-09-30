import type z from 'zod';
import type { INodeConfig, IDataInfo } from '../types.js';

/** A mod-only node kind (ADR 0049 (private)): valid only inside a host's `mods`, never as a statement. */
export const modCfg = <TName extends string, TData extends z.ZodType = z.ZodType>(
  name: TName,
  data?: IDataInfo<TData>,
) =>
  (data ? { name, data } : { name }) as { readonly name: TName; readonly data?: IDataInfo<TData> } & INodeConfig<TName>;
