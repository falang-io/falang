import { Inject, Injectable, NotFoundException, Optional, type OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { ProjectExportService, type IProjectExportPayload } from '../export/project-export.service.js';
import type { ImportProjectDto } from '../export/dto/import-project.dto.js';
import type { Project } from '../projects/project.entity.js';
import { ProjectTemplate } from './project-template.entity.js';
import {
  PROJECT_TEMPLATE_SOURCE,
  type IExternalProjectTemplate,
  type IProjectTemplateSource,
} from './project-template-source.js';

export interface IProjectTemplateSummary {
  readonly id: string;
  /** Stable key of a script-maintained template (`#/templates/<slug>`); `null` for admin-UI ones. */
  readonly slug: string | null;
  readonly name: string;
  readonly description: string;
}

export interface IUpsertProjectTemplateInput {
  readonly name: string;
  readonly description?: string;
  readonly sortOrder?: number;
  readonly enabled?: boolean;
  readonly payload: ImportProjectDto;
}

/** Lowercase latin letters, digits and dashes — the shape of the public site's template slugs. */
export const PROJECT_TEMPLATE_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface IAdminProjectTemplate extends IProjectTemplateSummary {
  readonly enabled: boolean;
  readonly sortOrder: number;
  readonly sourceProjectId: string | null;
  readonly createdBy: string | null;
  readonly updatedAt: Date;
}

export const BLANK_TEMPLATE_NAME = 'Blank project';

/**
 * Templates are project exports stored in the DB. The blank one is seeded on an empty table; the
 * project's pinned `integrations` document needs no entry in a payload, since
 * `ProjectExportService.importProject` creates it through `ProjectsService.create`.
 */
@Injectable()
export class ProjectTemplatesService implements OnModuleInit {
  private readonly templates: Repository<ProjectTemplate>;
  private readonly exportService: ProjectExportService;
  private readonly source: IProjectTemplateSource | null;

  constructor(
    @InjectRepository(ProjectTemplate) templates: Repository<ProjectTemplate>,
    @Inject(ProjectExportService) exportService: ProjectExportService,
    // A provided PROJECT_TEMPLATE_SOURCE (the hosted edition's, from a @Global() module) adds templates beyond the table.
    @Optional() @Inject(PROJECT_TEMPLATE_SOURCE) source?: IProjectTemplateSource,
  ) {
    this.templates = templates;
    this.exportService = exportService;
    this.source = source ?? null;
  }

  async onModuleInit(): Promise<void> {
    await this.ensureDefaultTemplate();
  }

  async ensureDefaultTemplate(): Promise<void> {
    if ((await this.templates.count()) > 0) return;
    await this.templates.save(
      this.templates.create({
        name: BLANK_TEMPLATE_NAME,
        description: 'An empty project.',
        sortOrder: 0,
        enabled: true,
        payload: { formatVersion: 1, project: { id: '', name: BLANK_TEMPLATE_NAME }, folders: [], documents: [] },
        slug: null,
        sourceProjectId: null,
        createdBy: null,
      }),
    );
  }

  async listEnabled(): Promise<IProjectTemplateSummary[]> {
    const rows = await this.templates.find({ where: { enabled: true } });
    return rows
      .toSorted((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
      .map((row) => this.toSummary(row));
  }

  /** One enabled template by id or slug — what the client's `#/templates/<key>` route shows before creating. */
  async getEnabled(key: string): Promise<IProjectTemplateSummary> {
    const template = await this.resolveEnabled(key);
    return template.summary;
  }

  /** The payload of one enabled template by id or slug — the public guest view of a template. */
  async getEnabledPayload(key: string): Promise<IProjectExportPayload> {
    const template = await this.resolveEnabled(key);
    return template.loadPayload();
  }

  async listAll(): Promise<IAdminProjectTemplate[]> {
    const rows = await this.templates.find();
    return rows
      .toSorted((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
      .map((row) => this.toAdmin(row));
  }

  /** `templateKey` is the template's id or its slug. */
  async createProjectFromTemplate(ownerId: string, templateKey: string, name: string): Promise<Project> {
    const template = await this.resolveEnabled(templateKey);
    const payload = await template.loadPayload();
    return this.exportService.importProject(ownerId, {
      ...payload,
      project: { id: '', name },
    } as ImportProjectDto);
  }

  async create(
    adminId: string,
    input: { name: string; description?: string; sourceProjectId: string },
  ): Promise<IAdminProjectTemplate> {
    const payload = await this.exportService.exportProject(input.sourceProjectId, adminId);
    const saved = await this.templates.save(
      this.templates.create({
        name: input.name,
        description: input.description ?? '',
        sortOrder: 0,
        enabled: true,
        payload,
        slug: null,
        sourceProjectId: input.sourceProjectId,
        createdBy: adminId,
      }),
    );
    return this.toAdmin(saved);
  }

  async update(
    id: string,
    patch: { name?: string; description?: string; enabled?: boolean; sortOrder?: number },
  ): Promise<IAdminProjectTemplate> {
    const template = await this.get(id);
    template.name = patch.name ?? template.name;
    template.description = patch.description ?? template.description;
    template.enabled = patch.enabled ?? template.enabled;
    template.sortOrder = patch.sortOrder ?? template.sortOrder;
    return this.toAdmin(await this.templates.save(template));
  }

  async refresh(id: string, adminId: string, sourceProjectId: string): Promise<IAdminProjectTemplate> {
    const template = await this.get(id);
    template.payload = await this.exportService.exportProject(sourceProjectId, adminId);
    template.sourceProjectId = sourceProjectId;
    return this.toAdmin(await this.templates.save(template));
  }

  async replacePayload(id: string, payload: ImportProjectDto): Promise<IAdminProjectTemplate> {
    const template = await this.get(id);
    template.payload = structuredClone(payload) as IProjectExportPayload;
    template.sourceProjectId = null;
    return this.toAdmin(await this.templates.save(template));
  }

  /**
   * Creates or replaces the template with this slug — name, description, order, enabled flag and payload all
   * come from the input (an omitted `sortOrder`/`enabled` keeps the stored value, a new template gets 0/true).
   */
  async upsertBySlug(
    slug: string,
    input: IUpsertProjectTemplateInput,
    adminId: string,
  ): Promise<IAdminProjectTemplate> {
    const existing = await this.templates.findOne({ where: { slug } });
    const template =
      existing ??
      this.templates.create({ slug, sortOrder: 0, enabled: true, sourceProjectId: null, createdBy: adminId });
    template.name = input.name;
    template.description = input.description ?? '';
    template.sortOrder = input.sortOrder ?? template.sortOrder;
    template.enabled = input.enabled ?? template.enabled;
    template.payload = structuredClone(input.payload) as IProjectExportPayload;
    template.sourceProjectId = null;
    return this.toAdmin(await this.templates.save(template));
  }

  async getPayload(id: string): Promise<IProjectExportPayload> {
    const template = await this.get(id);
    return template.payload;
  }

  async remove(id: string): Promise<void> {
    const template = await this.get(id);
    await this.templates.remove(template);
  }

  private async get(id: string): Promise<ProjectTemplate> {
    const template = await this.templates.findOne({ where: { id } });
    if (!template) throw new NotFoundException('Project template not found');
    return template;
  }

  /** An enabled stored template by id or slug, else whatever `PROJECT_TEMPLATE_SOURCE` finds for the key. */
  private async resolveEnabled(key: string): Promise<IExternalProjectTemplate> {
    const where = UUID_PATTERN.test(key) ? { id: key, enabled: true } : { slug: key, enabled: true };
    const template = await this.templates.findOne({ where });
    if (template) {
      const payload = template.payload;
      return { loadPayload: () => Promise.resolve(payload), summary: this.toSummary(template) };
    }
    const external = await this.source?.find(key);
    if (!external) throw new NotFoundException('Project template not found');
    return external;
  }

  private toSummary(row: ProjectTemplate): IProjectTemplateSummary {
    return { id: row.id, slug: row.slug, name: row.name, description: row.description };
  }

  private toAdmin(row: ProjectTemplate): IAdminProjectTemplate {
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      description: row.description,
      enabled: row.enabled,
      sortOrder: row.sortOrder,
      sourceProjectId: row.sourceProjectId,
      createdBy: row.createdBy,
      updatedAt: row.updatedAt,
    };
  }
}
