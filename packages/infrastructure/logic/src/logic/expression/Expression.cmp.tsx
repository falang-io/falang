import { observer } from 'mobx-react';
import { ExpressionStore } from './Expression.store';
import { CodeComponent } from '@falang/infrastructure-code';

export interface IExpressionComponentParams {
  store: ExpressionStore;
  x: number;
  y: number;
}

export const ExpressionComponent: React.FC<IExpressionComponentParams> = observer(({ store, x, y }) => {
  return <CodeComponent code={store.code} x={x} y={y} />;
});