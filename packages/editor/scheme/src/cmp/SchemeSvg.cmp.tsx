import { observer } from 'mobx-react';
import { BackgroundGridComponent } from './BackgroundGrid.cmp';
import { SchemeStore } from '../store/Scheme.store';
import { TransformContainerComponent } from './TransformContainer.cmp';

interface SchemeSvgComponentProps {
  scheme: SchemeStore
}

export const SchemeSvgComponent: React.FC<SchemeSvgComponentProps> = observer(({ scheme }) => {
  return <svg
    className={scheme.svgClassName}
    width='100%'
    height='100%'
    id={scheme.id}
  >
    <BackgroundGridComponent scheme={scheme} />
    <TransformContainerComponent scheme={scheme} />
  </svg>
});
