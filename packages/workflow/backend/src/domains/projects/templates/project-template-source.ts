import type { IProjectExportPayload } from '../export/project-export.service.js';
import type { IProjectTemplateSummary } from './project-templates.service.js';

/** A template that is not a `project_templates` row — found by an `IProjectTemplateSource`. */
export interface IExternalProjectTemplate {
  readonly summary: IProjectTemplateSummary;
  /** The contents in the project export format (credential secrets blanked). Called only when they are needed. */
  loadPayload(): Promise<IProjectExportPayload>;
}

/**
 * Extra templates beyond the stored ones. `ProjectTemplatesService` asks the source only for a key that is neither a
 * stored template's id nor its slug, on the routes that open one template — `GET /project-templates/:key`, its
 * `/payload` (both public: the guest view) and `POST /projects/from-template/:key`. The list of templates is not
 * extended. The hosted edition shares chosen accounts' projects this way, a project id being the key.
 *
 * Overriding: export `PROJECT_TEMPLATE_SOURCE` from a `@Global()` Nest module (like `AGENT_USAGE_SINK`); the service
 * injects it `@Optional()`. A source returns `null` for a key it doesn't know, never throws for it.
 */
export interface IProjectTemplateSource {
  find(key: string): Promise<IExternalProjectTemplate | null>;
}

export const PROJECT_TEMPLATE_SOURCE = Symbol('PROJECT_TEMPLATE_SOURCE');
