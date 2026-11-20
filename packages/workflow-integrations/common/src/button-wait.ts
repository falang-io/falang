import type { TVariableInfo } from '@falang/typescript-dto';
import type { IFieldConfig, IIntegrationStructType, IQuestionDescriptor } from './types.js';

export const BUTTON_WAIT_PRESSED_LABEL = 'pressed';
export const BUTTON_WAIT_TIMEOUT_LABEL = 'timeout';
export const BUTTON_WAIT_ANSWER_VARIABLE_FIELD = 'answerVariable';
export const BUTTON_WAIT_DEFAULT_ANSWER_VARIABLE = 'answer';
export const BUTTON_WAIT_DEFAULT_TIMEOUT = '10m';

export const BUTTON_WAIT_BRANCHES = [
  { label: BUTTON_WAIT_PRESSED_LABEL, fixed: true, variable: BUTTON_WAIT_DEFAULT_ANSWER_VARIABLE },
  { label: BUTTON_WAIT_TIMEOUT_LABEL, fixed: true },
] as const;

/** Reads the configurable answer name for editor scope; an absent/invalid value shows the default until saved. */
export const buttonWaitAnswerVariable = (data: unknown): string => {
  if (data === null || typeof data !== 'object') return BUTTON_WAIT_DEFAULT_ANSWER_VARIABLE;
  const value = (data as Record<string, unknown>)[BUTTON_WAIT_ANSWER_VARIABLE_FIELD];
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : BUTTON_WAIT_DEFAULT_ANSWER_VARIABLE;
};

/** The value bound in the `pressed` branch. `value` is the original button value, not its callback payload. */
export const buildButtonWaitAnswerStructType = (id: string, name: string): IIntegrationStructType => ({
  id,
  name,
  properties: {
    value: { type: 'string' },
    text: { type: 'string' },
    index: { type: 'number', numberType: { type: 'any' } },
    userId: { type: 'number', numberType: { type: 'any' } },
    messageId: { type: 'string' },
  },
});

export interface IButtonWaitQuestionParams {
  readonly name: string;
  readonly label: string;
  readonly answerSignalName: string;
  readonly answerType: TVariableInfo;
  readonly contextFields: readonly IFieldConfig[];
  readonly textLabel: string;
  readonly buttonsLabel: string;
  readonly buttonsHelp?: string;
  readonly timeoutLabel: string;
  readonly timeoutHelp?: string;
  readonly answerVariableLabel: string;
  readonly answerVariableHelp?: string;
  readonly askActivitySignature: string;
  readonly askActivityCode: string;
  readonly resolveActivitySignature: string;
  readonly resolveActivityCode: string;
  readonly closeActivitySignature: string;
  readonly closeActivityCode: string;
  readonly journal?: IQuestionDescriptor['journal'];
}

/** Shared header/shape of `<vendor>-ask-buttons`; sending and vendor callback formats stay in the vendor package. */
export const buildButtonWaitQuestion = (params: IButtonWaitQuestionParams): IQuestionDescriptor => ({
  name: params.name,
  label: params.label,
  answerSignalName: params.answerSignalName,
  contextFields: params.contextFields,
  questionFields: [
    { name: 'text', label: params.textLabel, kind: 'template-string' },
    {
      name: 'buttons',
      label: params.buttonsLabel,
      ...(params.buttonsHelp ? { help: params.buttonsHelp } : {}),
      agentNotes:
        'Buttons to send before waiting. In variable mode the expression returns the button array. A pressed command button resumes this run with its original value; it does not start an on-command trigger. URL buttons are auxiliary and do not finish the wait.',
      kind: 'buttons',
      defaultValue: '[]',
    },
    {
      name: 'timeout',
      label: params.timeoutLabel,
      ...(params.timeoutHelp ? { help: params.timeoutHelp } : {}),
      agentNotes:
        'Required, never empty: how long to wait, a number followed by ms, s, m, h or d, e.g. `10m`, `2h`, `1d` (default `10m`). When it runs out the `timeout` branch runs.',
      kind: 'text',
      defaultValue: BUTTON_WAIT_DEFAULT_TIMEOUT,
    },
    {
      name: BUTTON_WAIT_ANSWER_VARIABLE_FIELD,
      label: params.answerVariableLabel,
      ...(params.answerVariableHelp ? { help: params.answerVariableHelp } : {}),
      agentNotes:
        'Required name of the variable available only in the `pressed` branch; defaults to `answer`. Its value has `value`, `text`, `index`, `userId` and `messageId`. Use `<name>.value` to branch programmatically.',
      kind: 'new-variable',
      defaultValue: BUTTON_WAIT_DEFAULT_ANSWER_VARIABLE,
      allowEmpty: false,
    },
  ],
  timeoutField: 'timeout',
  buttonWait: { answerVariableField: BUTTON_WAIT_ANSWER_VARIABLE_FIELD, answerType: params.answerType },
  askActivitySignature: params.askActivitySignature,
  askActivityCode: params.askActivityCode,
  resolveActivitySignature: params.resolveActivitySignature,
  resolveActivityCode: params.resolveActivityCode,
  closeActivitySignature: params.closeActivitySignature,
  closeActivityCode: params.closeActivityCode,
  ...(params.journal ? { journal: params.journal } : {}),
});
