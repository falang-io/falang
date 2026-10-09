// oxlint-disable max-lines -- one descriptor per frequently used amoCRM operation; each is small and self-contained.
import type { TVariableInfo } from '@falang/typescript-dto';
import type { IActionDescriptor, IFieldConfig, IIntegrationStructType } from '@falang/workflow-integrations-common';
import {
  AMOCRM_ADD_NOTE_NAME,
  AMOCRM_COMPLETE_TASK_NAME,
  AMOCRM_CREATE_COMPANY_NAME,
  AMOCRM_CREATE_CONTACT_NAME,
  AMOCRM_CREATE_LEAD_COMPLEX_NAME,
  AMOCRM_CREATE_LEAD_NAME,
  AMOCRM_CREATE_TASK_NAME,
  AMOCRM_FIND_CONTACTS_NAME,
  AMOCRM_FIND_LEADS_NAME,
  AMOCRM_GET_LEAD_NAME,
  AMOCRM_LINK_ENTITIES_NAME,
  AMOCRM_UPDATE_CONTACT_NAME,
  AMOCRM_UPDATE_LEAD_NAME,
  AMOCRM_VENDOR,
} from './constants.js';

const int64: TVariableInfo = { type: 'number', numberType: { type: 'integer', integerType: 'int64' } };
const anyNumber: TVariableInfo = { type: 'number', numberType: { type: 'any' } };
const optional = (type: TVariableInfo): TVariableInfo => ({ ...type, optional: true });
const struct = (id: string): TVariableInfo => ({ type: 'struct', id });
const arrayOf = (id: string): TVariableInfo => ({ type: 'array', elementType: { type: 'struct', id }, dimensions: 1 });

export const AMOCRM_CREATED_ENTITY_STRUCT_ID = 'amocrm/CreatedEntity';
export const AMOCRM_COMPLEX_LEAD_RESULT_STRUCT_ID = 'amocrm/ComplexLeadResult';

/** Result structs of the dedicated actions below — the entity structs themselves (`amocrm/Lead`, …) live in `amocrm-types.ts`. */
export const AMOCRM_ACTION_STRUCT_TYPES: readonly IIntegrationStructType[] = [
  { id: AMOCRM_CREATED_ENTITY_STRUCT_ID, name: 'AmoCrmCreatedEntity', properties: { id: int64 } },
  {
    id: AMOCRM_COMPLEX_LEAD_RESULT_STRUCT_ID,
    name: 'AmoCrmComplexLeadResult',
    properties: {
      id: int64,
      contactId: optional(int64),
      companyId: optional(int64),
      merged: { type: 'boolean' },
    },
  },
];

/** Entity types amoCRM accepts in `/api/v4/{entity_type}/…` paths for notes, tasks and links. */
const ENTITY_TYPE_OPTIONS = [
  { value: 'leads', label: 'amocrm:entityType.leads' },
  { value: 'contacts', label: 'amocrm:entityType.contacts' },
  { value: 'companies', label: 'amocrm:entityType.companies' },
  { value: 'customers', label: 'amocrm:entityType.customers' },
] as const;

const LINK_TARGET_OPTIONS = [
  ...ENTITY_TYPE_OPTIONS,
  { value: 'catalog_elements', label: 'amocrm:entityType.catalog_elements' },
] as const;

const credentialField: IFieldConfig = {
  name: 'credentialId',
  label: 'amocrm:field.account',
  kind: 'credential-ref',
  vendor: AMOCRM_VENDOR,
};
// `defaultValue` (even empty) marks a field optional in stored data — see `buildActionDataSchema`.
const resultVariableField: IFieldConfig = {
  name: 'resultVariable',
  label: 'amocrm:field.resultVariable',
  kind: 'new-variable',
  defaultValue: '',
};
const idField = (name: string, label: string): IFieldConfig => ({
  name,
  label,
  kind: 'expression',
  expectedType: int64,
});
/** An optional numeric field: stored as `undefined` until the user types a value. */
const optionalIdField = (name: string, label: string): IFieldConfig => ({
  name,
  label,
  kind: 'expression',
  expectedType: optional(int64),
  defaultValue: 'undefined',
});
const textField = (name: string, label: string): IFieldConfig => ({ name, label, kind: 'template-string' });
const priceField: IFieldConfig = {
  name: 'price',
  label: 'amocrm:field.price',
  kind: 'expression',
  expectedType: optional(anyNumber),
  defaultValue: 'undefined',
};
const extraField = (structId: string): IFieldConfig => ({
  name: 'extra',
  label: 'amocrm:field.extra',
  kind: 'expression',
  expectedType: struct(structId),
  defaultValue: '{}',
});
const entityTypeField = (name: string, label: string, options: IFieldConfig['options']): IFieldConfig => ({
  name,
  label,
  kind: 'select',
  options,
  defaultValue: 'leads',
});

