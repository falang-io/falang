import type { IBlockView } from '@falang/scheme';
import { TypeScriptBlockContainer } from '@falang/typescript-scheme';
import { TOKEN_ACTIVEPIECES_CATALOG_PROVIDER } from '../../registry/di-tokens.js';
import { useService } from '@falang/scheme';
import { observer } from 'mobx-react-lite';
import { useEffect, useState } from 'react';
import type { IActivepiecesPieceCatalogEntry } from '@falang/workflow-integrations-activepieces';
import type { TActivepiecesActionData } from '@falang/workflow-dto';

/**
 * Collapsed canvas label — best-effort resolved display names once the catalog loads, falling back
 * to the raw stored `pieceName`/`actionName` in the meantime (or if the piece was since removed from
 * the service's allowlist), same fallback posture `trigger-function-body-block.cmp.tsx` uses.
 */
export const ActivepiecesActionBlockComponent: IBlockView<TActivepiecesActionData> = observer(({ data }) => {
  const catalogProvider = useService(TOKEN_ACTIVEPIECES_CATALOG_PROVIDER);
  const [catalog, setCatalog] = useState<readonly IActivepiecesPieceCatalogEntry[]>([]);

  useEffect(() => {
    let cancelled = false;
    catalogProvider
      .getPieces()
      .then((pieces) => {
        if (!cancelled) setCatalog(pieces);
      })
      .catch(() => {
        // keep the raw-data fallback below
      });
    return () => {
      cancelled = true;
    };
  }, [catalogProvider]);

  if (!data) return <div>&nbsp;</div>;
  const piece = catalog.find((candidate) => candidate.pieceName === data.pieceName);
  const action = piece?.actions.find((candidate) => candidate.name === data.actionName);
  const pieceLabel = piece?.displayName ?? data.pieceName ?? '?';
  const actionLabel = action?.displayName ?? data.actionName ?? '?';

  return (
    <TypeScriptBlockContainer>
      <div className="workflow-integration-block">
        {pieceLabel}: {actionLabel}
      </div>
    </TypeScriptBlockContainer>
  );
});
