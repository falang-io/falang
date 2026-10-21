import type { TBlockEditorView } from '@falang/scheme';
import { TOKEN_SCHEME, useService } from '@falang/scheme';
import { observer } from 'mobx-react-lite';
import Form from 'antd/es/form';
import FormItem from 'antd/es/form/FormItem/index.js';
import Input from 'antd/es/input/index.js';
import Button from 'antd/es/button/index.js';
import { VariableTypeSelect } from '../../block-elements/variable-type/variable-type-select.cmp.js';
import type { FunctionBodyBlockEditorStore } from './function-body-editor.store.js';

export const FunctionBodySidebarEditorComponent: TBlockEditorView<FunctionBodyBlockEditorStore> = observer(
  ({ editor }) => {
    const { data, projectService } = editor;
    const scheme = useService(TOKEN_SCHEME);
    const typesRegistry = projectService?.typesRegistry;
    const structTypes = typesRegistry ? [...typesRegistry.types.values()] : [];

    return (
      <Form layout="vertical" style={{ padding: '8px' }}>
        <FormItem label="Function">
          <Input value={scheme.name || ''} readOnly style={{ opacity: 0.6 }} />
        </FormItem>
        {data.parameters.map((param, index) => {
          const paramType = param.type;
          return (
            <div
              key={index}
              style={{ marginBottom: 12, padding: '8px 10px', border: '1px solid #d9d9d9', borderRadius: 6 }}
            >
              <FormItem label="Name" style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', gap: 4 }}>
                  <Input
                    value={param.name}
                    onChange={(e) => editor.setParameterName(index, e.currentTarget.value)}
                    placeholder="name"
                  />
                  <Button danger onClick={() => editor.removeParameter(index)}>
                    ×
                  </Button>
                </div>
              </FormItem>
              <VariableTypeSelect
                variant="form"
                value={paramType}
                lastInForm
                onChange={(next) => next && editor.setParameterVariableType(index, next)}
                projectService={projectService}
                structTypes={structTypes}
              />
            </div>
          );
        })}
        <Button block onClick={() => editor.addParameter()}>
          + parameter
        </Button>
        <div style={{ marginTop: 12 }}>
          <VariableTypeSelect
            variant="form"
            label="Return type"
            value={data.returnValue}
            voidIsUndefined
            lastInForm
            onChange={(next) => editor.setReturnValueVariableType(next)}
            projectService={projectService}
            structTypes={structTypes}
          />
        </div>
      </Form>
    );
  },
);
