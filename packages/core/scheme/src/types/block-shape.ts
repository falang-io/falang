import React from 'react';

export interface IBlockShapePosition {
  x: number;
  y: number;
}

export interface IBlockShapeBlockData {
  width: number;
  height: number;
  backgroundColor: string | null;
  shapeClassName: string | null;
}

export interface IBlockShapeProps {
  pos: IBlockShapePosition;
  block: IBlockShapeBlockData;
}

export interface IBlockShapeViewProps {
  x: number;
  y: number;
  width: number;
  height: number;
  className: string;
}

export interface IBlockShapeGetterParams {
  x: number;
  y: number;
  blockWidth: number;
  blockHeight: number;
}

export interface IBlockShapeGetterResult {
  blockX: number;
  blockY: number;
  left: number;
  right: number;
  height: number;
}

export interface IBlockShapePaddings {
  left?: number;
  right?: number;
  top?: number;
  bottom?: number;
}

export type TBlockShapeGetter = (params: IBlockShapeGetterParams) => IBlockShapeGetterResult;

export interface IBlockShapeConfig {
  paddings?: IBlockShapePaddings;
  minHeight?: number;
  view: React.FC<IBlockShapeViewProps>;
}

export interface IBlockShapeFinalConfig {
  paddings: Required<IBlockShapePaddings>;
  view: React.FC<IBlockShapeViewProps>;
  minHeight?: number;
}