/** An `expression` field compiles to its raw text — blank (a node saved before the field existed, or cleared) means `undefined`. */
const expr = (value: string | undefined): string => (value && value.trim() !== '' ? value : 'undefined');
const assignResult = (fields: Readonly<Record<string, string>>, call: string): string =>
  fields.resultVariable ? `const ${fields.resultVariable} = ${call};` : `${call};`;

// The strings below are TypeScript source emitted verbatim into activities.ts, not code executed
// here — the `${...}` placeholders inside them interpolate when that emitted file runs.

const createLeadAction: IActionDescriptor = {
  name: AMOCRM_CREATE_LEAD_NAME,
  label: 'amocrm:action.createLead',
  editorType: 'sidebar',
  fields: [
    credentialField,
    textField('name', 'amocrm:field.leadName'),
    priceField,
    optionalIdField('pipelineId', 'amocrm:field.pipelineId'),
    optionalIdField('statusId', 'amocrm:field.statusId'),
    optionalIdField('responsibleUserId', 'amocrm:field.responsibleUserId'),
    extraField('amocrm/LeadInput'),
    resultVariableField,
  ],
  emit: (fields) =>
    assignResult(
      fields,
      `await amocrmCreateLead(${fields.credentialId}, ${fields.name}, ${expr(fields.price)}, ${expr(fields.pipelineId)}, ${expr(fields.statusId)}, ${expr(fields.responsibleUserId)}, ${expr(fields.extra)})`,
    ),
  activitySignature:
    'amocrmCreateLead(credentialId: string, name: string, price: number | undefined, pipelineId: number | undefined, statusId: number | undefined, responsibleUserId: number | undefined, extra: Record<string, unknown> | undefined): Promise<{ id: number }>',
  activityCode: [
    'export const amocrmCreateLead = async (',
    '  credentialId: string,',
    '  name: string,',
    '  price: number | undefined,',
    '  pipelineId: number | undefined,',
    '  statusId: number | undefined,',
    '  responsibleUserId: number | undefined,',
    '  extra: Record<string, unknown> | undefined,',
    '): Promise<{ id: number }> => {',
    '  const lead = amocrmEntity(extra, {',
    '    name,',
    '    price,',
    '    pipeline_id: pipelineId,',
    '    status_id: statusId,',
    '    responsible_user_id: responsibleUserId,',
    '  });',
    "  const response = await amocrmRequest(credentialId, 'POST', '/api/v4/leads', undefined, [lead]);",
    "  return amocrmCreatedId(response, 'leads');",
    '};',
  ].join('\n'),
  resultType: struct(AMOCRM_CREATED_ENTITY_STRUCT_ID),
};

const updateLeadAction: IActionDescriptor = {
  name: AMOCRM_UPDATE_LEAD_NAME,
  label: 'amocrm:action.updateLead',
  editorType: 'sidebar',
  fields: [
    credentialField,
    idField('id', 'amocrm:field.leadId'),
    textField('name', 'amocrm:field.leadNameKeep'),
    priceField,
    optionalIdField('pipelineId', 'amocrm:field.pipelineId'),
    optionalIdField('statusId', 'amocrm:field.statusId'),
    optionalIdField('responsibleUserId', 'amocrm:field.responsibleUserId'),
    extraField('amocrm/LeadInput'),
  ],
  emit: (fields) =>
    `await amocrmUpdateLead(${fields.credentialId}, ${expr(fields.id)}, ${fields.name}, ${expr(fields.price)}, ${expr(fields.pipelineId)}, ${expr(fields.statusId)}, ${expr(fields.responsibleUserId)}, ${expr(fields.extra)});`,
  activitySignature:
    'amocrmUpdateLead(credentialId: string, id: number, name: string, price: number | undefined, pipelineId: number | undefined, statusId: number | undefined, responsibleUserId: number | undefined, extra: Record<string, unknown> | undefined): Promise<void>',
  activityCode: [
    'export const amocrmUpdateLead = async (',
    '  credentialId: string,',
    '  id: number,',
    '  name: string,',
    '  price: number | undefined,',
    '  pipelineId: number | undefined,',
    '  statusId: number | undefined,',
    '  responsibleUserId: number | undefined,',
    '  extra: Record<string, unknown> | undefined,',
    '): Promise<void> => {',
    '  const lead = amocrmEntity(extra, {',
    '    name,',
    '    price,',
    '    pipeline_id: pipelineId,',
    '    status_id: statusId,',
    '    responsible_user_id: responsibleUserId,',
    '  });',
    "  await amocrmRequest(credentialId, 'PATCH', `/api/v4/leads/${amocrmId(id)}`, undefined, lead);",
    '};',
  ].join('\n'),
};

