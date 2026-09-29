import type { zod } from '@falang/dto';
import type { IBlockEditorFactoryParams } from '@falang/scheme';
import type { callApiDto } from '@falang/typescript-dto';
import { action, computed, makeObservable, observable } from 'mobx';
import {
  DynamicTypedFieldsStore,
  type ITypedFieldDescriptor,
} from '../../block-elements/dynamic-typed-fields/dynamic-typed-fields.store.js';
import { ExpressionBlockEditorStore } from '../../monaco/scope/expression-block-editor.store.js';
import type {
  IExternalApiRegistryApi,
  IExternalApiRegistryEndpoint,
} from '../../typescript-project-service/external-api-registry.store.js';

export type ICallApi = zod.infer<typeof callApiDto>;

export class CallApiBlockEditorStore extends ExpressionBlockEditorStore<ICallApi> {
  @observable data: ICallApi;
  readonly parameters: DynamicTypedFieldsStore;

  constructor(params: IBlockEditorFactoryParams<ICallApi>) {
    super(params);
    this.data = params.data;
    makeObservable(this);
    this.parameters = new DynamicTypedFieldsStore({
      id: params.icon.id,
      getFields: () => this.parameterDescriptors,
      initialValues: params.data.parameters,
      buildHiddenPrefix: (type) => this.buildHiddenPrefixForType(type),
    });
  }

  /** Every `external-api-structure` document known to the project, one entry per document, for the "api" picker. */
  @computed get availableApis(): readonly IExternalApiRegistryApi[] {
    const seenSchemeIds = new Set<string>();
    const result: IExternalApiRegistryApi[] = [];
    for (const api of this.projectService?.externalApiRegistry.apis.values() ?? []) {
      if (seenSchemeIds.has(api.schemeId)) continue;
      seenSchemeIds.add(api.schemeId);
      result.push(api);
    }
    return result;
  }

  /** Every endpoint declared under the currently selected `schemeId` (document), for the "endpoint" picker. */
  @computed get availableEndpoints(): readonly IExternalApiRegistryEndpoint[] {
    return Array.from(this.projectService?.externalApiRegistry.endpoints.values() ?? []).filter(
      (endpoint) => endpoint.schemeId === this.data.schemeId,
    );
  }

  @computed private get targetEndpoint(): IExternalApiRegistryEndpoint | undefined {
    // `iconId` can be `null`/absent when no endpoint is selected yet — `''` is never a real
    // endpoint id, so this just misses the lookup instead of needing a separate guard.
    return this.projectService?.externalApiRegistry.endpoints.get(this.data.iconId ?? '');
  }

  @computed private get parameterDescriptors(): readonly ITypedFieldDescriptor[] {
    return (this.targetEndpoint?.parameters ?? []).map((parameter) => ({
      key: parameter.name,
      label: parameter.name,
      type: parameter.type,
    }));
  }

  getData(): ICallApi {
    return { ...this.data, parameters: [...this.parameters.getValues()] };
  }

  @action setSchemeId(schemeId: string) {
    // The previous `iconId` targets an endpoint of the *old* scheme — clearing it avoids a
    // stray, no-longer-valid endpoint id surviving a scheme change.
    this.data = { ...this.data, schemeId, iconId: null };
  }

  @action setIconId(iconId: string) {
    this.data = { ...this.data, iconId: iconId.trim() === '' ? null : iconId };
  }

  @action setReturnVariable(returnVariable: string) {
    this.data = { ...this.data, returnVariable };
  }

  override dispose() {
    this.parameters.dispose();
  }
}
