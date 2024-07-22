import { observer } from 'mobx-react';
import { SchemeStore } from '../store/Scheme.store';
import { ValencePoint } from './ValencePoint';

export const ValencePointsComponent: React.FC<{ scheme: SchemeStore }> = observer(({ scheme }) => {
  return <g id={`ValenvePoints-${scheme.id}`}>
    {scheme.valencePoints.visibleValencePoints.map((vp) => <ValencePoint key={vp.id} radius={scheme.valencePoints.vpRadius} {...vp} scheme={scheme} />)}
  </g>;
});
