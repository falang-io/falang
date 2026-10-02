import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { IProjectTreeFolder } from '@falang/dto';
import { checkFolderPlacement } from '@falang/workflow-dto';
import type { Repository } from 'typeorm';
import { loadTreeFolders, toTreeFolder } from '../layout/project-layout.js';
import { ProjectsService } from '../projects/projects.service.js';
import type { CreateFolderDto } from './dto/create-folder.dto.js';
import type { UpdateFolderDto } from './dto/update-folder.dto.js';
import { Folder } from './folder.entity.js';

/**
 * `system: true` skips the fixed-layout rules (placement, fixed-folder protection) — only for version
 * restore's reconciliation, which replays a normalised snapshot step by step and may pass through
 * transient states a strict check would reject. Never reachable from a controller or an MCP tool.
 */
export interface IFolderWriteOptions {
  readonly system?: boolean;
}

@Injectable()
export class FoldersService {
  private readonly folders: Repository<Folder>;
  private readonly projectsService: ProjectsService;

  constructor(
    @InjectRepository(Folder) folders: Repository<Folder>,
    @Inject(ProjectsService) projectsService: ProjectsService,
  ) {
    this.folders = folders;
    this.projectsService = projectsService;
  }

  async listTree(projectId: string, ownerId: string): Promise<IProjectTreeFolder[]> {
    await this.projectsService.getOwnedProject(projectId, ownerId);
    const folders = await this.folders.find({ where: { projectId } });
    return folders.map((folder) => toTreeFolder(folder));
  }

  async create(
    projectId: string,
    ownerId: string,
    input: CreateFolderDto,
    options: IFolderWriteOptions = {},
  ): Promise<Folder> {
    await this.projectsService.getOwnedProject(projectId, ownerId);
    const parentId = input.parentId ?? null;
    if (options.system !== true) {
      await this.assertPlacement(projectId, input.id, parentId);
    }
    const folder = this.folders.create({
      id: input.id,
      name: input.name,
      parentId,
      projectId,
      fixedKind: null,
    });
    return this.folders.save(folder);
  }

  async update(
    projectId: string,
    ownerId: string,
    folderId: string,
    input: UpdateFolderDto,
    options: IFolderWriteOptions = {},
  ): Promise<Folder> {
    const folder = await this.getOwnedFolder(projectId, ownerId, folderId);
    const nameProvided = typeof input.name === 'string';
    const parentProvided = typeof input.parentId === 'string' || input.parentId === null;
    if (options.system !== true) {
      if (folder.fixedKind !== null && (nameProvided || parentProvided)) {
        throw new ForbiddenException(
          `Folder "${folder.name}" is a fixed project section and cannot be renamed or moved`,
        );
      }
      if (parentProvided && (input.parentId ?? null) !== folder.parentId) {
        await this.assertPlacement(projectId, folderId, input.parentId ?? null);
      }
    }
    if (nameProvided) folder.name = input.name ?? folder.name;
    if (parentProvided) folder.parentId = input.parentId ?? null;
    return this.folders.save(folder);
  }

  async delete(projectId: string, ownerId: string, folderId: string, options: IFolderWriteOptions = {}): Promise<void> {
    const folder = await this.getOwnedFolder(projectId, ownerId, folderId);
    if (options.system !== true && folder.fixedKind !== null) {
      throw new ForbiddenException(`Folder "${folder.name}" is a fixed project section and cannot be deleted`);
    }
    await this.folders.remove(folder);
  }

  /** 422 with the pure layout check's reason (also covers "parent does not exist", cycles and the root holding only sections). */
  private async assertPlacement(projectId: string, folderId: string, parentId: string | null): Promise<void> {
    const folders = await loadTreeFolders(this.folders, projectId);
    const reason = checkFolderPlacement(folderId, parentId, folders);
    if (reason !== null) throw new UnprocessableEntityException(reason);
  }

  private async getOwnedFolder(projectId: string, ownerId: string, folderId: string): Promise<Folder> {
    await this.projectsService.getOwnedProject(projectId, ownerId);
    const folder = await this.folders.findOneBy({ id: folderId, projectId });
    if (!folder) throw new NotFoundException(`Folder "${folderId}" not found`);
    return folder;
  }
}
