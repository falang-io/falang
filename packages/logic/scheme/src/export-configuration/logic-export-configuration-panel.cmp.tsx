import type React from 'react';
import { observer } from 'mobx-react-lite';
import Form from 'antd/es/form/index.js';
import FormItem from 'antd/es/form/FormItem/index.js';
import Input from 'antd/es/input/index.js';
import Select from 'antd/es/select/index.js';
import Button from 'antd/es/button/index.js';
import Popconfirm from 'antd/es/popconfirm/index.js';
import { LogicExportLanguages, type TExportLanguage } from '@falang/logic-dto';
import type { LogicExportConfigurationStore } from './logic-export-configuration.store.js';

export interface ILogicExportConfigurationPanelProps {
  readonly store: LogicExportConfigurationStore;
}

export const LogicExportConfigurationPanel: React.FC<ILogicExportConfigurationPanelProps> = observer(
  ({ store }) => (
    <div>
      {store.items.map((item, index) => (
        <div
          key={index}
          style={{ marginBottom: 12, padding: '8px 10px', border: '1px solid #d9d9d9', borderRadius: 6 }}
        >
          <Form layout="vertical">
            <FormItem label="Language" style={{ marginBottom: 8 }}>
              <Select
                value={item.language}
                onChange={(value) => item.setLanguage(value as TExportLanguage)}
                style={{ width: '100%' }}
              >
                {LogicExportLanguages.map((lang) => (
                  <Select.Option key={lang} value={lang}>
                    {lang}
                  </Select.Option>
                ))}
              </Select>
            </FormItem>
            <FormItem label="Path" style={{ marginBottom: 0 }}>
              <Input value={item.path} onChange={(e) => item.setPath(e.currentTarget.value)} />
            </FormItem>
          </Form>
          <Popconfirm title="Delete this export?" okButtonProps={{ danger: true }} onConfirm={() => store.deleteItem(index)}>
            <Button danger block>
              Delete
            </Button>
          </Popconfirm>
        </div>
      ))}
      <Button block onClick={() => store.addNewItem()}>
        + Add export
      </Button>
    </div>
  ),
);
