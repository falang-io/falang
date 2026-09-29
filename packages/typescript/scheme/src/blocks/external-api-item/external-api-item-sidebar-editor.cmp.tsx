import type { TBlockEditorView } from '@falang/scheme';
import { observer } from 'mobx-react-lite';
import Form from 'antd/es/form';
import FormItem from 'antd/es/form/FormItem/index.js';
import Input from 'antd/es/input/index.js';
import Select from 'antd/es/select/index.js';
import Button from 'antd/es/button/index.js';
import type { ExternalApiItemBlockEditorStore } from './external-api-item-editor.store.js';

const typeOptions = ['string', 'boolean', 'number', 'array', 'struct', 'void', 'enum', 'any'] as const;
type TTypeOption = (typeof typeOptions)[number];

const elementTypeOptions = ['string', 'boolean', 'number', 'struct', 'void', 'enum', 'any'] as const;
type TElementTypeOption = (typeof elementTypeOptions)[number];

const dimensionsOptions = [1, 2, 3, 4] as const;

const returnTypeOptions = ['none', 'string', 'boolean', 'number', 'array', 'struct', 'void', 'any'] as const;
type TReturnTypeOption = (typeof returnTypeOptions)[number];

export const ExternalApiItemSidebarEditorComponent: TBlockEditorView<ExternalApiItemBlockEditorStore> = observer(
  ({ editor }) => {
    const { data, projectService } = editor;
    const typesRegistry = projectService?.typesRegistry;
    const structTypes = typesRegistry ? [...typesRegistry.types.values()] : [];

    return (
      <Form layout="vertical" style={{ padding: '8px' }}>
        <FormItem label="Name" style={{ marginBottom: 8 }}>
          <Input value={data.name} onChange={(e) => editor.setName(e.currentTarget.value)} placeholder="endpoint name" />
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
              <FormItem label="Type" style={{ marginBottom: 8 }}>
                <Select
                  value={paramType.type}
                  onChange={(value) => editor.setParameterType(index, value as TTypeOption)}
                  style={{ width: '100%' }}
                >
                  {typeOptions.map((t) => (
                    <Select.Option key={t} value={t}>
                      {t}
                    </Select.Option>
                  ))}
                </Select>
              </FormItem>
              {paramType.type === 'array' && (
                <>
                  <FormItem label="Element type" style={{ marginBottom: 8 }}>
                    <Select
                      value={paramType.elementType.type}
                      onChange={(value) => editor.setParameterArrayElementType(index, value as TElementTypeOption)}
                      style={{ width: '100%' }}
                    >
                      {elementTypeOptions.map((t) => (
                        <Select.Option key={t} value={t}>
                          {t}
                        </Select.Option>
                      ))}
                    </Select>
                  </FormItem>
                  {paramType.elementType.type === 'struct' && (
                    <FormItem label="Element struct" style={{ marginBottom: 8 }}>
                      <Select
                        value={paramType.elementType.id}
                        onChange={(value) => editor.setParameterArrayElementStructId(index, value)}
                        style={{ width: '100%' }}
                      >
                        <Select.Option value="">—</Select.Option>
                        {structTypes.map((t) => (
                          <Select.Option key={t.id} value={t.id}>
                            {t.name || t.id}
                          </Select.Option>
                        ))}
                      </Select>
                    </FormItem>
                  )}
                  <FormItem label="Dimensions" style={{ marginBottom: 0 }}>
                    <Select
                      value={paramType.dimensions}
                      onChange={(value) => editor.setParameterArrayDimensions(index, value)}
                      style={{ width: '100%' }}
                    >
                      {dimensionsOptions.map((d) => (
                        <Select.Option key={d} value={d}>
                          {d}
                        </Select.Option>
                      ))}
                    </Select>
                  </FormItem>
                </>
              )}
              {paramType.type === 'struct' && (
                <FormItem label="Struct" style={{ marginBottom: 0 }}>
                  <Select
                    value={paramType.id}
                    onChange={(value) => editor.setParameterStructId(index, value)}
                    style={{ width: '100%' }}
                  >
                    <Select.Option value="">—</Select.Option>
                    {structTypes.map((t) => (
                      <Select.Option key={t.id} value={t.id}>
                        {t.name || t.id}
                      </Select.Option>
                    ))}
                  </Select>
                </FormItem>
              )}
            </div>
          );
        })}
        <Button block onClick={() => editor.addParameter()} style={{ marginBottom: 12 }}>
          + parameter
        </Button>
        <FormItem label="Return type" style={{ marginBottom: 8 }}>
          <Select
            value={data.returnValue?.type ?? 'none'}
            onChange={(value) => editor.setReturnValueType(value as TReturnTypeOption)}
            style={{ width: '100%' }}
          >
            {returnTypeOptions.map((t) => (
              <Select.Option key={t} value={t}>
                {t}
              </Select.Option>
            ))}
          </Select>
        </FormItem>
        {data.returnValue?.type === 'struct' && (
          <FormItem label="Return struct" style={{ marginBottom: 0 }}>
            <Select
              value={data.returnValue.id}
              onChange={(value) => editor.setReturnValueStructId(value)}
              style={{ width: '100%' }}
            >
              <Select.Option value="">—</Select.Option>
              {structTypes.map((t) => (
                <Select.Option key={t.id} value={t.id}>
                  {t.name || t.id}
                </Select.Option>
              ))}
            </Select>
          </FormItem>
        )}
      </Form>
    );
  },
);