const getLeadAction: IActionDescriptor = {
  name: AMOCRM_GET_LEAD_NAME,
  label: 'amocrm:action.getLead',
  fields: [
    credentialField,
    idField('id', 'amocrm:field.leadId'),
    { name: 'with', label: 'amocrm:field.with', kind: 'text', defaultValue: 'contacts' },
    resultVariableField,
  ],
  emit: (fields) =>
    assignResult(fields, `await amocrmGetLead(${fields.credentialId}, ${expr(fields.id)}, ${fields.with})`),
  activitySignature: 'amocrmGetLead(credentialId: string, id: number, withParam: string): Promise<any>',
  activityCode: [
    'export const amocrmGetLead = async (credentialId: string, id: number, withParam: string): Promise<any> => {',
    "  const response = await amocrmRequest(credentialId, 'GET', `/api/v4/leads/${amocrmId(id)}`, {",
    '    with: withParam || undefined,',
    '  });',
    '  return response ?? undefined;',
    '};',
  ].join('\n'),
  resultType: optional(struct('amocrm/Lead')),
};

const findLeadsAction: IActionDescriptor = {
  name: AMOCRM_FIND_LEADS_NAME,
  label: 'amocrm:action.findLeads',
  editorType: 'sidebar',
  fields: [
    credentialField,
    textField('query', 'amocrm:field.query'),
    {
      name: 'filter',
      label: 'amocrm:field.filter',
      kind: 'expression',
      expectedType: { type: 'any' },
      defaultValue: '{}',
    },
    { name: 'limit', label: 'amocrm:field.limit', kind: 'expression', expectedType: int64, defaultValue: '50' },
    { name: 'with', label: 'amocrm:field.with', kind: 'text', defaultValue: 'contacts' },
    resultVariableField,
  ],
  emit: (fields) =>
    assignResult(
      fields,
      `await amocrmFindLeads(${fields.credentialId}, ${fields.query}, ${expr(fields.filter)}, ${expr(fields.limit)}, ${fields.with})`,
    ),
  activitySignature:
    'amocrmFindLeads(credentialId: string, query: string, filter: unknown, limit: number | undefined, withParam: string): Promise<any[]>',
  activityCode: [
    'export const amocrmFindLeads = async (',
    '  credentialId: string,',
    '  query: string,',
    '  filter: unknown,',
    '  limit: number | undefined,',
    '  withParam: string,',
    '): Promise<any[]> => {',
    "  const response = await amocrmRequest(credentialId, 'GET', '/api/v4/leads', {",
    '    query: query || undefined,',
    '    filter,',
    '    limit,',
    '    with: withParam || undefined,',
    '  });',
    "  return amocrmEmbedded(response, 'leads');",
    '};',
  ].join('\n'),
  resultType: arrayOf('amocrm/Lead'),
};

