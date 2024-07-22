import React from 'react'
import { observer } from "mobx-react";
import { SchemeStore } from '../store/Scheme.store';
import { IconStore } from '../icons/base/Icon.store';
import { TOutType } from '../common/outs/Out.store';

export const VALENCE_POINT_RADIUS = 4;

export type TValencePointType = 'in-skewer' | 'in-switch' | 'side-left';

interface ValencePointParams {
  id: string
  type: TValencePointType
  parentId: string | null,
  x: number,
  y: number,
  scheme: SchemeStore,
  skewerOutType?: TOutType | null,
  radius: number,
}

export const ValencePoint: React.FC<ValencePointParams> = observer(({
  id,
  type,
  parentId,
  x,
  y,
  scheme,
  radius
}) => {
  /*const busy = scheme.busy;
  const mode = scheme.valencePoints.mode;
  const schemeMode = scheme.mode;
  const parentIcon: IconStore | null = scheme.icons.getSafe(parentId ?? '');*/
  /*const isParentInSelected = !!(parentIcon && parentIcon.isInSelected);
  const dragIconParentId = scheme.dnd.dragIconParendId;
  const isSomeSelected = scheme.selection.isSomeSelected;
  const isDragging = scheme.dnd.isDragging;*/
/*
  const visible = React.useMemo<boolean>(() => {
    let returnValue = !busy && schemeMode === 'edit';
    if (!returnValue) return false;
    if (isSomeSelected && !isDragging) return false;
    switch (type) {
      case 'in-skewer':
        returnValue = returnValue && ['dragging', 'start'].includes(mode);
        returnValue = returnValue && (!isSomeSelected || !isParentInSelected);
        break;
      case 'in-switch':
        switch (mode) {
          case 'start':
            returnValue = returnValue && !isParentInSelected;
            break;
          case 'threads':
            returnValue = returnValue && dragIconParentId === parentId;
            break;
          default:
            returnValue = false;
        }
        break;
      case 'side-left':
        returnValue = returnValue && mode === 'start';
        break;
      default:
        throw new Error(`Wrong type: ${type}`);
    }
    return returnValue;
  }, [busy, schemeMode, isSomeSelected, isDragging, type, mode, isParentInSelected, dragIconParentId, parentId]);
*/
  /*React.useEffect(() => {
    const wasVisible = visible;
    if (visible) {
      scheme.valencePoints.register({
        id,
        index: index ?? null,
        parentId,
        x,
        y,
        type,
      });
    }
    return () => {
      if (wasVisible) scheme.valencePointRegisterer.unregister(id);
    }
  }, [id, visible, parentId, index, x, y, scheme, type]);*/

  //if (!visible) return null;

  return <>
    <circle
      cx={x ?? 0}
      cy={y ?? 0}
      r={radius}
      stroke='none'
      fill={'#666'}
      id={id}
    />
  </>;
});
