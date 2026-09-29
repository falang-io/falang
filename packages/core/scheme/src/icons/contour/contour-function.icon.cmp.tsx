import { observer } from 'mobx-react-lite';
import { checker } from '../../checker.js';
import { BaseIconComponent } from '../../cmp/base.icon.cmp.js';
import { TOKEN_SELECTION } from '../../di-tokens.js';
import { useService } from '../../hooks/use-service.js';
import type { IIconView } from '../../types/icon-config.js';
import type { ContourFunctionIconStore } from './contour-function.icon.store.js';
import React from 'react';
import { Line } from '../../cmp/line.js';
import { VerticalLine } from '../../cmp/vertical-line.js';
import { CELL_SIZE } from '../../constants.js';

export const ContourFunctionIconComponent: IIconView<ContourFunctionIconStore> = observer(({ icon }) => {
  const selection = useService(TOKEN_SELECTION);
  const isSelected = selection.isInSelected(icon.id);
  const body = icon.body;
  if (!checker.isFunctionBody(body)) return null;
  return (
    <>
      {icon.returnLines.map((item, index) => (
        <React.Fragment key={index}>
          {item.y2 > item.y1 ? (
            <Line x1={item.x1} x2={item.x1} y1={item.y1} y2={item.y2} selected={isSelected} />
          ) : null}
          {item.y3 > item.y2 ? (
            <Line x1={item.x2} x2={item.x2} y1={item.y2} y2={item.y3} selected={isSelected} />
          ) : null}
          {item.x1 === item.x2 ? null : (
            <Line x1={item.x1} x2={item.x2} y1={item.y2} y2={item.y2} selected={isSelected} />
          )}
        </React.Fragment>
      ))}
      {icon.footer.threads.icons.map((returnItem) => (
        <VerticalLine
          line={{
            x: returnItem.x,
            y1: icon.footer.threads.y + icon.footer.threads.height,
            y2: icon.footer.threads.y + icon.footer.threads.height + CELL_SIZE,
          }}
          isSelected={false}
        />
      ))}
      <BaseIconComponent icon={icon} />
    </>
  );
});
