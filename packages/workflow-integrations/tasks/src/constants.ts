/** See ADR 0040 (private). */
export const TASKS_VENDOR = 'tasks';

/** The single all-in-one question node kind this vendor offers (ADR §1, "Option A"). */
export const HUMAN_TASK_NAME = 'human-task';

/** `<name>-option` child kind — see `@falang/workflow-integrations-common`'s `buildQuestionNodeConfig`. */
export const HUMAN_TASK_OPTION_NAME = 'human-task-option';

/** One signal shared by every `human-task` node in a compiled workflow — see `IQuestionDescriptor.answerSignalName`. */
export const HUMAN_TASK_ANSWER_SIGNAL_NAME = 'humanTaskAnswer';

/** Struct id for the `task` scope variable bound inside every option branch — see `task-types.ts`. */
export const TASK_TYPE_ID = 'tasks/Task';
