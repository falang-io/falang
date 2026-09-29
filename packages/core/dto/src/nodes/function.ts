import { nanoid } from 'nanoid';
import type { INodeConfig, IDataInfo } from '../types.js';

export const functionCfg = <
  TName extends string,
  TData extends IDataInfo,
  THeaderData extends IDataInfo,
  TFooterData extends IDataInfo,
>({
  name,
  data,
  header,
  footer,
}: {
  name: TName;
  data: TData;
  header: THeaderData;
  footer: TFooterData;
}) =>
  [
    {
      name,
      documentRootOnly: true,
      childTuple: [
        `${name}-header` as `${typeof name}-header`,
        `${name}-body` as `${typeof name}-body`,
        `${name}-footer` as `${typeof name}-footer`,
      ],
      factory: () => ({
        id: nanoid(),
        name,
        children: [
          {
            id: nanoid(),
            name: `${name}-header` as `${typeof name}-header`,
            data: header.default(),
          },
          {
            id: nanoid(),
            name: `${name}-body` as `${typeof name}-body`,
            children: [],
            data: data.default(),
          },
          {
            id: nanoid(),
            name: `${name}-footer` as `${typeof name}-footer`,
            data: footer.default(),
          },
        ],
      }),
    },
    {
      name: `${name}-header` as `${typeof name}-header`,
      data: header,
    },
    {
      name: `${name}-footer` as `${typeof name}-footer`,
      data: footer,
    },
    {
      name: `${name}-body` as `${typeof name}-body`,
      data,
      children: true,
    },
  ] as const satisfies readonly INodeConfig[];
