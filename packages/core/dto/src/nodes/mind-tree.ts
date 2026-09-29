import { nanoid } from 'nanoid';
import type { INodeConfig, IDataInfo } from '../types.js';

export const mindTreeCfg = <
  TName extends string,
  THeaderData extends IDataInfo,
  TBodyData extends IDataInfo,
  TThreadData extends IDataInfo,
  TChildData extends IDataInfo,
>({
  name,
  header,
  body,
  thread,
  child,
}: {
  name: TName;
  header: THeaderData;
  body: TBodyData;
  thread: TThreadData;
  child: TChildData;
}) =>
  [
    {
      name,
      documentRootOnly: true,
      childTuple: [`${name}-header` as `${typeof name}-header`, `${name}-body` as `${typeof name}-body`],
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
            data: body.default(),
            children: [
              {
                id: nanoid(),
                name: `${name}-thread` as `${typeof name}-thread`,
                data: thread.default(),
                children: [
                  {
                    id: nanoid(),
                    name: `${name}-child` as `${typeof name}-child`,
                    data: child.default(),
                    children: [],
                  },
                  {
                    id: nanoid(),
                    name: `${name}-child` as `${typeof name}-child`,
                    data: child.default(),
                    children: [],
                  },
                ],
              },
              {
                id: nanoid(),
                name: `${name}-thread` as `${typeof name}-thread`,
                data: thread.default(),
                children: [
                  {
                    id: nanoid(),
                    name: `${name}-child` as `${typeof name}-child`,
                    data: child.default(),
                    children: [],
                  },
                  {
                    id: nanoid(),
                    name: `${name}-child` as `${typeof name}-child`,
                    data: child.default(),
                    children: [],
                  },
                ],
              },
            ],
          },
        ],
      }),
    },
    {
      name: `${name}-header` as `${TName}-header`,
      data: header,
    },
    {
      name: `${name}-body` as `${TName}-body`,
      data: body,
      children: [`${name}-thread` as `${TName}-thread`],
    },
    {
      name: `${name}-thread` as `${TName}-thread`,
      data: thread,
      children: [`${name}-child` as `${TName}-child`],
      factory: () => ({
        id: nanoid(),
        name: `${name}-thread` as `${typeof name}-thread`,
        data: thread.default(),
        children: [
          { id: nanoid(), name: `${name}-child` as `${typeof name}-child`, data: child.default(), children: [] },
          { id: nanoid(), name: `${name}-child` as `${typeof name}-child`, data: child.default(), children: [] },
        ],
      }),
    },
    {
      name: `${name}-child` as `${TName}-child`,
      data: child,
      children: true,
    },
  ] as const satisfies readonly INodeConfig[];
