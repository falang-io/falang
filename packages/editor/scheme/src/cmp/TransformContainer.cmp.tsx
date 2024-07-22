import { observer } from 'mobx-react';
import { ValencePointCross } from './ValencePointCross';
import { ValencePointsComponent } from './ValencePoints.cmp';
import { SchemeStore } from '../store/Scheme.store';

interface TransformComponentProps {
  scheme: SchemeStore
}

export const TransformContainerComponent: React.FC<TransformComponentProps> = observer(({ scheme }) => {
  const loaded = scheme.loaded;
  const transformValue = scheme.viewPosition.transformValue;
  if (!loaded) return null;
  return <g
    transform={transformValue}
    className="transform-container"
  >
    <TransformContainerContent scheme={scheme} />
  </g>
});

const TransformContainerContent: React.FC<TransformComponentProps> = observer(({ scheme }) => {
  const RootRenderer = scheme.getRenderer(scheme.root);
  const dragSkewer = scheme.dnd.dragSkewer;
  let DragSkewerValue: React.ReactElement | null = null;
  if (scheme.dnd.isDragSkewerVisible) {
    const Component = scheme.getRenderer(dragSkewer);
    DragSkewerValue = <g style={{ opacity: scheme.dnd.opacity }}><Component icon={dragSkewer} /></g>
  }
  return <>
    <RootRenderer icon={scheme.root} />
    <ValencePointsComponent scheme={scheme} />
    <ValencePointCross scheme={scheme} />
    {DragSkewerValue}
  </>
});
