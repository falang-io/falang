import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { Project } from '../../projects/projects/project.entity.js';
import { MailService } from '../../mail/mail.service.js';
import { accountActivatedMail } from '../../mail/mail-templates.js';
import {
  userStatus,
  type TSignupSource,
  type TUserRole,
  type TUserStatus,
  type User,
} from '../../users/users/user.entity.js';
import { activationsTotal } from '../../metrics/metrics.js';
import { UsersService } from '../../users/users/users.service.js';

export interface IAdminUser {
  readonly id: string;
  readonly username: string;
  readonly role: TUserRole;
  readonly language: string;
  readonly createdAt: string;
  readonly projectsCount: number;
  readonly email: string | null;
  readonly status: TUserStatus;
  readonly companyName: string | null;
  readonly automationInterest: string | null;
  readonly signupSource: TSignupSource;
  readonly emailVerifiedAt: string | null;
  readonly activatedAt: string | null;
}

const toAdminUser = (user: User, projectsCount: number): IAdminUser => ({
  id: user.id,
  username: user.username,
  role: user.role,
  language: user.language,
  createdAt: user.createdAt.toISOString(),
  projectsCount,
  email: user.email,
  status: userStatus(user),
  companyName: user.companyName,
  automationInterest: user.automationInterest,
  signupSource: user.signupSource,
  emailVerifiedAt: user.emailVerifiedAt ? user.emailVerifiedAt.toISOString() : null,
  activatedAt: user.activatedAt ? user.activatedAt.toISOString() : null,
});

/** See ADR 0030 (private)'s "Admin domain" — `GET /admin/users` / `PATCH /admin/users/:id/role`. */
@Injectable()
export class AdminUsersService {
  private readonly usersService: UsersService;
  private readonly projects: Repository<Project>;
  private readonly mail: MailService;

  constructor(
    @Inject(UsersService) usersService: UsersService,
    @InjectRepository(Project) projects: Repository<Project>,
    @Inject(MailService) mail: MailService,
  ) {
    this.usersService = usersService;
    this.projects = projects;
    this.mail = mail;
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
    return users.map((user) => toAdminUser(user, countByOwnerId.get(user.id) ?? 0));
  }

  async getUser(id: string): Promise<IAdminUser> {
    const user = await this.usersService.findById(id);
    if (!user) throw new NotFoundException(`User "${id}" not found`);
    return toAdminUser(user, await this.projects.count({ where: { ownerId: id } }));
  }

  async updateRole(currentUserId: string, targetUserId: string, role: TUserRole): Promise<IAdminUser> {
    if (currentUserId === targetUserId) throw new BadRequestException('Cannot change your own role');
    const user = await this.usersService.findById(targetUserId);
    if (!user) throw new NotFoundException(`User "${targetUserId}" not found`);
    const updated = await this.usersService.updateRole(targetUserId, role);
    const projectsCount = await this.projects.count({ where: { ownerId: targetUserId } });
    return toAdminUser(updated, projectsCount);
  }

  /** The plaintext password is returned exactly once and never stored or logged. */
  async createUser(username: string, email?: string): Promise<{ id: string; username: string; password: string }> {
    if (await this.usersService.findByUsername(username)) throw new ConflictException('Username is already taken');
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : null;
    if (normalizedEmail && (await this.usersService.findByEmail(normalizedEmail))) {
      throw new ConflictException('E-mail is already taken');
    }
    const password = this.usersService.generatePassword();
    const user = await this.usersService.create({
      username,
      password,
      role: 'user',
      email: normalizedEmail,
      emailVerifiedAt: normalizedEmail ? new Date() : null,
    });
    return { id: user.id, username: user.username, password };
  }

  async resetPassword(targetUserId: string): Promise<{ password: string }> {
    const user = await this.usersService.findById(targetUserId);
    if (!user) throw new NotFoundException(`User "${targetUserId}" not found`);
    const password = this.usersService.generatePassword();
    await this.usersService.setPassword(targetUserId, password);
    return { password };
  }

  /**
   * Closed-beta activation: generates the password, e-mails login + password. The password is returned
   * only when the mail could not be sent, so the admin can pass it on by hand.
   */
  async activate(targetUserId: string): Promise<{ sent: true } | { sent: false; password: string }> {
    const user = await this.usersService.findById(targetUserId);
    if (!user) throw new NotFoundException(`User "${targetUserId}" not found`);
    if (user.activatedAt) throw new ConflictException('User is already activated');
    if (!user.emailVerifiedAt || !user.email) throw new ConflictException('The applicant has not confirmed the e-mail');
    const password = this.usersService.generatePassword();
    await this.usersService.setPassword(user.id, password);
    await this.usersService.markActivated(user.id);
    activationsTotal.inc();
    const content = accountActivatedMail(user.language, {
      login: user.username,
      password,
      loginUrl: this.mail.buildClientLink('/'),
    });
    const { sent } = await this.mail.send({
      to: user.email,
      subject: content.subject,
      text: content.text,
      html: content.html,
    });
    return sent ? { sent: true } : { sent: false, password };
  }
}
