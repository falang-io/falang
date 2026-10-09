// oxlint-disable max-lines -- a flat data catalog: one small entry per amoCRM API v4 endpoint.
import type { TVariableInfo } from '@falang/typescript-dto';

/**
 * Hand-written catalog of the amoCRM REST API v4 endpoints, checked against the official PHP library
 * (`EntitiesServices/*`). Bodies reference the struct types of `amocrm-types.ts` (`amocrm/<Name>`).
 * Every method returns the raw JSON of the response; list endpoints answer HTTP 204 with an empty body
 * when nothing matches.
 */

/** `PUT` is used by exactly one endpoint: attaching Drive files to an entity. */
export type TAmoCrmHttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export interface IAmoCrmMethodParam {
  readonly name: string;
  readonly type: TVariableInfo;
  readonly required?: boolean;
}

export interface IAmoCrmMethod {
  /** camelCase, unique. */
  readonly id: string;
  /** Russian UI label, "<Group> — <action>" (never ':' — labels go through i18next `t()`). */
  readonly label: string;
  /** English UI label in the same style. */
  readonly labelEn: string;
  /** Russian group name. */
  readonly group: string;
  /** English group name. */
  readonly groupEn: string;
  readonly httpMethod: TAmoCrmHttpMethod;
  /** Path with `{param}` placeholders, e.g. `/api/v4/leads/{id}`. */
  readonly path: string;
  /** Every `{brace}` of `path`, in order; required implicitly. */
  readonly pathParams: readonly IAmoCrmMethodParam[];
  /** Query string params (`filter`/`order` are serialized PHP-style: `filter[id][]=1`). */
  readonly queryParams: readonly IAmoCrmMethodParam[];
  /** Type of the JSON body; absent = no body. */
  readonly body?: TVariableInfo;
  /** Short English hint for an LLM. */
  readonly notes?: string;
}

const str: TVariableInfo = { type: 'string' };
const bool: TVariableInfo = { type: 'boolean' };
const int: TVariableInfo = { type: 'number', numberType: { type: 'integer', integerType: 'int64' } };
const any: TVariableInfo = { type: 'any' };
const opt = (t: TVariableInfo): TVariableInfo => ({ ...t, optional: true });
const struct = (name: string): TVariableInfo => ({ type: 'struct', id: `amocrm/${name}` });
const arrayOf = (t: TVariableInfo): TVariableInfo => ({ type: 'array', elementType: t, dimensions: 1 });
const listOf = (name: string): TVariableInfo => arrayOf(struct(name));

const param = (name: string, type: TVariableInfo): IAmoCrmMethodParam => ({ name, type: opt(type) });

// ---- Query params convention ---------------------------------------------------------------------
const page = param('page', int);
const limit = param('limit', int);
const withParam = param('with', str);
const query = param('query', { type: 'union', unionTypes: [str, int] });
const filter = param('filter', any);
const order = param('order', any);

const paged = [page, limit];

// ---- Path params: integer ids unless listed here -------------------------------------------------
const STRING_PATH_PARAMS = new Set(['entity_type', 'uid', 'code']);

const ENTITY_TYPES_4 = 'leads | contacts | companies | customers';
const EMPTY_LIST = 'Returns HTTP 204 (empty body) when nothing matches.';

interface IGroup {
  readonly ru: string;
  readonly en: string;
}

interface IMethodOptions {
  readonly query?: readonly IAmoCrmMethodParam[];
  readonly body?: TVariableInfo;
  readonly notes?: string;
  /** Overrides the type of a path param (default: `entity_type`/`uid`/`code` string, everything else int). */
  readonly pathTypes?: Readonly<Record<string, TVariableInfo>>;
}

const pathParamsOf = (path: string, pathTypes: Readonly<Record<string, TVariableInfo>> = {}): IAmoCrmMethodParam[] =>
  [...path.matchAll(/\{([a-z_]+)\}/g)].map(([, name]) => ({
    name,
    type: pathTypes[name] ?? (STRING_PATH_PARAMS.has(name) ? str : int),
    required: true,
  }));

const method = (
  group: IGroup,
  id: string,
  actionRu: string,
  actionEn: string,
  httpMethod: TAmoCrmHttpMethod,
  path: string,
  options: IMethodOptions = {},
): IAmoCrmMethod => ({
  id,
  label: `${group.ru} — ${actionRu}`,
  labelEn: `${group.en} — ${actionEn}`,
  group: group.ru,
  groupEn: group.en,
  httpMethod,
  path,
  pathParams: pathParamsOf(path, options.pathTypes),
  queryParams: options.query ?? [],
  ...(options.body ? { body: options.body } : {}),
  ...(options.notes ? { notes: options.notes } : {}),
});

const G = {
  account: { ru: 'Аккаунт', en: 'Account' },
  leads: { ru: 'Сделки', en: 'Leads' },
  unsorted: { ru: 'Неразобранное', en: 'Unsorted' },
  pipelines: { ru: 'Воронки', en: 'Pipelines' },
  statuses: { ru: 'Этапы воронок', en: 'Pipeline statuses' },
  lossReasons: { ru: 'Причины отказа', en: 'Loss reasons' },
  contacts: { ru: 'Контакты', en: 'Contacts' },
  companies: { ru: 'Компании', en: 'Companies' },
  catalogs: { ru: 'Каталоги', en: 'Catalogs' },
  catalogElements: { ru: 'Элементы каталогов', en: 'Catalog elements' },
  links: { ru: 'Связи', en: 'Links' },
  tasks: { ru: 'Задачи', en: 'Tasks' },
  customFields: { ru: 'Поля', en: 'Custom fields' },
  customFieldGroups: { ru: 'Группы полей', en: 'Custom field groups' },
  tags: { ru: 'Теги', en: 'Tags' },
  events: { ru: 'События', en: 'Events' },
  notes: { ru: 'Примечания', en: 'Notes' },
  customers: { ru: 'Покупатели', en: 'Customers' },
  customerStatuses: { ru: 'Статусы покупателей', en: 'Customer statuses' },
  segments: { ru: 'Сегменты покупателей', en: 'Customer segments' },
  transactions: { ru: 'Транзакции', en: 'Transactions' },
  users: { ru: 'Пользователи', en: 'Users' },
  roles: { ru: 'Роли', en: 'Roles' },
  webhooks: { ru: 'Вебхуки', en: 'Webhooks' },
  widgets: { ru: 'Виджеты', en: 'Widgets' },
  calls: { ru: 'Звонки', en: 'Calls' },
  sources: { ru: 'Источники', en: 'Sources' },
  shortLinks: { ru: 'Короткие ссылки', en: 'Short links' },
  talks: { ru: 'Беседы', en: 'Talks' },
  currencies: { ru: 'Валюты', en: 'Currencies' },
  products: { ru: 'Товары', en: 'Products' },
  subscriptions: { ru: 'Подписки', en: 'Subscriptions' },
  files: { ru: 'Файлы сущностей', en: 'Entity files' },
  chatTemplates: { ru: 'Шаблоны чатов', en: 'Chat templates' },
  websiteButtons: { ru: 'Кнопки на сайт', en: 'Website buttons' },
} satisfies Record<string, IGroup>;

