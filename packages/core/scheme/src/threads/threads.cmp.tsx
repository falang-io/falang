import { observer } from 'mobx-react-lite';
import type { ThreadsStore } from './threads.store.js';
import { useService } from '../hooks/use-service.js';
import { TOKEN_SELECTION } from '../di-tokens.js';
import { HorisontalLine } from '../cmp/horisontal-line.js';
import { VerticalLine } from '../cmp/vertical-line.js';

export const ThreadsComponent: React.FC<{ threads: ThreadsStore }> = observer(({ threads }) => {
  const selection = useService(TOKEN_SELECTION);
  const isInSelected = selection.isInSelected(threads.parentId);
  return (
    <>
      {threads.verticalLines.map((l, index) => (
        <VerticalLine key={index} isSelected={isInSelected || selection.isHighlighted(l.targetId)} line={l} />
      ))}
      {threads.horizontalLines.map((l, index) => (
        <HorisontalLine line={l} isSelected={isInSelected || selection.isHighlighted(l.targetId)} key={index} />
      ))}
    </>
  );
});
