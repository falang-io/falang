import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { Project } from '../../projects/projects/project.entity.js';
import type { TUserRole } from '../../users/users/user.entity.js';
import { UsersService } from '../../users/users/users.service.js';

export interface IAdminUser {
  readonly id: string;
  readonly username: string;
  readonly role: TUserRole;
  readonly language: string;
  readonly createdAt: string;
  readonly projectsCount: number;
}

/** See ADR 0030 (private)'s "Admin domain" — `GET /admin/users` / `PATCH /admin/users/:id/role`. */
@Injectable()
export class AdminUsersService {
  private readonly usersService: UsersService;
  private readonly projects: Repository<Project>;

  constructor(
    @Inject(UsersService) usersService: UsersService,
    @InjectRepository(Project) projects: Repository<Project>,
  ) {
    this.usersService = usersService;
    this.projects = projects;
  }

  async listUsers(): Promise<IAdminUser[]> {
    const users = await this.usersService.findAll();
    const counts = await this.projects
      .createQueryBuilder('project')
      .select('project.ownerId', 'ownerId')
      .addSelect('COUNT(*)', 'count')
      .groupBy('project.ownerId')
      .getRawMany<{ ownerId: string; count: string }>();
    const countByOwnerId = new Map(counts.map((row) => [row.ownerId, Number(row.count)]));
    return users.map((user) => ({
      id: user.id,
      username: user.username,
      role: user.role,
      language: user.language,
      createdAt: user.createdAt.toISOString(),
      projectsCount: countByOwnerId.get(user.id) ?? 0,
    }));
  }

  async updateRole(currentUserId: string, targetUserId: string, role: TUserRole): Promise<IAdminUser> {
    if (currentUserId === targetUserId) throw new BadRequestException('Cannot change your own role');
    const user = await this.usersService.findById(targetUserId);
    if (!user) throw new NotFoundException(`User "${targetUserId}" not found`);
    const updated = await this.usersService.updateRole(targetUserId, role);
    const projectsCount = await this.projects.count({ where: { ownerId: targetUserId } });
    return {
      id: updated.id,
      username: updated.username,
      role: updated.role,
      language: updated.language,
      createdAt: updated.createdAt.toISOString(),
      projectsCount,
    };
  }

  /** The plaintext password is returned exactly once and never stored or logged. */
  async createUser(username: string): Promise<{ id: string; username: string; password: string }> {
    if (await this.usersService.findByUsername(username)) throw new ConflictException('Username is already taken');
    const password = this.usersService.generatePassword();
    const user = await this.usersService.create({ username, password, role: 'user' });
    return { id: user.id, username: user.username, password };
  }

  async resetPassword(targetUserId: string): Promise<{ password: string }> {
    const user = await this.usersService.findById(targetUserId);
    if (!user) throw new NotFoundException(`User "${targetUserId}" not found`);
    const password = this.usersService.generatePassword();
    await this.usersService.setPassword(targetUserId, password);
    return { password };
  }
}
