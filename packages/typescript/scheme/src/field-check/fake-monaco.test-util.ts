// oxlint-disable no-explicit-any, no-undefined, no-useless-undefined, no-extraneous-class
import { installMonaco } from '../monaco/get-monaco.js';

/** A just-enough Monaco for tests: models hold text, nothing is ever type-checked. */
export const installFakeMonaco = (): void => {
  const fake: any = {
    Uri: { parse: (value: string) => ({ toString: () => value }) },
    MarkerSeverity: { Error: 8 },
    Range: class {},
    editor: {
      createModel: (value: string, _language: string, uri: unknown) => {
        let current = value;
        return {
          uri,
          getValue: () => current,
          setValue: (next: string) => {
            current = next;
          },
          dispose: () => undefined,
          getLineCount: () => current.split('\n').length,
        };
      },
      onDidChangeMarkers: () => ({ dispose: () => undefined }),
      getModelMarkers: () => [],
    },
    typescript: {
      ModuleResolutionKind: { NodeJs: 2 },
      typescriptDefaults: {
        setCompilerOptions: () => undefined,
        setEagerModelSync: () => undefined,
        addExtraLib: () => ({ dispose: () => undefined }),
      },
      getTypeScriptWorker: () => Promise.reject(new Error('fake monaco has no worker')),
    },
  };
  installMonaco(fake, { getWorker: () => ({}) as Worker });
};
