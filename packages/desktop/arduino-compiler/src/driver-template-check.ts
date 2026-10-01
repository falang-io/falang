import type { INode, IProjectDocument } from '@falang/dto';
import {
  ARDUINO_BUILTIN_DECLARATIONS,
  DEVICES_DOCUMENT_TYPE,
  buildDriverActionNodeName,
  type IDriverBundle,
  type IDriverConfig,
  type IDriverFieldDescriptor,
} from '@falang/desktop-arduino-dto';
import { compileExpressionWithAdapter } from '@falang/logic-constructor';
import { buildArduinoAdapter } from './arduino-adapter.js';
import { ArduinoProjectCompileError, compileArduinoProject } from './compile-arduino-project.js';
import type { IDriverValidationIssue } from './driver-validation-types.js';
import { substituteDriverTemplate, substituteTemplate } from './substitute-driver-template.js';

export const declaredName = (declaration: string): string | null =>
  /^declare (?:function|const) ([A-Za-z_]\w*)/.exec(declaration)?.[1] ?? null;

/** A value that is valid for `field`'s kind — used to substitute real code into a driver's templates for the type-check. */
const dummyFieldValue = (field: IDriverFieldDescriptor): string => {
  switch (field.kind) {
    case 'pin': {
      return '13';
    }
    case 'number': {
      return field.default ?? String(field.min ?? 0);
    }
    case 'select': {
      return field.options?.[0]?.value ?? '0';
    }
    case 'boolean': {
      return 'true';
    }
    case 'string': {
      return field.default ?? 'x';
    }
    case 'new-variable': {
      return field.default || 'result';
    }
    default: {
      return '0';
    }
  }
};

const dummyData = (fields: readonly IDriverFieldDescriptor[]): Record<string, string> =>
  Object.fromEntries(fields.map((field) => [field.name, dummyFieldValue(field)]));

const functionDocument = (id: string, name: string, body: INode[]): IProjectDocument => ({
  id,
  type: 'function',
  name,
  root: {
    id: `${id}-root`,
    name: 'function',
    children: [
      { id: `${id}-header`, name: 'function-header', data: '' },
      { id: `${id}-body`, name: 'function-body', data: { parameters: [] }, children: body },
      { id: `${id}-footer`, name: 'function-footer', data: '' },
    ],
  },
});

const actionNode = (config: IDriverConfig, actionId: string, id: string): INode => {
  const action = config.actions.find((a) => a.id === actionId);
  return { id, name: buildDriverActionNodeName(config.id, actionId), data: dummyData(action?.fields ?? []) };
};

const RESULT_TS_TYPE = { int: 'number', float: 'number', bool: 'boolean', string: 'string' } as const;

/**
 * The real lowering declares the result variable with the action's `resultType` but never checks the
 * expression against it, so an action returning the wrong type would only surface as bad C++ later.
 * Checked here by wrapping the substituted template in an identity function declared for that type.
 */
const resultTypeIssues = (config: IDriverConfig): IDriverValidationIssue[] => {
  const issues: IDriverValidationIssue[] = [];
  const callNames = config.declarations.map((d) => declaredName(d)).filter((name): name is string => name !== null);
  for (const action of config.actions) {
    if (!action.resultType) continue;
    const tsType = RESULT_TS_TYPE[action.resultType];
    const expression = `__expect_result(${substituteDriverTemplate(action, dummyData(action.fields))})`;
    const result = compileExpressionWithAdapter({
      expression,
      scope: {},
      adapter: buildArduinoAdapter([...callNames, '__expect_result']),
      extraDeclarations: [
        ...ARDUINO_BUILTIN_DECLARATIONS,
        ...config.declarations,
        `declare function __expect_result(value: ${tsType}): ${tsType};`,
      ],
    });
    if (!result.ok) {
      issues.push({
        stage: 'templates',
        message: `result is declared as "${action.resultType}" but the template does not produce it: ${result.diagnostics.join('; ')}`,
        action: action.id,
      });
    }
  }
  return issues;
};

interface ISyntheticSlot {
  readonly documentId: string;
  readonly action: string;
}

/** Stage 3 — one function document per action (plus one for the device `setupTemplate`), compiled by the real `compileArduinoProject`, so errors are attributable by document id. */
export const templatesStage = (config: IDriverConfig): IDriverValidationIssue[] => {
  const slots = new Map<string, ISyntheticSlot>();
  const documents: IProjectDocument[] = [];
  config.actions.forEach((action, index) => {
    const documentId = `check-action-${String(index)}`;
    slots.set(documentId, { documentId, action: action.id });
    documents.push(
      functionDocument(documentId, `checkAction${String(index)}`, [
        actionNode(config, action.id, `${documentId}-node`),
      ]),
    );
  });
  if (config.device) {
    const documentId = 'check-device';
    slots.set(documentId, { documentId, action: 'device' });
    const code = substituteTemplate(config.device.setupTemplate, config.device.fields, dummyData(config.device.fields));
    documents.push(
      functionDocument(documentId, 'checkDevice', [{ id: `${documentId}-node`, name: 'action', data: code }]),
    );
  }
  documents.push(functionDocument('check-setup', 'setup', []), functionDocument('check-loop', 'loop', []));
  try {
    compileArduinoProject({ documents, drivers: [config] });
    return resultTypeIssues(config);
  } catch (error) {
    if (!(error instanceof ArduinoProjectCompileError)) {
      return [{ stage: 'templates', message: error instanceof Error ? error.message : String(error) }];
    }
    return error.errors.map(
      (entry): IDriverValidationIssue => ({
        stage: 'templates',
        message: entry.message,
        action: slots.get(entry.documentId)?.action,
        nodeId: entry.nodeId,
      }),
    );
  }
};

/** Stage 4's sketch: every action in `setup()`, one device instance if declared, the driver's files alongside. */
export const buildSyntheticSketch = (bundle: IDriverBundle): Record<string, string> => {
  const { config } = bundle;
  const documents: IProjectDocument[] = [
    functionDocument(
      'check-setup',
      'setup',
      config.actions.map((action, index) => actionNode(config, action.id, `n${String(index)}`)),
    ),
    functionDocument('check-loop', 'loop', []),
  ];
  if (config.device) {
    documents.push({
      id: 'check-devices',
      type: DEVICES_DOCUMENT_TYPE,
      name: 'Devices',
      data: {
        pins: [],
        devices: [{ id: 'd', driverId: config.id, name: 'check', params: dummyData(config.device.fields) }],
      },
    });
  }
  const { code } = compileArduinoProject({ documents, drivers: [config] });
  return { 'sketch.ino': code, ...bundle.files };
};
