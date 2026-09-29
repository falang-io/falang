import { nanoid } from 'nanoid';
import type { IDataInfo, INode, INodeConfig } from '../types.js';

export interface IContourNodeConfigParams<
  TName extends string,
  TData extends IDataInfo,
  THeaderData extends IDataInfo,
  TFunctionData extends IDataInfo,
  TFunctionReturnData extends IDataInfo,
  TFinishHeaderData extends IDataInfo,
  TFinishFooterData extends IDataInfo,
> {
  name: TName;
  data: TData;
  headerData: THeaderData;
  functionData: TFunctionData;
  functionReturnData: TFunctionReturnData;
  finishData: TFinishHeaderData;
  finishFooterData: TFinishFooterData;
}

export const countourNodeConfig = <
  TName extends string,
  TData extends IDataInfo,
  THeaderData extends IDataInfo,
  TFunctionData extends IDataInfo,
  TFunctionReturnData extends IDataInfo,
  TFinishHeaderData extends IDataInfo,
  TFinishFooterData extends IDataInfo,
>({
  name,
  data,
  finishFooterData,
  finishData,
  functionData,
  functionReturnData,
  headerData,
}: IContourNodeConfigParams<
  TName,
  TData,
  THeaderData,
  TFunctionData,
  TFunctionReturnData,
  TFinishHeaderData,
  TFinishFooterData
>) => {
  const headerName = `${name}-header` as `${TName}-header`;
  const bodyName = `${name}-body` as `${TName}-body`;
  const finishName = `${name}-finish` as `${TName}-finish`;
  const finishFooterName = `${name}-finish-footer` as `${TName}-finish-footer`;

  const functionName = `${name}-function` as `${TName}-function`;
  const functionBodyName = `${name}-function-body` as `${TName}-function-body`;
  const functionFooterName = `${name}-function-footer` as `${TName}-function-footer`;
  const functionReturnName = `${name}-function-return` as `${TName}-function-return`;

  const functionFactory = (): INode => ({
    id: nanoid(),
    name: functionName,
    children: [
      {
        id: nanoid(),
        name: functionBodyName,
        data: functionData.default(),
      },
      {
        id: nanoid(),
        name: functionFooterName,
        children: [
          {
            id: nanoid(),
            name: functionReturnName,
            data: functionReturnData.default(),
          },
        ],
      },
    ],
  });

  return [
    {
      name,
      documentRootOnly: true,
      childTuple: [headerName, bodyName, finishName, finishFooterName],
      factory: () => ({
        name,
        id: nanoid(),
        children: [
          {
            id: nanoid(),
            name: headerName,
            data: headerData.default(),
          },
          {
            id: nanoid(),
            name: bodyName,
            data: data.default(),
            children: [functionFactory(), functionFactory()],
          },
          {
            id: nanoid(),
            name: finishName,
            data: finishData.default(),
          },
          {
            id: nanoid(),
            name: finishFooterName,
            data: finishFooterData.default(),
          },
        ],
      }),
    },
    {
      name: headerName,
      data: headerData,
    },
    {
      name: bodyName,
      data,
      children: [functionName],
    },
    {
      name: functionName,
      childTuple: [functionBodyName, functionFooterName],
      factory: functionFactory,
    },
    {
      name: functionBodyName,
      data: functionData,
      children: true,
    },
    {
      name: functionFooterName,
      children: [functionReturnName],
    },
    {
      name: functionReturnName,
      data: functionReturnData,
    },
    {
      name: finishName,
      data: finishData,
      children: true,
    },
    {
      name: finishFooterName,
      data: finishFooterData,
    },
  ] as const satisfies readonly INodeConfig[];
};