const createLeadComplexAction: IActionDescriptor = {
  name: AMOCRM_CREATE_LEAD_COMPLEX_NAME,
  label: 'amocrm:action.createLeadComplex',
  editorType: 'sidebar',
  fields: [
    credentialField,
    textField('name', 'amocrm:field.leadName'),
    priceField,
    optionalIdField('pipelineId', 'amocrm:field.pipelineId'),
    optionalIdField('statusId', 'amocrm:field.statusId'),
    optionalIdField('responsibleUserId', 'amocrm:field.responsibleUserId'),
    textField('contactName', 'amocrm:field.contactName'),
    textField('phone', 'amocrm:field.phone'),
    textField('email', 'amocrm:field.email'),
    textField('companyName', 'amocrm:field.companyName'),
    extraField('amocrm/LeadInput'),
    resultVariableField,
  ],
  emit: (fields) =>
    assignResult(
      fields,
      `await amocrmCreateLeadComplex(${fields.credentialId}, ${fields.name}, ${expr(fields.price)}, ${expr(fields.pipelineId)}, ${expr(fields.statusId)}, ${expr(fields.responsibleUserId)}, ${fields.contactName}, ${fields.phone}, ${fields.email}, ${fields.companyName}, ${expr(fields.extra)})`,
    ),
  activitySignature:
    'amocrmCreateLeadComplex(credentialId: string, name: string, price: number | undefined, pipelineId: number | undefined, statusId: number | undefined, responsibleUserId: number | undefined, contactName: string, phone: string, email: string, companyName: string, extra: Record<string, unknown> | undefined): Promise<{ id: number; contactId?: number; companyId?: number; merged: boolean }>',
  activityCode: [
    'export const amocrmCreateLeadComplex = async (',
    '  credentialId: string,',
    '  name: string,',
    '  price: number | undefined,',
    '  pipelineId: number | undefined,',
    '  statusId: number | undefined,',
    '  responsibleUserId: number | undefined,',
    '  contactName: string,',
    '  phone: string,',
    '  email: string,',
    '  companyName: string,',
    '  extra: Record<string, unknown> | undefined,',
    '): Promise<{ id: number; contactId?: number; companyId?: number; merged: boolean }> => {',
    '  const lead = amocrmEntity(extra, {',
    '    name,',
    '    price,',
    '    pipeline_id: pipelineId,',
    '    status_id: statusId,',
    '    responsible_user_id: responsibleUserId,',
    '  });',
    '  const embedded: Record<string, unknown> = { ...((lead._embedded as Record<string, unknown> | undefined) ?? {}) };',
    '  const contactFields = amocrmContactFields(phone, email);',
    '  if (contactName.trim() || contactFields.length > 0) {',
    '    embedded.contacts = [amocrmEntity(undefined, { name: contactName.trim() }, contactFields)];',
    '  }',
    '  if (companyName.trim()) embedded.companies = [{ name: companyName.trim() }];',
    '  if (Object.keys(embedded).length > 0) lead._embedded = embedded;',
    "  const response = await amocrmRequest(credentialId, 'POST', '/api/v4/leads/complex', undefined, [lead]);",
    '  const created = Array.isArray(response) ? response[0] : undefined;',
    "  if (!created || typeof created.id !== 'number') throw new Error('amoCRM: complex lead creation returned no lead');",
    '  return {',
    '    id: created.id,',
    '    contactId: created.contact_id ?? undefined,',
    '    companyId: created.company_id ?? undefined,',
    '    merged: Boolean(created.merged),',
    '  };',
    '};',
  ].join('\n'),
  resultType: struct(AMOCRM_COMPLEX_LEAD_RESULT_STRUCT_ID),
};

const createContactAction: IActionDescriptor = {
  name: AMOCRM_CREATE_CONTACT_NAME,
  label: 'amocrm:action.createContact',
  editorType: 'sidebar',
  fields: [
    credentialField,
    textField('name', 'amocrm:field.contactName'),
    textField('phone', 'amocrm:field.phone'),
    textField('email', 'amocrm:field.email'),
    optionalIdField('responsibleUserId', 'amocrm:field.responsibleUserId'),
    extraField('amocrm/ContactInput'),
    resultVariableField,
  ],
  emit: (fields) =>
    assignResult(
      fields,
      `await amocrmCreateContact(${fields.credentialId}, ${fields.name}, ${fields.phone}, ${fields.email}, ${expr(fields.responsibleUserId)}, ${expr(fields.extra)})`,
    ),
  activitySignature:
    'amocrmCreateContact(credentialId: string, name: string, phone: string, email: string, responsibleUserId: number | undefined, extra: Record<string, unknown> | undefined): Promise<{ id: number }>',
  activityCode: [
    'export const amocrmCreateContact = async (',
    '  credentialId: string,',
    '  name: string,',
    '  phone: string,',
    '  email: string,',
    '  responsibleUserId: number | undefined,',
    '  extra: Record<string, unknown> | undefined,',
    '): Promise<{ id: number }> => {',
    '  const contact = amocrmEntity(',
    '    extra,',
    '    { name: name.trim(), responsible_user_id: responsibleUserId },',
    '    amocrmContactFields(phone, email),',
    '  );',
    "  const response = await amocrmRequest(credentialId, 'POST', '/api/v4/contacts', undefined, [contact]);",
    "  return amocrmCreatedId(response, 'contacts');",
    '};',
  ].join('\n'),
  resultType: struct(AMOCRM_CREATED_ENTITY_STRUCT_ID),
};