const ENTITY_FILTER_KEYS =
  'filter keys: id, name, created_by, updated_by, responsible_user_id, created_at/updated_at/closest_task_at ({from,to}), custom_fields_values; order keys: created_at | updated_at | id (asc | desc).';

export const AMOCRM_METHODS: readonly IAmoCrmMethod[] = [
  // ---- Account ------------------------------------------------------------------------------------
  method(G.account, 'getAccount', 'получить информацию', 'get info', 'GET', '/api/v4/account', {
    query: [withParam],
    notes:
      'with: amojo_id, uuid, amojo_rights, users_groups, task_types, version, datetime_settings, invoices_settings, is_api_filter_enabled, drive_url.',
  }),

  // ---- Leads --------------------------------------------------------------------------------------
  method(G.leads, 'getLeads', 'получить список', 'get list', 'GET', '/api/v4/leads', {
    query: [...paged, withParam, query, filter, order],
    notes: `with: catalog_elements, is_price_modified_by_robot, contacts, source_id, loss_reason, only_deleted, source. Extra filter keys: price, pipeline_id, statuses ([{pipeline_id, status_id}]), closed_at; ${ENTITY_FILTER_KEYS} limit max 250. ${EMPTY_LIST}`,
  }),
  method(G.leads, 'getLead', 'получить по ID', 'get by ID', 'GET', '/api/v4/leads/{id}', {
    query: [withParam],
    notes:
      'with: catalog_elements, is_price_modified_by_robot, contacts, source_id, loss_reason, only_deleted, source.',
  }),
  method(G.leads, 'addLeads', 'добавить', 'add', 'POST', '/api/v4/leads', {
    body: listOf('LeadInput'),
    notes: 'Body is an array (max 250). _embedded.contacts/companies link existing entities by id.',
  }),
  method(G.leads, 'updateLeads', 'изменить несколько', 'update many', 'PATCH', '/api/v4/leads', {
    body: listOf('LeadInput'),
    notes: 'Body is an array; every item needs id.',
  }),
  method(G.leads, 'updateLead', 'изменить по ID', 'update by ID', 'PATCH', '/api/v4/leads/{id}', {
    body: struct('LeadInput'),
    notes: 'Body is a single object. loss_reason_id is only accepted together with status_id 143 (lost).',
  }),
  method(
    G.leads,
    'addLeadsComplex',
    'комплексное добавление',
    'add with contact and company',
    'POST',
    '/api/v4/leads/complex',
    {
      body: listOf('LeadComplexInput'),
      notes:
        'Creates leads together with a new contact and company (_embedded.contacts/companies hold full inputs, max one each). Max 50 leads per request. Response is an array of {id, contact_id, company_id, request_id, merged}.',
    },
  ),

  // ---- Unsorted -----------------------------------------------------------------------------------
  method(G.unsorted, 'getUnsortedList', 'получить список', 'get list', 'GET', '/api/v4/leads/unsorted', {
    query: [...paged, filter, order],
    notes: `filter keys: uid, category (sip | mail | forms | chats), pipeline_id; order keys: created_at | updated_at. ${EMPTY_LIST}`,
  }),
  method(G.unsorted, 'getUnsorted', 'получить по UID', 'get by UID', 'GET', '/api/v4/leads/unsorted/{uid}'),
  method(
    G.unsorted,
    'addUnsortedForms',
    'добавить заявки с форм',
    'add form submissions',
    'POST',
    '/api/v4/leads/unsorted/forms',
    {
      body: listOf('UnsortedFormsInput'),
      notes:
        'Body is an array. source_uid, source_name and metadata are required; _embedded.leads must hold exactly one lead.',
    },
  ),
  method(G.unsorted, 'addUnsortedSip', 'добавить звонки', 'add calls', 'POST', '/api/v4/leads/unsorted/sip', {
    body: listOf('UnsortedSipInput'),
    notes: 'Body is an array; incoming calls only. source_uid, source_name and metadata are required.',
  }),
  method(G.unsorted, 'acceptUnsorted', 'принять', 'accept', 'POST', '/api/v4/leads/unsorted/{uid}/accept', {
    body: struct('UnsortedAcceptInput'),
  }),
  method(G.unsorted, 'declineUnsorted', 'отклонить', 'decline', 'DELETE', '/api/v4/leads/unsorted/{uid}/decline', {
    body: struct('UnsortedDeclineInput'),
    notes: 'DELETE with a JSON body.',
  }),
  method(G.unsorted, 'linkUnsorted', 'привязать', 'link', 'POST', '/api/v4/leads/unsorted/{uid}/link', {
    body: struct('UnsortedLinkInput'),
    notes: 'Chat (and mail) unsorted only. link.entity_type: leads | customers.',
  }),
  method(G.unsorted, 'getUnsortedSummary', 'получить сводку', 'get summary', 'GET', '/api/v4/leads/unsorted/summary', {
    query: [filter],
    notes: 'filter keys: uid, created_at (timestamp or {from,to}), pipeline_id.',
  }),

  // ---- Pipelines and statuses ---------------------------------------------------------------------
  method(G.pipelines, 'getPipelines', 'получить список', 'get list', 'GET', '/api/v4/leads/pipelines', {
    notes: 'Statuses are embedded (_embedded.statuses).',
  }),
  method(G.pipelines, 'getPipeline', 'получить по ID', 'get by ID', 'GET', '/api/v4/leads/pipelines/{id}'),
  method(G.pipelines, 'addPipelines', 'добавить', 'add', 'POST', '/api/v4/leads/pipelines', {
    body: listOf('PipelineInput'),
    notes: 'Body is an array; a new pipeline must carry its statuses in _embedded.statuses.',
  }),
  method(G.pipelines, 'updatePipeline', 'изменить', 'update', 'PATCH', '/api/v4/leads/pipelines/{id}', {
    body: struct('PipelineInput'),
  }),
  method(G.pipelines, 'deletePipeline', 'удалить', 'delete', 'DELETE', '/api/v4/leads/pipelines/{id}', {
    notes: 'Returns HTTP 204.',
  }),
  method(
    G.statuses,
    'getPipelineStatuses',
    'получить список',
    'get list',
    'GET',
    '/api/v4/leads/pipelines/{pipeline_id}/statuses',
    {
      query: [withParam],
      notes: 'with: descriptions. Status ids 142 (won) and 143 (lost) exist in every pipeline.',
    },
  ),
  method(
    G.statuses,
    'getPipelineStatus',
    'получить по ID',
    'get by ID',
    'GET',
    '/api/v4/leads/pipelines/{pipeline_id}/statuses/{id}',
    {
      query: [withParam],
      notes: 'with: descriptions.',
    },
  ),
  method(
    G.statuses,
    'addPipelineStatuses',
    'добавить',
    'add',
    'POST',
    '/api/v4/leads/pipelines/{pipeline_id}/statuses',
    {
      body: listOf('PipelineStatusInput'),
    },
  ),
  method(
    G.statuses,
    'updatePipelineStatus',
    'изменить',
    'update',
    'PATCH',
    '/api/v4/leads/pipelines/{pipeline_id}/statuses/{id}',
    {
      body: struct('PipelineStatusInput'),
    },
  ),
  method(
    G.statuses,
    'deletePipelineStatus',
    'удалить',
    'delete',
    'DELETE',
    '/api/v4/leads/pipelines/{pipeline_id}/statuses/{id}',
    {
      notes: 'Returns HTTP 204.',
    },
  ),

  // ---- Loss reasons -------------------------------------------------------------------------------
  method(G.lossReasons, 'getLossReasons', 'получить список', 'get list', 'GET', '/api/v4/leads/loss_reasons', {
    query: paged,
  }),
  method(G.lossReasons, 'getLossReason', 'получить по ID', 'get by ID', 'GET', '/api/v4/leads/loss_reasons/{id}'),
  method(G.lossReasons, 'addLossReasons', 'добавить', 'add', 'POST', '/api/v4/leads/loss_reasons', {
    body: listOf('LossReasonInput'),
  }),
  method(G.lossReasons, 'updateLossReason', 'изменить', 'update', 'PATCH', '/api/v4/leads/loss_reasons/{id}', {
    body: struct('LossReasonInput'),
  }),
  method(G.lossReasons, 'deleteLossReason', 'удалить', 'delete', 'DELETE', '/api/v4/leads/loss_reasons/{id}'),

  // ---- Contacts -----------------------------------------------------------------------------------
  method(G.contacts, 'getContacts', 'получить список', 'get list', 'GET', '/api/v4/contacts', {
    query: [...paged, withParam, query, filter, order],
    notes: `with: leads, customers, catalog_elements, social_profiles, only_deleted. query searches name, phone, e-mail and other fields. ${ENTITY_FILTER_KEYS} ${EMPTY_LIST}`,
  }),
  method(G.contacts, 'getContact', 'получить по ID', 'get by ID', 'GET', '/api/v4/contacts/{id}', {
    query: [withParam],
    notes: 'with: leads, customers, catalog_elements, social_profiles, only_deleted.',
  }),
  method(G.contacts, 'addContacts', 'добавить', 'add', 'POST', '/api/v4/contacts', {
    body: listOf('ContactInput'),
    notes:
      'Body is an array. Phone/e-mail are custom_fields_values with field_code PHONE / EMAIL (enum_code WORK, MOB, …).',
  }),
  method(G.contacts, 'updateContacts', 'изменить несколько', 'update many', 'PATCH', '/api/v4/contacts', {
    body: listOf('ContactInput'),
    notes: 'Body is an array; every item needs id.',
  }),
  method(G.contacts, 'updateContact', 'изменить по ID', 'update by ID', 'PATCH', '/api/v4/contacts/{id}', {
    body: struct('ContactInput'),
  }),
  method(
    G.contacts,
    'getContactChats',
    'получить привязанные чаты',
    'get linked chats',
    'GET',
    '/api/v4/contacts/chats',
    {
      query: [param('contact_id', any), param('chat_id', any)],
      notes: 'Top-level (not filter[]) query params; each may be one value or an array.',
    },
  ),
  method(G.contacts, 'linkContactChats', 'привязать чаты', 'link chats', 'POST', '/api/v4/contacts/chats', {
    body: listOf('ChatLinkInput'),
  }),

  // ---- Companies ----------------------------------------------------------------------------------
  method(G.companies, 'getCompanies', 'получить список', 'get list', 'GET', '/api/v4/companies', {
    query: [...paged, withParam, query, filter, order],
    notes: `with: leads, customers, contacts, catalog_elements, only_deleted. ${ENTITY_FILTER_KEYS} ${EMPTY_LIST}`,
  }),
  method(G.companies, 'getCompany', 'получить по ID', 'get by ID', 'GET', '/api/v4/companies/{id}', {
    query: [withParam],
    notes: 'with: leads, customers, contacts, catalog_elements, only_deleted.',
  }),
  method(G.companies, 'addCompanies', 'добавить', 'add', 'POST', '/api/v4/companies', {
    body: listOf('CompanyInput'),
  }),
  method(G.companies, 'updateCompanies', 'изменить несколько', 'update many', 'PATCH', '/api/v4/companies', {
    body: listOf('CompanyInput'),
    notes: 'Body is an array; every item needs id.',
  }),
  method(G.companies, 'updateCompany', 'изменить по ID', 'update by ID', 'PATCH', '/api/v4/companies/{id}', {
    body: struct('CompanyInput'),
  }),

  // ---- Catalogs and elements ----------------------------------------------------------------------
  method(G.catalogs, 'getCatalogs', 'получить список', 'get list', 'GET', '/api/v4/catalogs', {
    query: [...paged, param('type', str)],
    notes: 'type (top-level query param): regular | invoices | products | suppliers.',
  }),
  method(G.catalogs, 'getCatalog', 'получить по ID', 'get by ID', 'GET', '/api/v4/catalogs/{id}'),
  method(G.catalogs, 'addCatalogs', 'добавить', 'add', 'POST', '/api/v4/catalogs', {
    body: listOf('CatalogInput'),
  }),
  method(G.catalogs, 'updateCatalogs', 'изменить несколько', 'update many', 'PATCH', '/api/v4/catalogs', {
    body: listOf('CatalogInput'),
    notes: 'Body is an array; every item needs id.',
  }),
  method(G.catalogs, 'updateCatalog', 'изменить по ID', 'update by ID', 'PATCH', '/api/v4/catalogs/{id}', {
    body: struct('CatalogInput'),
  }),
  method(
    G.catalogElements,
    'getCatalogElements',
    'получить список',
    'get list',
    'GET',
    '/api/v4/catalogs/{catalog_id}/elements',
    {
      query: [...paged, withParam, query, filter],
      notes: `with: invoice_link, supplier_field_values. filter keys: id. ${EMPTY_LIST}`,
    },
  ),
  method(
    G.catalogElements,
    'getCatalogElement',
    'получить по ID',
    'get by ID',
    'GET',
    '/api/v4/catalogs/{catalog_id}/elements/{id}',
    {
      query: [withParam],
      notes: 'with: invoice_link, supplier_field_values.',
    },
  ),
  method(G.catalogElements, 'addCatalogElements', 'добавить', 'add', 'POST', '/api/v4/catalogs/{catalog_id}/elements', {
    body: listOf('CatalogElementInput'),
  }),
  method(
    G.catalogElements,
    'updateCatalogElements',
    'изменить несколько',
    'update many',
    'PATCH',
    '/api/v4/catalogs/{catalog_id}/elements',
    {
      body: listOf('CatalogElementInput'),
      notes: 'Body is an array; every item needs id.',
    },
  ),
  method(
    G.catalogElements,
    'updateCatalogElement',
    'изменить по ID',
    'update by ID',
    'PATCH',
    '/api/v4/catalogs/{catalog_id}/elements/{id}',
    {
      body: struct('CatalogElementInput'),
    },
  ),
  method(
    G.catalogElements,
    'getCatalogElementLinks',
    'получить связи',
    'get links',
    'GET',
    '/api/v4/catalogs/{catalog_id}/elements/{id}/links',
    {
      query: [filter],
      notes: 'filter keys: to_entity_id, to_entity_type, to_catalog_id.',
    },
  ),
  method(
    G.catalogElements,
    'linkCatalogElement',
    'привязать',
    'link',
    'POST',
    '/api/v4/catalogs/{catalog_id}/elements/{id}/link',
    {
      body: listOf('Link'),
      notes: 'to_entity_type: leads | customers.',
    },
  ),
  method(
    G.catalogElements,
    'unlinkCatalogElement',
    'отвязать',
    'unlink',
    'POST',
    '/api/v4/catalogs/{catalog_id}/elements/{id}/unlink',
    {
      body: listOf('Link'),
      notes: 'to_entity_type: leads | customers. Returns HTTP 204.',
    },
  ),

  // ---- Links --------------------------------------------------------------------------------------
  method(
    G.links,
    'getEntityLinks',
    'получить связи сущности',
    'get entity links',
    'GET',
    '/api/v4/{entity_type}/{entity_id}/links',
    {
      query: [filter],
      notes: `entity_type: ${ENTITY_TYPES_4}. filter keys: to_entity_id, to_entity_type, to_catalog_id.`,
    },
  ),
  method(
    G.links,
    'linkEntity',
    'привязать к сущности',
    'link to entity',
    'POST',
    '/api/v4/{entity_type}/{entity_id}/link',
    {
      body: listOf('Link'),
      notes:
        'entity_type: leads | contacts | companies | customers. to_entity_type per entity — leads: contacts, companies, catalog_elements; contacts: leads, customers, companies, catalog_elements; companies: leads, customers, contacts, catalog_elements; customers: contacts, companies, catalog_elements. metadata: {catalog_id, quantity} for catalog_elements, {is_main} for contacts.',
    },
  ),
  method(
    G.links,
    'unlinkEntity',
    'отвязать от сущности',
    'unlink from entity',
    'POST',
    '/api/v4/{entity_type}/{entity_id}/unlink',
    {
      body: listOf('Link'),
      notes: `entity_type: ${ENTITY_TYPES_4}. Returns HTTP 204.`,
    },
  ),
  method(
    G.links,
    'getLinks',
    'получить связи нескольких сущностей',
    'get links of many entities',
    'GET',
    '/api/v4/{entity_type}/links',
    {
      query: [filter],
      notes: `entity_type: ${ENTITY_TYPES_4}. filter[entity_id] (one id or an array) is required.`,
    },
  ),
  method(G.links, 'linkEntities', 'привязать массово', 'link many', 'POST', '/api/v4/{entity_type}/link', {
    body: listOf('Link'),
    notes: `entity_type: ${ENTITY_TYPES_4}. Every item needs entity_id.`,
  }),
  method(G.links, 'unlinkEntities', 'отвязать массово', 'unlink many', 'POST', '/api/v4/{entity_type}/unlink', {
    body: listOf('Link'),
    notes: `entity_type: ${ENTITY_TYPES_4}. Every item needs entity_id. Returns HTTP 204.`,
  }),

  // ---- Tasks --------------------------------------------------------------------------------------
  method(G.tasks, 'getTasks', 'получить список', 'get list', 'GET', '/api/v4/tasks', {
    query: [...paged, filter, order],
    notes: `filter keys: id, responsible_user_id, is_completed, task_type, entity_type, entity_id, created_by, updated_at; order keys: created_at | complete_till | id. ${EMPTY_LIST}`,
  }),
  method(G.tasks, 'getTask', 'получить по ID', 'get by ID', 'GET', '/api/v4/tasks/{id}'),
  method(G.tasks, 'addTasks', 'добавить', 'add', 'POST', '/api/v4/tasks', {
    body: listOf('TaskInput'),
    notes:
      'Body is an array. text and complete_till (unix timestamp) are required; entity_type: leads | contacts | companies | customers.',
  }),
  method(G.tasks, 'updateTasks', 'изменить несколько', 'update many', 'PATCH', '/api/v4/tasks', {
    body: listOf('TaskInput'),
    notes: 'Body is an array; every item needs id. Completing a task: is_completed true + result.text.',
  }),
  method(G.tasks, 'updateTask', 'изменить по ID', 'update by ID', 'PATCH', '/api/v4/tasks/{id}', {
    body: struct('TaskInput'),
  }),

  // ---- Custom fields ------------------------------------------------------------------------------
  method(
    G.customFields,
    'getCustomFields',
    'получить список',
    'get list',
    'GET',
    '/api/v4/{entity_type}/custom_fields',
    {
      query: [...paged, filter, order],
      notes: `entity_type: ${ENTITY_TYPES_4}. filter keys: id, type; order keys: sort | id. ${EMPTY_LIST}`,
    },
  ),
  method(
    G.customFields,
    'getCustomField',
    'получить по ID',
    'get by ID',
    'GET',
    '/api/v4/{entity_type}/custom_fields/{id}',
    {
      notes: `entity_type: ${ENTITY_TYPES_4}.`,
    },
  ),
  method(G.customFields, 'addCustomFields', 'добавить', 'add', 'POST', '/api/v4/{entity_type}/custom_fields', {
    body: listOf('CustomFieldInput'),
    notes: `entity_type: ${ENTITY_TYPES_4}. type: text | numeric | checkbox | select | multiselect | multitext | date | url | textarea | radiobutton | streetaddress | smart_address | birthday | legal_entity | date_time | price | category | items | tracking_data | linked_entity | chained_list | monetary | file | payer | supplier.`,
  }),
  method(
    G.customFields,
    'updateCustomField',
    'изменить',
    'update',
    'PATCH',
    '/api/v4/{entity_type}/custom_fields/{id}',
    {
      body: struct('CustomFieldInput'),
      notes: `entity_type: ${ENTITY_TYPES_4}. type is required in the body.`,
    },
  ),
  method(
    G.customFields,
    'deleteCustomField',
    'удалить',
    'delete',
    'DELETE',
    '/api/v4/{entity_type}/custom_fields/{id}',
    {
      notes: `entity_type: ${ENTITY_TYPES_4}.`,
    },
  ),
  method(
    G.customFields,
    'getCatalogCustomFields',
    'получить поля каталога',
    'get catalog fields',
    'GET',
    '/api/v4/catalogs/{catalog_id}/custom_fields',
    {
      query: [...paged, filter, order],
      notes: EMPTY_LIST,
    },
  ),
  method(
    G.customFields,
    'addCatalogCustomFields',
    'добавить поля каталога',
    'add catalog fields',
    'POST',
    '/api/v4/catalogs/{catalog_id}/custom_fields',
    {
      body: listOf('CustomFieldInput'),
    },
  ),
  method(
    G.customFields,
    'updateCatalogCustomField',
    'изменить поле каталога',
    'update catalog field',
    'PATCH',
    '/api/v4/catalogs/{catalog_id}/custom_fields/{id}',
    {
      body: struct('CustomFieldInput'),
    },
  ),
  method(
    G.customFields,
    'deleteCatalogCustomField',
    'удалить поле каталога',
    'delete catalog field',
    'DELETE',
    '/api/v4/catalogs/{catalog_id}/custom_fields/{id}',
  ),

  // ---- Custom field groups ------------------------------------------------------------------------
  method(
    G.customFieldGroups,
    'getCustomFieldGroups',
    'получить список',
    'get list',
    'GET',
    '/api/v4/{entity_type}/custom_fields/groups',
    {
      query: paged,
      notes: `entity_type: ${ENTITY_TYPES_4}.`,
    },
  ),
  method(
    G.customFieldGroups,
    'getCustomFieldGroup',
    'получить по ID',
    'get by ID',
    'GET',
    '/api/v4/{entity_type}/custom_fields/groups/{id}',
    {
      pathTypes: { id: str },
      notes: `entity_type: ${ENTITY_TYPES_4}. Group ids are strings (e.g. "leads_1586246382").`,
    },
  ),
  method(
    G.customFieldGroups,
    'addCustomFieldGroups',
    'добавить',
    'add',
    'POST',
    '/api/v4/{entity_type}/custom_fields/groups',
    {
      body: listOf('CustomFieldGroupInput'),
      notes: `entity_type: ${ENTITY_TYPES_4}.`,
    },
  ),
  method(
    G.customFieldGroups,
    'updateCustomFieldGroup',
    'изменить',
    'update',
    'PATCH',
    '/api/v4/{entity_type}/custom_fields/groups/{id}',
    {
      pathTypes: { id: str },
      body: struct('CustomFieldGroupInput'),
      notes: `entity_type: ${ENTITY_TYPES_4}.`,
    },
  ),
  method(
    G.customFieldGroups,
    'deleteCustomFieldGroup',
    'удалить',
    'delete',
    'DELETE',
    '/api/v4/{entity_type}/custom_fields/groups/{id}',
    {
      pathTypes: { id: str },
      notes: `entity_type: ${ENTITY_TYPES_4}.`,
    },
  ),

  // ---- Tags ---------------------------------------------------------------------------------------
  method(G.tags, 'getTags', 'получить список', 'get list', 'GET', '/api/v4/{entity_type}/tags', {
    query: [...paged, query, filter],
    notes: `entity_type: ${ENTITY_TYPES_4}. filter keys: id, name. ${EMPTY_LIST}`,
  }),
  method(G.tags, 'addTags', 'добавить', 'add', 'POST', '/api/v4/{entity_type}/tags', {
    body: listOf('TagInput'),
    notes: `entity_type: ${ENTITY_TYPES_4}. Tags are attached to an entity through its own _embedded.tags / tags_to_add instead.`,
  }),
  method(G.tags, 'updateLeadTags', 'изменить теги сделок', 'update lead tags', 'PATCH', '/api/v4/leads/tags', {
    body: listOf('TagInput'),
    notes: 'Only lead tags can be updated (e.g. color); every item needs id.',
  }),

  // ---- Events -------------------------------------------------------------------------------------
  method(G.events, 'getEvents', 'получить список', 'get list', 'GET', '/api/v4/events', {
    query: [...paged, withParam, filter],
    notes: `with: contact_name, lead_name, company_name, catalog_element_name, customer_name, catalog_name, note. filter keys: id, created_at, created_by, entity, entity_id, type, value_before, value_after. ${EMPTY_LIST}`,
  }),
  method(G.events, 'getEvent', 'получить по ID', 'get by ID', 'GET', '/api/v4/events/{id}', {
    pathTypes: { id: str },
    query: [withParam],
    notes: 'Event ids are strings.',
  }),
  method(G.events, 'getEventTypes', 'получить типы событий', 'get event types', 'GET', '/api/v4/events/types'),

  // ---- Notes --------------------------------------------------------------------------------------
  method(
    G.notes,
    'getNotes',
    'получить список по типу сущности',
    'get list by entity type',
    'GET',
    '/api/v4/{entity_type}/notes',
    {
      query: [...paged, filter, order],
      notes: `entity_type: ${ENTITY_TYPES_4}. filter keys: id, entity_id, note_type, updated_at; order keys: updated_at | id. ${EMPTY_LIST}`,
    },
  ),
  method(
    G.notes,
    'getEntityNotes',
    'получить список сущности',
    'get list of entity',
    'GET',
    '/api/v4/{entity_type}/{entity_id}/notes',
    {
      query: [...paged, filter, order],
      notes: `entity_type: ${ENTITY_TYPES_4}. filter keys: id, note_type, updated_at. ${EMPTY_LIST}`,
    },
  ),
  method(G.notes, 'getNote', 'получить по ID', 'get by ID', 'GET', '/api/v4/{entity_type}/{entity_id}/notes/{id}', {
    query: [withParam],
    notes: `entity_type: ${ENTITY_TYPES_4}. with: is_pinned.`,
  }),
  method(G.notes, 'addNotes', 'добавить', 'add', 'POST', '/api/v4/{entity_type}/notes', {
    body: listOf('NoteInput'),
    notes: `entity_type: ${ENTITY_TYPES_4}. Every item needs entity_id and note_type (common, call_in, call_out, service_message, extended_service_message, message_cashier, invoice_paid, geolocation, sms_in, sms_out, attachment, …) with matching params.`,
  }),
  method(G.notes, 'updateNotes', 'изменить несколько', 'update many', 'PATCH', '/api/v4/{entity_type}/notes', {
    body: listOf('NoteInput'),
    notes: `entity_type: ${ENTITY_TYPES_4}. Every item needs id.`,
  }),
  method(
    G.notes,
    'updateNote',
    'изменить по ID',
    'update by ID',
    'PATCH',
    '/api/v4/{entity_type}/{entity_id}/notes/{id}',
    {
      body: struct('NoteInput'),
      notes: `entity_type: ${ENTITY_TYPES_4}.`,
    },
  ),
  method(G.notes, 'pinNote', 'закрепить', 'pin', 'POST', '/api/v4/{entity_type}/notes/{id}/pin', {
    notes: `entity_type: ${ENTITY_TYPES_4}. Returns HTTP 204.`,
  }),
  method(G.notes, 'unpinNote', 'открепить', 'unpin', 'POST', '/api/v4/{entity_type}/notes/{id}/unpin', {
    notes: `entity_type: ${ENTITY_TYPES_4}. Returns HTTP 204.`,
  }),

  // ---- Customers ----------------------------------------------------------------------------------
  method(G.customers, 'getCustomers', 'получить список', 'get list', 'GET', '/api/v4/customers', {
    query: [...paged, withParam, query, filter, order],
    notes: `with: catalog_elements, contacts, companies, group_id. ${ENTITY_FILTER_KEYS} ${EMPTY_LIST}`,
  }),
  method(G.customers, 'getCustomer', 'получить по ID', 'get by ID', 'GET', '/api/v4/customers/{id}', {
    query: [withParam],
    notes: 'with: catalog_elements, contacts, companies, group_id.',
  }),
  method(G.customers, 'addCustomers', 'добавить', 'add', 'POST', '/api/v4/customers', {
    body: listOf('CustomerInput'),
  }),
  method(G.customers, 'updateCustomers', 'изменить несколько', 'update many', 'PATCH', '/api/v4/customers', {
    body: listOf('CustomerInput'),
    notes: 'Body is an array; every item needs id.',
  }),
  method(G.customers, 'updateCustomer', 'изменить по ID', 'update by ID', 'PATCH', '/api/v4/customers/{id}', {
    body: struct('CustomerInput'),
  }),
  method(G.customers, 'setCustomersMode', 'включить или выключить', 'switch mode', 'PATCH', '/api/v4/customers/mode', {
    body: struct('CustomersModeInput'),
    notes: 'mode: segments | periodicity.',
  }),
  method(
    G.customers,
    'earnBonusPoints',
    'начислить бонусные баллы',
    'earn bonus points',
    'POST',
    '/api/v4/customers/{id}/bonus_points',
    {
      body: struct('BonusPointsEarnInput'),
      notes: 'Response: {bonus_points} — the new balance.',
    },
  ),
  method(
    G.customers,
    'redeemBonusPoints',
    'списать бонусные баллы',
    'redeem bonus points',
    'POST',
    '/api/v4/customers/{id}/bonus_points',
    {
      body: struct('BonusPointsRedeemInput'),
      notes: 'Response: {bonus_points} — the new balance.',
    },
  ),
  method(
    G.customerStatuses,
    'getCustomerStatuses',
    'получить список',
    'get list',
    'GET',
    '/api/v4/customers/statuses',
    {
      query: paged,
    },
  ),
  method(
    G.customerStatuses,
    'getCustomerStatus',
    'получить по ID',
    'get by ID',
    'GET',
    '/api/v4/customers/statuses/{id}',
  ),
  method(G.customerStatuses, 'addCustomerStatuses', 'добавить', 'add', 'POST', '/api/v4/customers/statuses', {
    body: listOf('CustomerStatusInput'),
  }),
  method(G.customerStatuses, 'updateCustomerStatus', 'изменить', 'update', 'PATCH', '/api/v4/customers/statuses/{id}', {
    body: struct('CustomerStatusInput'),
  }),
  method(G.customerStatuses, 'deleteCustomerStatus', 'удалить', 'delete', 'DELETE', '/api/v4/customers/statuses/{id}'),
  method(G.segments, 'getSegments', 'получить список', 'get list', 'GET', '/api/v4/customers/segments', {
    query: paged,
  }),
  method(G.segments, 'getSegment', 'получить по ID', 'get by ID', 'GET', '/api/v4/customers/segments/{id}'),
  method(G.segments, 'addSegment', 'добавить', 'add', 'POST', '/api/v4/customers/segments', {
    body: struct('SegmentInput'),
    notes: 'Body is a single object (not an array).',
  }),
  method(G.segments, 'updateSegment', 'изменить', 'update', 'PATCH', '/api/v4/customers/segments/{id}', {
    body: struct('SegmentInput'),
  }),
  method(G.transactions, 'getTransactions', 'получить список', 'get list', 'GET', '/api/v4/customers/transactions', {
    query: [...paged, filter],
    notes: `filter keys: id. ${EMPTY_LIST}`,
  }),
  method(
    G.transactions,
    'getCustomerTransactions',
    'получить список покупателя',
    'get customer list',
    'GET',
    '/api/v4/customers/{customer_id}/transactions',
    {
      query: [...paged, filter],
      notes: EMPTY_LIST,
    },
  ),
  method(G.transactions, 'getTransaction', 'получить по ID', 'get by ID', 'GET', '/api/v4/customers/transactions/{id}'),
  method(G.transactions, 'addTransactions', 'добавить', 'add', 'POST', '/api/v4/customers/{customer_id}/transactions', {
    query: [param('accrue_bonus', bool)],
    body: listOf('TransactionInput'),
    notes: 'Body is an array. accrue_bonus (query, true | false) accrues bonus points for the purchase.',
  }),
  method(G.transactions, 'deleteTransaction', 'удалить', 'delete', 'DELETE', '/api/v4/customers/transactions/{id}', {
    notes: 'Returns HTTP 204.',
  }),

  // ---- Users and roles ----------------------------------------------------------------------------
  method(G.users, 'getUsers', 'получить список', 'get list', 'GET', '/api/v4/users', {
    query: [...paged, withParam],
    notes: 'with: role, group, uuid, amojo_id, user_rank, phone_number.',
  }),
  method(G.users, 'getUser', 'получить по ID', 'get by ID', 'GET', '/api/v4/users/{id}', {
    query: [withParam],
    notes: 'with: role, group, uuid, amojo_id, user_rank, phone_number.',
  }),
  method(G.users, 'addUsers', 'добавить', 'add', 'POST', '/api/v4/users', {
    body: listOf('UserInput'),
    notes: 'Body is an array; name, email and password are required.',
  }),
  method(G.users, 'activateUsers', 'активировать', 'activate', 'POST', '/api/v4/users/activate', {
    body: listOf('IdRef'),
    notes: 'Body is an array of {id}, max 10 users per request. Returns HTTP 204.',
  }),
  method(G.users, 'deactivateUsers', 'деактивировать', 'deactivate', 'POST', '/api/v4/users/deactivate', {
    body: listOf('IdRef'),
    notes: 'Body is an array of {id}, max 10 users per request. Returns HTTP 204.',
  }),
  method(G.roles, 'getRoles', 'получить список', 'get list', 'GET', '/api/v4/roles', {
    query: [...paged, withParam],
    notes: 'with: users.',
  }),
  method(G.roles, 'getRole', 'получить по ID', 'get by ID', 'GET', '/api/v4/roles/{id}', {
    query: [withParam],
    notes: 'with: users.',
  }),
  method(G.roles, 'addRoles', 'добавить', 'add', 'POST', '/api/v4/roles', { body: listOf('RoleInput') }),
  method(G.roles, 'updateRoles', 'изменить несколько', 'update many', 'PATCH', '/api/v4/roles', {
    body: listOf('RoleInput'),
    notes: 'Body is an array; every item needs id.',
  }),
  method(G.roles, 'updateRole', 'изменить по ID', 'update by ID', 'PATCH', '/api/v4/roles/{id}', {
    body: struct('RoleInput'),
  }),
  method(G.roles, 'deleteRole', 'удалить', 'delete', 'DELETE', '/api/v4/roles/{id}'),

  // ---- Webhooks, widgets --------------------------------------------------------------------------
  method(G.webhooks, 'getWebhooks', 'получить список', 'get list', 'GET', '/api/v4/webhooks', {
    query: [filter],
    notes: 'filter keys: destination.',
  }),
  method(G.webhooks, 'subscribeWebhook', 'подписаться', 'subscribe', 'POST', '/api/v4/webhooks', {
    body: struct('WebhookInput'),
    notes:
      'Body is a single object. settings: add_lead, update_lead, delete_lead, status_lead, responsible_lead, add_contact, …, note_lead, add_talk, incoming_chat_message, …',
  }),
  method(G.webhooks, 'unsubscribeWebhook', 'отписаться', 'unsubscribe', 'DELETE', '/api/v4/webhooks', {
    body: struct('WebhookUnsubscribeInput'),
    notes: 'DELETE with a JSON body {destination}.',
  }),
  method(G.widgets, 'getWidgets', 'получить список', 'get list', 'GET', '/api/v4/widgets', { query: paged }),
  method(G.widgets, 'getWidget', 'получить по коду', 'get by code', 'GET', '/api/v4/widgets/{code}'),
  method(G.widgets, 'installWidget', 'установить', 'install', 'POST', '/api/v4/widgets/{code}', {
    body: any,
    notes: "Body is the widget's settings object (keys from its settings_template).",
  }),
  method(G.widgets, 'uninstallWidget', 'отключить', 'uninstall', 'DELETE', '/api/v4/widgets/{code}'),

  // ---- Calls, sources, short links, talks, currencies, products -----------------------------------
  method(G.calls, 'addCalls', 'добавить', 'add', 'POST', '/api/v4/calls', {
    body: listOf('CallInput'),
    notes:
      'Body is an array. direction: inbound | outbound; phone, duration, source required. The call is attached to the contact/company/lead found by phone.',
  }),
  method(G.sources, 'getSources', 'получить список', 'get list', 'GET', '/api/v4/sources', {
    query: [filter],
    notes: 'filter keys: external_id.',
  }),
  method(G.sources, 'getSource', 'получить по ID', 'get by ID', 'GET', '/api/v4/sources/{id}'),
  method(G.sources, 'addSources', 'добавить', 'add', 'POST', '/api/v4/sources', {
    body: listOf('SourceInput'),
    notes: 'Sources belong to the calling integration; name and external_id are required.',
  }),
  method(G.sources, 'updateSources', 'изменить несколько', 'update many', 'PATCH', '/api/v4/sources', {
    body: listOf('SourceInput'),
    notes: 'Body is an array; every item needs id.',
  }),
  method(G.sources, 'updateSource', 'изменить по ID', 'update by ID', 'PATCH', '/api/v4/sources/{id}', {
    body: struct('SourceInput'),
  }),
  method(G.sources, 'deleteSource', 'удалить', 'delete', 'DELETE', '/api/v4/sources/{id}'),
  method(G.sources, 'deleteSources', 'удалить несколько', 'delete many', 'DELETE', '/api/v4/sources', {
    body: listOf('IdRef'),
    notes: 'DELETE with a JSON body: an array of {id}.',
  }),
  method(G.shortLinks, 'addShortLinks', 'создать', 'create', 'POST', '/api/v4/short_links', {
    body: listOf('ShortLinkInput'),
    notes: 'metadata.entity_type: contacts | companies. Response: _embedded.short_links with the generated links.',
  }),
  method(G.talks, 'getTalks', 'получить список', 'get list', 'GET', '/api/v4/talks', {
    query: [...paged, filter],
    notes: `filter keys: talk_id, entity_id, entity_type, contact_id, only_in_work. ${EMPTY_LIST}`,
  }),
  method(G.talks, 'getTalk', 'получить по ID', 'get by ID', 'GET', '/api/v4/talks/{id}'),
  method(G.talks, 'closeTalk', 'закрыть', 'close', 'POST', '/api/v4/talks/{id}/close', {
    body: struct('TalkCloseInput'),
    notes: 'Returns HTTP 204.',
  }),
  method(G.currencies, 'getCurrencies', 'получить список', 'get list', 'GET', '/api/v4/currencies', { query: paged }),
  method(
    G.products,
    'getProductsSettings',
    'получить настройки',
    'get settings',
    'GET',
    '/api/v4/catalogs/products/settings',
  ),
  method(
    G.products,
    'updateProductsSettings',
    'изменить настройки',
    'update settings',
    'PATCH',
    '/api/v4/catalogs/products/settings',
    {
      body: struct('ProductsSettings'),
    },
  ),

  // ---- Subscriptions, entity files ----------------------------------------------------------------
  method(
    G.subscriptions,
    'getEntitySubscriptions',
    'получить подписчиков',
    'get subscribers',
    'GET',
    '/api/v4/{entity_type}/{entity_id}/subscriptions',
    {
      query: paged,
      notes: 'entity_type: leads | customers. The API has no subscribe/unsubscribe endpoints.',
    },
  ),
  method(G.files, 'getEntityFiles', 'получить список', 'get list', 'GET', '/api/v4/{entity_type}/{entity_id}/files', {
    query: [...paged, filter],
    notes: `entity_type: ${ENTITY_TYPES_4}. ${EMPTY_LIST}`,
  }),
  method(G.files, 'attachEntityFiles', 'прикрепить', 'attach', 'PUT', '/api/v4/{entity_type}/{entity_id}/files', {
    body: listOf('EntityFile'),
    notes: `entity_type: ${ENTITY_TYPES_4}. Attaches files already uploaded to amoCRM Drive, by file_uuid.`,
  }),
  method(G.files, 'detachEntityFiles', 'открепить', 'detach', 'DELETE', '/api/v4/{entity_type}/{entity_id}/files', {
    body: listOf('EntityFile'),
    notes: `entity_type: ${ENTITY_TYPES_4}. DELETE with a JSON body: an array of {file_uuid}.`,
  }),

  // ---- Chat templates -----------------------------------------------------------------------------
  method(G.chatTemplates, 'getChatTemplates', 'получить список', 'get list', 'GET', '/api/v4/chats/templates', {
    query: [...paged, filter],
    notes: `filter keys: external_id. ${EMPTY_LIST}`,
  }),
  method(G.chatTemplates, 'getChatTemplate', 'получить по ID', 'get by ID', 'GET', '/api/v4/chats/templates/{id}'),
  method(G.chatTemplates, 'addChatTemplates', 'добавить', 'add', 'POST', '/api/v4/chats/templates', {
    body: listOf('ChatTemplateInput'),
    notes: 'type: amocrm | waba. buttons[].type: inline | url.',
  }),
  method(
    G.chatTemplates,
    'updateChatTemplates',
    'изменить несколько',
    'update many',
    'PATCH',
    '/api/v4/chats/templates',
    {
      body: listOf('ChatTemplateInput'),
      notes: 'Body is an array; every item needs id.',
    },
  ),
  method(
    G.chatTemplates,
    'updateChatTemplate',
    'изменить по ID',
    'update by ID',
    'PATCH',
    '/api/v4/chats/templates/{id}',
    {
      body: struct('ChatTemplateInput'),
    },
  ),
  method(G.chatTemplates, 'deleteChatTemplate', 'удалить', 'delete', 'DELETE', '/api/v4/chats/templates/{id}'),
  method(
    G.chatTemplates,
    'deleteChatTemplates',
    'удалить несколько',
    'delete many',
    'DELETE',
    '/api/v4/chats/templates',
    {
      body: listOf('IdRef'),
      notes: 'DELETE with a JSON body: an array of {id}.',
    },
  ),
  method(
    G.chatTemplates,
    'sendChatTemplateOnReview',
    'отправить на модерацию',
    'send for review',
    'POST',
    '/api/v4/chats/templates/{id}/review',
    {
      notes: 'WhatsApp (waba) templates only. No body.',
    },
  ),
  method(
    G.chatTemplates,
    'updateChatTemplateReview',
    'изменить статус модерации',
    'update review status',
    'POST',
    '/api/v4/chats/templates/{id}/review/{review_id}',
    {
      body: struct('ChatTemplateReview'),
    },
  ),

  // ---- Website buttons ----------------------------------------------------------------------------
  method(G.websiteButtons, 'getWebsiteButtons', 'получить список', 'get list', 'GET', '/api/v4/website_buttons', {
    query: [...paged, withParam],
    notes: `with: scripts, deleted. ${EMPTY_LIST}`,
  }),
  method(
    G.websiteButtons,
    'getWebsiteButton',
    'получить по ID источника',
    'get by source ID',
    'GET',
    '/api/v4/website_buttons/{source_id}',
    {
      query: [withParam],
      notes: 'with: scripts, deleted.',
    },
  ),
  method(G.websiteButtons, 'addWebsiteButton', 'создать', 'create', 'POST', '/api/v4/website_buttons', {
    body: struct('WebsiteButtonCreateInput'),
    notes: 'Body is a single object. Created asynchronously; the response holds source_id.',
  }),
  method(
    G.websiteButtons,
    'updateWebsiteButton',
    'изменить',
    'update',
    'PATCH',
    '/api/v4/website_buttons/{source_id}',
    {
      body: struct('WebsiteButtonUpdateInput'),
    },
  ),
  method(
    G.websiteButtons,
    'addWebsiteButtonOnlineChat',
    'подключить онлайн-чат',
    'add online chat',
    'POST',
    '/api/v4/website_buttons/{source_id}/online_chat',
    {
      notes: 'No body.',
    },
  ),
];
