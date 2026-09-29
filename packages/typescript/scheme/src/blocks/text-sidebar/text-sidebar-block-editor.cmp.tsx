import type { TBlockEditorView } from '@falang/scheme';
import type { TextSidebarBlockEditorStore } from './text-sidebar-block-editor.store.js';
import { observer } from 'mobx-react-lite';
import Form from 'antd/es/form';
import FormItem from 'antd/es/form/FormItem/index.js';
import TextArea from 'antd/es/input/TextArea.js';

export const TextSidebarBlockEditorComponent: TBlockEditorView<TextSidebarBlockEditorStore> = observer(({ editor }) => (
  <Form layout="vertical">
    <FormItem label="text">
      <TextArea
        style={{ height: '150px' }}
        value={editor.data}
        onChange={(e) => editor.setValue(e.currentTarget.value)}
      />
    </FormItem>
  </Form>
));