const updateContactAction: IActionDescriptor = {
  name: AMOCRM_UPDATE_CONTACT_NAME,
  label: 'amocrm:action.updateContact',
  editorType: 'sidebar',
  fields: [
    credentialField,
    idField('id', 'amocrm:field.contactId'),
    textField('name', 'amocrm:field.contactNameKeep'),
    textField('phone', 'amocrm:field.phoneReplace'),
    textField('email', 'amocrm:field.emailReplace'),
    optionalIdField('responsibleUserId', 'amocrm:field.responsibleUserId'),
    extraField('amocrm/ContactInput'),
  ],
  emit: (fields) =>
    `await amocrmUpdateContact(${fields.credentialId}, ${expr(fields.id)}, ${fields.name}, ${fields.phone}, ${fields.email}, ${expr(fields.responsibleUserId)}, ${expr(fields.extra)});`,
  activitySignature:
    'amocrmUpdateContact(credentialId: string, id: number, name: string, phone: string, email: string, responsibleUserId: number | undefined, extra: Record<string, unknown> | undefined): Promise<void>',
  activityCode: [
    'export const amocrmUpdateContact = async (',
    '  credentialId: string,',
    '  id: number,',
    '  name: string,',
    '  phone: string,',
    '  email: string,',
    '  responsibleUserId: number | undefined,',
    '  extra: Record<string, unknown> | undefined,',
    '): Promise<void> => {',
    '  const contact = amocrmEntity(',
    '    extra,',
    '    { name: name.trim(), responsible_user_id: responsibleUserId },',
    '    amocrmContactFields(phone, email),',
    '  );',
    "  await amocrmRequest(credentialId, 'PATCH', `/api/v4/contacts/${amocrmId(id)}`, undefined, contact);",
    '};',
  ].join('\n'),
};

const findContactsAction: IActionDescriptor = {
  name: AMOCRM_FIND_CONTACTS_NAME,
  label: 'amocrm:action.findContacts',
  editorType: 'sidebar',
  fields: [
    credentialField,
    textField('query', 'amocrm:field.contactQuery'),
    {
      name: 'filter',
      label: 'amocrm:field.filter',
      kind: 'expression',
      expectedType: { type: 'any' },
      defaultValue: '{}',
    },
    { name: 'limit', label: 'amocrm:field.limit', kind: 'expression', expectedType: int64, defaultValue: '50' },
    { name: 'with', label: 'amocrm:field.with', kind: 'text', defaultValue: 'leads' },
    resultVariableField,
  ],
  emit: (fields) =>
    assignResult(
      fields,
      `await amocrmFindContacts(${fields.credentialId}, ${fields.query}, ${expr(fields.filter)}, ${expr(fields.limit)}, ${fields.with})`,
    ),
  activitySignature:
    'amocrmFindContacts(credentialId: string, query: string, filter: unknown, limit: number | undefined, withParam: string): Promise<any[]>',
  activityCode: [
    'export const amocrmFindContacts = async (',
    '  credentialId: string,',
    '  query: string,',
    '  filter: unknown,',
    '  limit: number | undefined,',
    '  withParam: string,',
    '): Promise<any[]> => {',
    "  const response = await amocrmRequest(credentialId, 'GET', '/api/v4/contacts', {",
    '    query: query.trim() || undefined,',
    '    filter,',
    '    limit,',
    '    with: withParam || undefined,',
    '  });',
    "  return amocrmEmbedded(response, 'contacts');",
    '};',
  ].join('\n'),
  resultType: arrayOf('amocrm/Contact'),
};

