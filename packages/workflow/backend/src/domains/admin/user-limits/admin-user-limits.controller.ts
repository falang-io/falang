import { Body, Controller, Get, Inject, NotFoundException, Param, Put, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../../auth/auth/admin.guard.js';
import { UsersService } from '../../users/users/users.service.js';
import { UserLimitsService } from './user-limits.service.js';
import type { IUserLimitsOverrides, IUserLimitsResponse } from './user-limits.types.js';
// oxlint-disable-next-line consistent-type-imports -- Nest's ValidationPipe resolves the DTO class from this parameter's runtime type metadata.
import { UpdateUserLimitsDto } from './dto/update-user-limits.dto.js';

const OVERRIDE_KEYS = [
  'maxProjectFilesBytes',
  'maxFileBytes',
  'devFileTtlHours',
  'ingressFileTtlHours',
  'maxConcurrentProdVersions',
] as const;

/**
 * `GET`/`PUT /admin/users/:id/limits` — see ADR 0038 (private) §2.
 * A separate controller from `AdminUsersController` (same split as `AdminAgentSettingsController`
 * living apart from it), routed onto the same `admin/users` path prefix.
 */
@UseGuards(AdminGuard)
@Controller('admin/users')
export class AdminUserLimitsController {
  private readonly userLimits: UserLimitsService;
  private readonly usersService: UsersService;

  constructor(
    @Inject(UserLimitsService) userLimits: UserLimitsService,
    @Inject(UsersService) usersService: UsersService,
  ) {
    this.userLimits = userLimits;
    this.usersService = usersService;
  }

  @Get(':id/limits')
  async get(@Param('id') id: string): Promise<IUserLimitsResponse> {
    await this.requireUser(id);
    return this.buildResponse(id);
  }

  @Put(':id/limits')
  async update(@Param('id') id: string, @Body() body: UpdateUserLimitsDto): Promise<IUserLimitsResponse> {
    await this.requireUser(id);
    // `body[key]` is always its own property on the DTO instance regardless of whether the
    // request included it (class-transformer defines every declared field), so `undefined` vs
    // `null` vs a real number must be told apart by value, not by presence — see CLAUDE.md's
    // "Ловушки" note. Only a provided field (a number, or an explicit `null` to clear it) is
    // forwarded; an omitted field must never overwrite an existing override with `null`.
    const overrides: IUserLimitsOverrides = {};
    for (const key of OVERRIDE_KEYS) {
      const value = body[key];
      if (typeof value === 'number' || value === null) overrides[key] = value;
    }
    await this.userLimits.setOverrides(id, overrides);
    return this.buildResponse(id);
  }

  private async requireUser(id: string): Promise<void> {
    const user = await this.usersService.findById(id);
    if (!user) throw new NotFoundException(`User "${id}" not found`);
  }

  private async buildResponse(id: string): Promise<IUserLimitsResponse> {
    const [effective, overrides] = await Promise.all([this.userLimits.getLimits(id), this.userLimits.getOverrides(id)]);
    return { effective, overrides };
  }
}
