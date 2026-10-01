export {
  explainNotAgentCapable,
  isAgentCapableDocumentType,
  type TDesktopAgentProduct,
} from './agent-capable-documents.js';
export {
  createDesktopAgentDocumentResolver,
  createDesktopAgentSession,
  type ICreateDesktopAgentSessionDeps,
  type IDesktopAgentDocument,
  type IDesktopAgentStore,
} from './create-desktop-agent-session.js';
export {
  subscribeDesktopDocumentSync,
  syncDesktopDocumentFromScheme,
  type ISubscribeDesktopDocumentSyncOptions,
} from './sync-document-from-scheme.js';
export {
  syncExternalApiRegistry,
  syncFunctionsRegistry,
  syncSketchProjectRegistries,
  syncTypesRegistry,
  type IProjectRegistryDocument,
} from './sync-project-registries.js';
export {
  ALL_SKETCH_DOCUMENT_TYPES,
  buildDefaultSketchDocumentRoot,
  SKETCH_DOCUMENT_TYPES,
  type ISketchDocumentTypeConfig,
  type SketchDocumentType,
} from './sketch/document-types.js';
export {
  buildSketchDocumentScheme,
  type IBuildSketchDocumentSchemeParams,
} from './sketch/build-sketch-document-scheme.js';
export { createSketchProjectContainer } from './sketch/create-sketch-project-container.js';
export {
  buildArduinoDocumentScheme,
  type IBuildArduinoDocumentSchemeParams,
} from './arduino/build-arduino-document-scheme.js';
export { createArduinoProjectContainer } from './arduino/create-arduino-project-container.js';