const createCompanyAction: IActionDescriptor = {
  name: AMOCRM_CREATE_COMPANY_NAME,
  label: 'amocrm:action.createCompany',
  editorType: 'sidebar',
  fields: [
    credentialField,
    textField('name', 'amocrm:field.companyName'),
    textField('phone', 'amocrm:field.phone'),
    textField('email', 'amocrm:field.email'),
    optionalIdField('responsibleUserId', 'amocrm:field.responsibleUserId'),
    extraField('amocrm/CompanyInput'),
    resultVariableField,
  ],
  emit: (fields) =>
    assignResult(
      fields,
      `await amocrmCreateCompany(${fields.credentialId}, ${fields.name}, ${fields.phone}, ${fields.email}, ${expr(fields.responsibleUserId)}, ${expr(fields.extra)})`,
    ),
  activitySignature:
    'amocrmCreateCompany(credentialId: string, name: string, phone: string, email: string, responsibleUserId: number | undefined, extra: Record<string, unknown> | undefined): Promise<{ id: number }>',
  activityCode: [
    'export const amocrmCreateCompany = async (',
    '  credentialId: string,',
    '  name: string,',
    '  phone: string,',
    '  email: string,',
    '  responsibleUserId: number | undefined,',
    '  extra: Record<string, unknown> | undefined,',
    '): Promise<{ id: number }> => {',
    '  const company = amocrmEntity(',
    '    extra,',
    '    { name: name.trim(), responsible_user_id: responsibleUserId },',
    '    amocrmContactFields(phone, email),',
    '  );',
    "  const response = await amocrmRequest(credentialId, 'POST', '/api/v4/companies', undefined, [company]);",
    "  return amocrmCreatedId(response, 'companies');",
    '};',
  ].join('\n'),
  resultType: struct(AMOCRM_CREATED_ENTITY_STRUCT_ID),
};

const createTaskAction: IActionDescriptor = {
  name: AMOCRM_CREATE_TASK_NAME,
  label: 'amocrm:action.createTask',
  editorType: 'sidebar',
  fields: [
    credentialField,
    entityTypeField('entityType', 'amocrm:field.entityType', ENTITY_TYPE_OPTIONS),
    optionalIdField('entityId', 'amocrm:field.entityId'),
    textField('text', 'amocrm:field.taskText'),
    {
      name: 'completeTill',
      label: 'amocrm:field.completeTill',
      kind: 'expression',
      expectedType: int64,
      defaultValue: 'Math.floor(Date.now() / 1000) + 24 * 60 * 60',
    },
    optionalIdField('taskTypeId', 'amocrm:field.taskTypeId'),
    optionalIdField('responsibleUserId', 'amocrm:field.responsibleUserId'),
    resultVariableField,
  ],
  emit: (fields) =>
    assignResult(
      fields,
      `await amocrmCreateTask(${fields.credentialId}, ${fields.entityType}, ${expr(fields.entityId)}, ${fields.text}, ${expr(fields.completeTill)}, ${expr(fields.taskTypeId)}, ${expr(fields.responsibleUserId)})`,
    ),
  activitySignature:
    'amocrmCreateTask(credentialId: string, entityType: string, entityId: number | undefined, text: string, completeTill: number, taskTypeId: number | undefined, responsibleUserId: number | undefined): Promise<{ id: number }>',
  activityCode: [
    'export const amocrmCreateTask = async (',
    '  credentialId: string,',
    '  entityType: string,',
    '  entityId: number | undefined,',
    '  text: string,',
    '  completeTill: number,',
    '  taskTypeId: number | undefined,',
    '  responsibleUserId: number | undefined,',
    '): Promise<{ id: number }> => {',
    '  const task = amocrmEntity(undefined, {',
    '    text,',
    '    complete_till: completeTill,',
    '    task_type_id: taskTypeId,',
    '    responsible_user_id: responsibleUserId,',
    '    entity_id: entityId,',
    '    entity_type: entityId === undefined ? undefined : amocrmEntityType(entityType),',
    '  });',
    "  const response = await amocrmRequest(credentialId, 'POST', '/api/v4/tasks', undefined, [task]);",
    "  return amocrmCreatedId(response, 'tasks');",
    '};',
  ].join('\n'),
  resultType: struct(AMOCRM_CREATED_ENTITY_STRUCT_ID),
};

