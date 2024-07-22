import { makeAutoObservable, observable, runInAction } from 'mobx';

export type TRegistryImporter = Record<string, () => Promise<any>>;

type TRegistryEmptyInstance = {
  loaded: false
  load: () => Promise<void>
}

type TRegistryLoadedInstance<T extends TRegistryImporter> = {
  [key in keyof T]: Awaited<ReturnType<T[key]>>
} & {
  loaded: true
}

export type TRegistryInstance<T extends TRegistryImporter> =
  TRegistryEmptyInstance
  | TRegistryLoadedInstance<T>

export const createRegistry = <T extends TRegistryImporter>(libs: T): TRegistryInstance<T> => {
  const returnValue: Record<string, any> = {};
  let isLoaded = false;
  const loadedObservable: { loaded: boolean } = {
    loaded: false
  }
  let loadingPromise: Promise<void> | null = null;
  makeAutoObservable(loadedObservable);
  Object.defineProperty(returnValue, 'loaded', {
    get: function () { return isLoaded || loadedObservable.loaded }
  });
  returnValue.load = async (): Promise<void> => {
    if (loadedObservable.loaded) return Promise.resolve();
    if (loadingPromise) return loadingPromise;
    loadingPromise = _load();
    await loadingPromise;
    loadingPromise = null;
    returnValue.load = () => Promise.resolve();    
  };

  const _load = async () => {
    const libNames = Object.keys(libs);
    const loadedLibraries = await Promise.all(
      Object.values(libs).map(loader => loader())
    );
    for (let i = 0; i < libNames.length; i++) {
      const libName = libNames[i];
      returnValue[libName] = loadedLibraries[i];
    }
    runInAction(() => {
      loadedObservable.loaded = true;
      isLoaded = true;
    });
  }

  return returnValue as TRegistryInstance<T>;
};
