import type { IBlockView } from '@falang/scheme';
import { useService } from '@falang/scheme';
import { variableInfoToTsType } from '@falang/typescript-dto';
import {
  CodeViewComponent,
  TOKEN_TYPESCRIPT_PROJECT_SERVICE,
  type TypesRegistryStore,
} from '@falang/typescript-scheme';
import { observer } from 'mobx-react-lite';
import { TOKEN_INTEGRATIONS_REGISTRY } from '../../registry/di-tokens.js';

/**
 * Read-only — a trigger's payload shape is fixed by the vendor descriptor, never user-edited (see
 * ADR 0006's "trigger-function" section), so unlike `IntegrationActionBlockComponent` this has no editor.
 */
export const IntegrationTriggerBlockComponent: IBlockView<undefined> = observer(({ icon }) => {
  const registry = useService(TOKEN_INTEGRATIONS_REGISTRY);
  let typesRegistry: TypesRegistryStore | null = null;
  try {
    typesRegistry = useService(TOKEN_TYPESCRIPT_PROJECT_SERVICE).typesRegistry;
  } catch {
    // service not registered
  }
  const descriptor = registry.findTrigger(icon.name);
  if (!descriptor) return <div>&nbsp;</div>;
  const structNames = new Map(typesRegistry ? [...typesRegistry.types].map(([id, item]) => [id, item.name]) : []);
  return (
    <div className="workflow-integration-block workflow-integration-block--trigger">
      <div className="workflow-integration-block__scope">
        <CodeViewComponent value={variableInfoToTsType(descriptor.scopeType, structNames)} />
      </div>
    </div>
  );
});
