import type { TBlockEditorView } from '@falang/scheme';
import { checker, TOKEN_SCHEME, useService } from '@falang/scheme';
import { observer } from 'mobx-react-lite';
import type { ContourFunctionFooterBlockEditorStore } from './contour-function-footer.block.editor.store.ts';
import { stripTags } from './strip-tags.js';

interface ISelectOption {
  id: string;
  name: string;
}

export const ContourFunctionFooterBlockEditorComponent: TBlockEditorView<ContourFunctionFooterBlockEditorStore> =
  observer(({ editor }) => {
    const data = editor.data;
    const scheme = useService(TOKEN_SCHEME);
    const rootIcon = scheme.rootIcon;
    if (!checker.isContour(rootIcon)) return null;
    const options: ISelectOption[] = rootIcon.body.threads.icons.map((icon) => ({
      id: icon.id,
      name: stripTags(String(icon.dataNode.data)),
    }));
    options.push({
      id: rootIcon.finish.id,
      name: stripTags(String(rootIcon.finish.dataNode.data)),
    });
    if (!data) {
      editor.setValue(options[0].id);
    }
    return (
      <select value={data} style={{ width: '100%' }} onChange={(e) => editor.setValue(e.currentTarget.value)}>
        {options.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </select>
    );
  });
