// oxlint-disable no-explicit-any, no-undefined, no-useless-undefined, no-extraneous-class
import { installMonaco } from '../monaco/get-monaco.js';

export interface IFakeMonacoController {
  setMarkers(markers: any[], fileName: string): void;
}

/** A just-enough Monaco for tests: models hold text, nothing is type-checked unless a test sets markers. */
export const installFakeMonaco = (): IFakeMonacoController => {
  let markers: any[] = [];
  const markerListeners = new Set<(uris: any[]) => void>();
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
      onDidChangeMarkers: (listener: (uris: any[]) => void) => {
        markerListeners.add(listener);
        return { dispose: () => markerListeners.delete(listener) };
      },
      getModelMarkers: () => markers,
    },
    typescript: {
      ModuleResolutionKind: { NodeJs: 2 },
      ScriptTarget: { ESNext: 99 },
      typescriptDefaults: {
        setCompilerOptions: () => undefined,
        setEagerModelSync: () => undefined,
        addExtraLib: () => ({ dispose: () => undefined }),
      },
      getTypeScriptWorker: () => Promise.reject(new Error('fake monaco has no worker')),
    },
  };
  installMonaco(fake, { getWorker: () => ({}) as Worker });
  return {
    setMarkers: (nextMarkers, fileName) => {
      markers = nextMarkers;
      for (const listener of markerListeners) listener([{ toString: () => fileName }]);
    },
  };
};
