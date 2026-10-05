// oxlint-disable max-lines -- one host: paths, the reference files, document creation and check_project.
import {
  type IJsonDataMapping,
  buildKindSchemaFile,
  buildNodesReference,
  type IAgentNodeKindFilter,
  type IJsonFileDocument,
  type IJsonFilesDiagnostic,
  type IJsonFilesHost,
} from '@falang/agent';
import { isValidFunctionName, type IProjectTreeFolder, type NodesStack } from '@falang/dto';
import { OBJECTS_STRUCTURE_NAME } from '@falang/typescript-dto';
import { findSectionFolder, sectionForDocumentType, TRIGGER_FUNCTION_NAME } from '@falang/workflow-dto';
import { findDocumentNameConflict } from '../document-names.js';
import { getIntegrationInstances } from '../integration-instances.js';
import { isAgentEditableType } from './create-agent-document-resolver.js';
import type { IWorkflowAgentStore } from './workflow-agent-store.js';

/** File-system section per document type — the ADR 0055 sections, lower-cased. */
const SECTION_DIR: Readonly<Record<string, string>> = {
  [OBJECTS_STRUCTURE_NAME]: 'types',
  [TRIGGER_FUNCTION_NAME]: 'triggers',
  function: 'functions',
};

const NODES_FILE = 'NODES.md';
const CALL_FUNCTION_NAME = 'call-function';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const INTEGRATIONS_FILE = 'integrations.json';

/** What `check_project` runs — compile + type-check of the current documents (`compileProject` + `typeCheckProject`
 *  in a headless host; in the editor it would be a backend call, see ADR 0062's implementation notes). */
export type TWorkflowCheckProject = () => Promise<readonly IJsonFilesDiagnostic[]>;

export interface IWorkflowJsonFilesHostDeps {
  readonly store: IWorkflowAgentStore;
  readonly nodeKindFilter: IAgentNodeKindFilter;
  /** Lock + open tab before a write (the same callbacks the node tools' resolver uses). */
  readonly beforeWrite?: (documentId: string) => void;
  readonly checkProject?: TWorkflowCheckProject;
  /** Builds the stack of a document type that has no document yet (a throwaway scheme on the project container). */
  readonly buildStack?: (type: string) => NodesStack | null;
}

/** Sub-folder names of `folderId` inside its section (the section folder itself excluded). */
const subPath = (folderId: string | null, folders: readonly IProjectTreeFolder[]): string[] => {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const names: string[] = [];
  let current = folderId === null ? null : byId.get(folderId);
  const seen = new Set<string>();
  while (current && !current.fixedKind && !seen.has(current.id)) {
    seen.add(current.id);
    names.unshift(current.name);
    current = current.parentId === null ? null : byId.get(current.parentId);
  }
  return names;
};

const FUNCTION_NOTES = [
  'Statements go into `function-body`\'s "children". The signature is `function-body`\'s data: `parameters` (name + ' +
    'type) and `returnValue` (the return type); `function-header`/`function-footer` carry no meaning — keep them as read.',
  'Create a new function by writing a new file `functions/<camelCaseName>.json` (latin camelCase name) — the whole ' +
    'tree, as an existing function file looks.',
  '`call-function`\'s `schemeId` is the called function\'s file path, e.g. "functions/greetUser.json"; `iconId` is null.',
];
const TRIGGER_NOTES = [
  'Statements go into `trigger-function-body`\'s "children"; its data (vendor, trigger, credential, payload type) is ' +
    'set by create_trigger_document — keep it as read. The trigger payload is in scope as the variable its data names.',
  'A new trigger document can only be made with create_trigger_document (it needs the vendor and trigger), then edited here.',
];
const TYPE_NOTES = ['Interface declarations only (nothing runs). Create one by writing `types/<Name>.json`.'];

const WORKFLOW_RULES = [
  'Integration nodes (vendor actions/questions) only appear in NODES.md once the project has an instance of that ' +
    'vendor: find vendors with search_integrations, add one with create_integration_instance, then read NODES.md again.',
  'Call check_project after your changes and fix every error it reports before you finish.',
];

/**
 * The workflow product's `IJsonFilesHost` (ADR 0062): every agent-editable document as
 * `<triggers|functions|types>/<sub-folders…>/<name>.json`, `NODES.md` for the function and type stacks,
 * `integrations.json` (instances without secrets), document creation by writing a new `functions/`/`types/` file, and
 * an injected `check_project`.
 */
export class WorkflowJsonFilesHost implements IJsonFilesHost {
  readonly extraFiles: Readonly<Record<string, () => string>>;
  private readonly deps: IWorkflowJsonFilesHostDeps;

  constructor(deps: IWorkflowJsonFilesHostDeps) {
    this.deps = deps;
    this.extraFiles = {
      [INTEGRATIONS_FILE]: () => this.renderIntegrations(),
      [NODES_FILE]: () => this.renderNodesReference(),
    };
    if (deps.checkProject) {
      const check = deps.checkProject;
      this.checkProject = () => check();
    }
  }

  checkProject?: () => Promise<readonly IJsonFilesDiagnostic[]>;

  /** `call-function.schemeId` (a document id in storage) shown as the called document's file path; on write a path
   *  (with or without `.json`), a document name or an id all resolve back to the id. */
  readonly dataMapping: IJsonDataMapping = {
    in: (kind, data) => this.mapSchemeId(kind, data, (value) => this.resolveDocumentReference(value)),
    out: (kind, data) =>
      this.mapSchemeId(kind, data, (value) => this.listDocuments().find((doc) => doc.id === value)?.path ?? value),
  };

