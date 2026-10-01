/**
 * The two system prompts of a magic run (ADR 0046 (private)) — plain English, LLM-only, not translated.
 * Each builder returns the run's `systemPrompt` and its user `request`.
 */
export interface IMagicPrompt {
  readonly systemPrompt: string;
  readonly request: string;
}

export interface IMagicGenerateParams {
  readonly nodeId: string;
  readonly documentId: string;
  readonly spell: string;
}

export interface IMagicUpdateParams extends IMagicGenerateParams {
  readonly previousSpell: string;
}

const COMMON_RULES = [
  'You fill exactly ONE node of a workflow scheme: a "magic" node that holds a plain-language text (its spell) and whose children are the real steps implementing it. You cannot edit anything else.',
  'Tools: get_tree (pass `documentId` and `nodeId` to read a node and its subtree), get_node_kinds (which node kinds exist and their data schemas — only call it for the kinds you need, pass `documentId`), search_integrations / list_integration_instances / create_integration_instance (find a vendor, reuse an existing instance), list_types (struct types), fill_magic_node (the one write tool) and finish.',
  'Call fill_magic_node exactly ONCE, with the complete list of children (a spell may need several nodes, e.g. an `if` with both branches, or an action followed by another). Put a one-line `note` in that same call naming your assumptions: which integration instance you used, which values are placeholders the person still has to fill in. Then call `finish` with the same line.',
  'Produce a draft of the right shape: use the vendor actions and node kinds that fit best, prefer EXISTING integration instances, and leave whatever the text does not say as a sensible placeholder. Create a new (blank) integration instance only when none exists for the vendor you need and you were not allowed to ask questions.',
  'Never create documents, never touch other nodes, never put a `magic` node inside the children. The first child of any list can never carry an `out` (break/continue/return/throw) — swap branches or use a later position instead.',
  'Variables in scope at the node are listed below; use them by name in expressions. Fields that hold code are real TypeScript; message-text fields are template-literal bodies (no backticks) — read each field description from get_node_kinds.',
];

const header = (p: IMagicGenerateParams): string =>
  `The magic node is ${JSON.stringify(p.nodeId)} in document ${JSON.stringify(p.documentId)}.`;

export const buildMagicGeneratePrompt = (params: IMagicGenerateParams): IMagicPrompt => ({
  systemPrompt: [
    ...COMMON_RULES,
    header(params),
    'Task: GENERATE the steps for the node from its text. The node has no steps yet (or they are to be replaced entirely). Call get_tree on the node if you need the enclosing context (what comes before and after it).',
  ].join('\n\n'),
  request: `Implement this step: ${params.spell}`,
});

export const buildMagicUpdatePrompt = (params: IMagicUpdateParams): IMagicPrompt => ({
  systemPrompt: [
    ...COMMON_RULES,
    header(params),
    'Task: UPDATE the steps of the node because its text changed. The current children are your starting point and may include edits made by hand — call get_tree with the node id to read them first. Keep everything the new text still needs exactly as it is, change only what the new text requires, then call fill_magic_node with the FULL new list (unchanged steps included, in order).',
  ].join('\n\n'),
  request: `The text of this step changed.\nOld text: ${params.previousSpell}\nNew text: ${params.spell}\nUpdate the steps to match the new text.`,
});
