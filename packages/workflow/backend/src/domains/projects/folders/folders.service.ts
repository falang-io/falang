import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { IProjectTreeFolder } from '@falang/dto';
import type { Repository } from 'typeorm';
import { ProjectsService } from '../projects/projects.service.js';
import type { CreateFolderDto } from './dto/create-folder.dto.js';
import type { UpdateFolderDto } from './dto/update-folder.dto.js';
import { Folder } from './folder.entity.js';

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
    return folders.map((folder) => ({ id: folder.id, name: folder.name, parentId: folder.parentId }));
  }

  async create(projectId: string, ownerId: string, input: CreateFolderDto): Promise<Folder> {
    await this.projectsService.getOwnedProject(projectId, ownerId);
    const folder = this.folders.create({
      id: input.id,
      name: input.name,
      parentId: input.parentId ?? null,
      projectId,
    });
    return this.folders.save(folder);
  }

  async update(projectId: string, ownerId: string, folderId: string, input: UpdateFolderDto): Promise<Folder> {
    const folder = await this.getOwnedFolder(projectId, ownerId, folderId);
    if (Object.hasOwn(input, 'name')) folder.name = input.name ?? folder.name;
    if (Object.hasOwn(input, 'parentId')) folder.parentId = input.parentId ?? null;
    return this.folders.save(folder);
  }

  async delete(projectId: string, ownerId: string, folderId: string): Promise<void> {
    const folder = await this.getOwnedFolder(projectId, ownerId, folderId);
    await this.folders.remove(folder);
  }

  private async getOwnedFolder(projectId: string, ownerId: string, folderId: string): Promise<Folder> {
    await this.projectsService.getOwnedProject(projectId, ownerId);
    const folder = await this.folders.findOneBy({ id: folderId, projectId });
    if (!folder) throw new NotFoundException(`Folder "${folderId}" not found`);
    return folder;
  }
}