  private mapSchemeId(kind: string, data: unknown, map: (value: string) => string): unknown {
    if (kind !== CALL_FUNCTION_NAME || !isRecord(data) || typeof data.schemeId !== 'string') return data;
    return { ...data, schemeId: map(data.schemeId) };
  }

  private resolveDocumentReference(value: string): string {
    const documents = this.listDocuments();
    const trimmed = value.trim();
    const withJson = trimmed.endsWith('.json') ? trimmed : `${trimmed}.json`;
    const found =
      documents.find((doc) => doc.id === trimmed) ??
      documents.find((doc) => doc.path === withJson) ??
      documents.find((doc) => doc.name === trimmed);
    return found?.id ?? value;
  }

  listDocuments(): readonly IJsonFileDocument[] {
    const { store } = this.deps;
    const folders = store.folders ?? [];
    return store.documents
      .filter((doc) => !doc.pinned && isAgentEditableType(doc.type))
      .map((doc) => ({
        id: doc.id,
        name: doc.name,
        path: [SECTION_DIR[doc.type], ...subPath(doc.folderId, folders), `${doc.name}.json`].join('/'),
        type: doc.type,
      }));
  }

  getScheme(documentId: string) {
    return this.deps.store.getScheme(documentId);
  }

  beforeWrite(documentId: string): void {
    this.deps.beforeWrite?.(documentId);
  }

  isListed(kind: string): boolean {
    return this.deps.nodeKindFilter.isListed(kind);
  }

  readKindSchema(kind: string): string | null {
    for (const type of ['function', OBJECTS_STRUCTURE_NAME]) {
      const stack = this.stackFor(type);
      if (stack?.configsMap.has(kind)) return buildKindSchemaFile(kind, stack);
    }
    return null;
  }

  createDocument(path: string): string {
    const match = /^(functions|types|triggers)\/(?:(.+)\/)?([^/]+)\.json$/.exec(path);
    if (!match) throw new Error(`${path}: a new document file is "functions/<name>.json" or "types/<Name>.json"`);
    const [, section, sub, name] = match;
    if (section === 'triggers') {
      throw new Error(`${path}: create a trigger document with create_trigger_document first, then write its file`);
    }
    const type = section === 'functions' ? 'function' : OBJECTS_STRUCTURE_NAME;
    if (type === 'function' && !isValidFunctionName(name)) {
      throw new Error(`${path}: "${name}" is not a valid function name — use latin camelCase, e.g. "sendGreeting"`);
    }
    const { store } = this.deps;
    const conflict = findDocumentNameConflict(store.documents, name);
    if (conflict) throw new Error(`${path}: a document named "${conflict.name}" already exists`);
    return store.createDocument(type, name, this.resolveFolder(type, sub ?? null));
  }

  private resolveFolder(type: string, sub: string | null): string | null {
    const folders = this.deps.store.folders ?? [];
    const kind = sectionForDocumentType(type);
    const section = kind ? findSectionFolder(kind, folders) : null;
    if (!sub) return section?.id ?? null;
    let parentId = section?.id ?? null;
    for (const part of sub.split('/')) {
      const parent = parentId;
      const folder = folders.find((candidate) => candidate.parentId === parent && candidate.name === part);
      if (!folder) throw new Error(`folder "${sub}" does not exist — write the file at the section root instead`);
      parentId = folder.id;
    }
    return parentId;
  }

  /** The stack of a document type: from an open document of a type sharing it, else built by the host. */
  private stackFor(type: string): NodesStack | null {
    const sharing = type === OBJECTS_STRUCTURE_NAME ? [OBJECTS_STRUCTURE_NAME] : ['function', TRIGGER_FUNCTION_NAME];
    const doc = this.deps.store.documents.find((candidate) => sharing.includes(candidate.type) && !candidate.pinned);
    if (doc) return this.deps.store.getScheme(doc.id).infra.structure;
    return this.deps.buildStack?.(type) ?? null;
  }

  private renderNodesReference(): string {
    const parts: string[] = [];
    const functionStack = this.stackFor('function');
    if (functionStack) {
      parts.push(
        buildNodesReference({
          documentTypes: [
            {
              filePattern: 'triggers/<name>.json',
              notes: TRIGGER_NOTES,
              rootKind: TRIGGER_FUNCTION_NAME,
              type: TRIGGER_FUNCTION_NAME,
            },
            { filePattern: 'functions/<name>.json', notes: FUNCTION_NOTES, rootKind: 'function', type: 'function' },
          ],
          extraRules: WORKFLOW_RULES,
          hiddenNote:
            'Node kinds of integration vendors this project has no instance of are not listed. To use one, find it ' +
            'with search_integrations, create an instance with create_integration_instance, then read NODES.md again.',
          isListed: (kind) => this.isListed(kind),
          stack: functionStack,
        }),
      );
    }
    const typesStack = this.stackFor(OBJECTS_STRUCTURE_NAME);
    if (typesStack) {
      parts.push(
        buildNodesReference({
          documentTypes: [
            {
              filePattern: 'types/<Name>.json',
              notes: TYPE_NOTES,
              rootKind: OBJECTS_STRUCTURE_NAME,
              type: OBJECTS_STRUCTURE_NAME,
            },
          ],
          stack: typesStack,
        }).replace('# Node kinds', '# Node kinds of type documents'),
      );
    }
    return parts.length > 0 ? parts.join('\n\n---\n\n') : 'No document types are available yet.';
  }

  private renderIntegrations(): string {
    const instances = getIntegrationInstances(this.deps.store.documents).map((instance) => ({
      id: instance.id,
      name: instance.name,
      vendor: instance.vendor,
    }));
    return `${JSON.stringify({ instances, note: 'Read-only. Add instances with create_integration_instance.' }, null, 2)}\n`;
  }
}
