import { useService } from '@falang/scheme/src/hooks/use-service.js';
import { observer } from 'mobx-react-lite';
import Dropdown from 'antd/es/dropdown/dropdown';
import { TOKEN_ANT_CONTEXT_MENU } from './ant-context-menu.token.js';

export const AntContextMenuLayer = observer(() => {
  const service = useService(TOKEN_ANT_CONTEXT_MENU);
  return (
    // `trigger` must not be antd's default `['hover']`: that closes the menu ~0.1s after the
    // pointer leaves the popup. With `contextMenu` it stays open until a click/right-click
    // outside it, Escape, or picking an item — like a native context menu.
    <Dropdown
      trigger={['contextMenu']}
      menu={{ items: service.menu }}
      open={service.opened}
      styles={{
        root: { left: `${service.x}px`, top: `${service.y}px` },
      }}
      onOpenChange={(open) => {
        if (!open) service.hide();
      }}
    >
      <div style={{ position: 'absolute', left: -1000, top: -1000 }} />
    </Dropdown>
  );
});
