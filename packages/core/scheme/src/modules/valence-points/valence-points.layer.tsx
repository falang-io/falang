import { observer } from 'mobx-react-lite';
import { TOKEN_SCHEME } from '../../di-tokens.js';
import { useService } from '../../hooks/use-service.js';
import { CMD_VALENCE_POINT_CLICKED, CMD_VALENCE_POINT_CONTEXT_MENU } from '../../scheme/scheme-commands.js';
import { TOKEN_VALENCE_POINTS } from './valence-points.service.token.js';

const ValencePoint: React.FC<{ x: number; y: number; id: string }> = ({ x, y, id }) => (
  <div
    className="valence-point"
    id={id}
    style={{
      left: x - 4,
      top: y - 4,
    }}
  ></div>
);

const SelectedValencePoint: React.FC = observer(() => {
  const scheme = useService(TOKEN_SCHEME);
  const valencePoints = useService(TOKEN_VALENCE_POINTS);
  const selectedValencePoint = valencePoints.selectedValencePoint;
  if (!selectedValencePoint) return null;
  const { x, y } = selectedValencePoint;
  const left = x - 11;
  const top = y - 11;
  return (
    <div
      className="selected-valence-point"
      style={{ left, top }}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        scheme.commands.dispatchCommand(CMD_VALENCE_POINT_CLICKED, { e, vp: selectedValencePoint });
      }}
      onContextMenu={(e) => {
        e.stopPropagation();
        e.preventDefault();
        scheme.commands.dispatchCommand(CMD_VALENCE_POINT_CONTEXT_MENU, { e, vp: selectedValencePoint });
      }}
      onMouseDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onMouseMove={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    ></div>
  );
});

export const ValencePointsLayer: React.FC = observer(() => {
  const valencePoints = useService(TOKEN_VALENCE_POINTS);
  return (
    <div className="valence-points-layer">
      {valencePoints.visibleValencePoints.map((vp) => (
        <ValencePoint key={vp.id} {...vp} />
      ))}
      <SelectedValencePoint />
    </div>
  );
});
