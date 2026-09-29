import type { IIconView } from '../../types/icon-config.js';
import type { ContourIconStore } from './contour.icon.store.js';
import { observer } from 'mobx-react-lite';
import { BaseIconComponent } from '../../cmp/base.icon.cmp.js';
import { HorisontalLine } from '../../cmp/horisontal-line.js';
import { CELL_SIZE, CELL_SIZE_2 } from '../../constants.js';
import { VerticalLine } from '../../cmp/vertical-line.js';
import { Arrow } from '../../cmp/arrow.js';

export const ContourIconComponent: IIconView<ContourIconStore> = observer(({ icon }) => (
  <>
    <HorisontalLine
      line={{
        x1: icon.x - icon.body.threads.left - CELL_SIZE,
        x2: icon.finish.x,
        y: icon.body.y + icon.body.blockFullHeight + CELL_SIZE,
      }}
      isSelected={false}
    />

    <VerticalLine
      line={{
        x: icon.x - icon.body.threads.left - CELL_SIZE,
        y1: icon.body.y + icon.body.blockFullHeight + CELL_SIZE,
        y2: icon.body.y + icon.body.height,
      }}
      isSelected={false}
    />
    <HorisontalLine
      line={{
        x1: icon.x - icon.body.threads.left - CELL_SIZE,
        x2: icon.body.threads.icons.at(-1)?.x ?? 0,
        y: icon.body.y + icon.body.height,
      }}
      isSelected={false}
    />
    <VerticalLine
      line={{
        x: icon.finish.x,
        y1: icon.body.y + icon.body.blockFullHeight + CELL_SIZE,
        y2: icon.body.y + icon.body.blockFullHeight + CELL_SIZE_2,
      }}
      isSelected={false}
    />
    <VerticalLine
      line={{
        x: icon.x,
        y1: icon.y + icon.header.height,
        y2: icon.y + icon.header.height + CELL_SIZE,
      }}
      isSelected={false}
    />
    <VerticalLine
      line={{
        x: icon.x,
        y1: icon.body.y + icon.body.blockFullHeight,
        y2: icon.body.y + icon.body.blockFullHeight + CELL_SIZE,
      }}
      isSelected={false}
    />
    <Arrow x={icon.x} y={icon.body.y + icon.body.blockFullHeight + CELL_SIZE} dir={'right'} selected={false} />
    {icon.body.threads.icons.map((child) => (
      <VerticalLine
        key={child.id}
        line={{
          x: child.x,
          y1: icon.body.y + icon.body.blockFullHeight + CELL_SIZE,
          y2: icon.body.y + icon.body.blockFullHeight + CELL_SIZE_2,
        }}
        isSelected={false}
      />
    ))}
    {/*icon.body.threads.icons.map((child) => (
      <VerticalLine
        key={child.id}
        line={{
          x: child.x,
          y1: icon.body.y + icon.body.height - CELL_SIZE,
          y2: icon.body.y + icon.body.height,
        }}
        isSelected={false}
      />
    ))*/}
    <BaseIconComponent icon={icon} />
  </>
));
