import { TOKEN_SCHEME, useService, type IBlockView } from '@falang/scheme';
import { observer } from 'mobx-react-lite';
import type { ILinkData } from './link-block-editor.store.js';
import { LinkIconSvg } from './link-icon.svg.js';
import { EVENT_LINK_CLICKED } from './link-events.js';
import { TOKEN_PROJECT_DOCUMENTS_REGISTRY } from '../../project-documents-registry/project-documents-registry.token.js';

export const LinkBlockComponent: IBlockView<ILinkData> = observer(({ data }) => {
  const scheme = useService(TOKEN_SCHEME);
  // oxlint-disable-next-line init-declarations
  let documentName: string | undefined;
  try {
    documentName = useService(TOKEN_PROJECT_DOCUMENTS_REGISTRY).documents.get(data?.documentId ?? '')?.name;
  } catch {
    // registry not registered — fall back to the raw id below
  }

  const documentId = data?.documentId ?? '';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <span
        role="button"
        tabIndex={0}
        onClick={(event) => {
          event.stopPropagation();
          if (documentId) scheme.events.fireEvent(EVENT_LINK_CLICKED, { documentId });
        }}
        style={{ cursor: documentId ? 'pointer' : 'default', display: 'inline-flex' }}
      >
        <LinkIconSvg />
      </span>
      <span>{documentName ?? documentId ?? <>&nbsp;</>}</span>
    </div>
  );
});