const completeTaskAction: IActionDescriptor = {
  name: AMOCRM_COMPLETE_TASK_NAME,
  label: 'amocrm:action.completeTask',
  fields: [credentialField, idField('id', 'amocrm:field.taskId'), textField('resultText', 'amocrm:field.taskResult')],
  emit: (fields) => `await amocrmCompleteTask(${fields.credentialId}, ${expr(fields.id)}, ${fields.resultText});`,
  activitySignature: 'amocrmCompleteTask(credentialId: string, id: number, resultText: string): Promise<void>',
  activityCode: [
    'export const amocrmCompleteTask = async (credentialId: string, id: number, resultText: string): Promise<void> => {',
    '  const task: Record<string, unknown> = { is_completed: true };',
    '  if (resultText.trim()) task.result = { text: resultText.trim() };',
    "  await amocrmRequest(credentialId, 'PATCH', `/api/v4/tasks/${amocrmId(id)}`, undefined, task);",
    '};',
  ].join('\n'),
};

const addNoteAction: IActionDescriptor = {
  name: AMOCRM_ADD_NOTE_NAME,
  label: 'amocrm:action.addNote',
  editorType: 'sidebar',
  fields: [
    credentialField,
    entityTypeField('entityType', 'amocrm:field.entityType', ENTITY_TYPE_OPTIONS),
    idField('entityId', 'amocrm:field.entityId'),
    textField('text', 'amocrm:field.noteText'),
    resultVariableField,
  ],
  emit: (fields) =>
    assignResult(
      fields,
      `await amocrmAddNote(${fields.credentialId}, ${fields.entityType}, ${expr(fields.entityId)}, ${fields.text})`,
    ),
  activitySignature:
    'amocrmAddNote(credentialId: string, entityType: string, entityId: number, text: string): Promise<{ id: number }>',
  activityCode: [
    'export const amocrmAddNote = async (',
    '  credentialId: string,',
    '  entityType: string,',
    '  entityId: number,',
    '  text: string,',
    '): Promise<{ id: number }> => {',
    "  const note = { entity_id: entityId, note_type: 'common', params: { text } };",
    '  const response = await amocrmRequest(',
    '    credentialId,',
    "    'POST',",
    '    `/api/v4/${amocrmEntityType(entityType)}/notes`,',
    '    undefined,',
    '    [note],',
    '  );',
    "  return amocrmCreatedId(response, 'notes');",
    '};',
  ].join('\n'),
  resultType: struct(AMOCRM_CREATED_ENTITY_STRUCT_ID),
};

const linkEntitiesAction: IActionDescriptor = {
  name: AMOCRM_LINK_ENTITIES_NAME,
  label: 'amocrm:action.linkEntities',
  editorType: 'sidebar',
  fields: [
    credentialField,
    entityTypeField('entityType', 'amocrm:field.entityType', ENTITY_TYPE_OPTIONS),
    idField('entityId', 'amocrm:field.entityId'),
    { ...entityTypeField('toEntityType', 'amocrm:field.toEntityType', LINK_TARGET_OPTIONS), defaultValue: 'contacts' },
    idField('toEntityId', 'amocrm:field.toEntityId'),
  ],
  emit: (fields) =>
    `await amocrmLinkEntities(${fields.credentialId}, ${fields.entityType}, ${expr(fields.entityId)}, ${fields.toEntityType}, ${expr(fields.toEntityId)});`,
  activitySignature:
    'amocrmLinkEntities(credentialId: string, entityType: string, entityId: number, toEntityType: string, toEntityId: number): Promise<void>',
  activityCode: [
    'export const amocrmLinkEntities = async (',
    '  credentialId: string,',
    '  entityType: string,',
    '  entityId: number,',
    '  toEntityType: string,',
    '  toEntityId: number,',
    '): Promise<void> => {',
    '  const link = { entity_id: entityId, to_entity_id: toEntityId, to_entity_type: amocrmEntityType(toEntityType) };',
    "  await amocrmRequest(credentialId, 'POST', `/api/v4/${amocrmEntityType(entityType)}/link`, undefined, [link]);",
    '};',
  ].join('\n'),
};

/** The frequently used operations, one node kind each — everything else goes through `amocrm-call-method`. */
export const AMOCRM_DEDICATED_ACTIONS: readonly IActionDescriptor[] = [
  createLeadAction,
  updateLeadAction,
  getLeadAction,
  findLeadsAction,
  createLeadComplexAction,
  createContactAction,
  updateContactAction,
  findContactsAction,
  createCompanyAction,
  createTaskAction,
  completeTaskAction,
  addNoteAction,
  linkEntitiesAction,
];
