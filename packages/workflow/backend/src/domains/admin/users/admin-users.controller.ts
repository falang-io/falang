import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../auth/auth/current-user.decorator.js';
import { AdminGuard } from '../../auth/auth/admin.guard.js';
import type { IJwtPayloadUser } from '../../auth/auth/jwt.strategy.js';
import { AdminUsersService, type IAdminUser, type IAdminUserProject } from './admin-users.service.js';
// oxlint-disable-next-line consistent-type-imports -- Nest's ValidationPipe resolves the DTO class from this parameter's runtime type metadata.
import { CreateUserDto } from './dto/create-user.dto.js';
// oxlint-disable-next-line consistent-type-imports -- see above.
import { UpdateUserRoleDto } from './dto/update-user-role.dto.js';

/** See ADR 0030 (private). */
@UseGuards(AdminGuard)
@Controller('admin/users')
export class AdminUsersController {
  private readonly adminUsersService: AdminUsersService;

  constructor(@Inject(AdminUsersService) adminUsersService: AdminUsersService) {
    this.adminUsersService = adminUsersService;
  }

  @Get()
  list(): Promise<IAdminUser[]> {
    return this.adminUsersService.listUsers();
  }

  @Get(':id')
  get(@Param('id') id: string): Promise<IAdminUser> {
    return this.adminUsersService.getUser(id);
  }

  /** Opened read-only in the main client — see `TProjectAccess` in `projects.service.ts`. */
  @Get(':id/projects')
  listProjects(@Param('id') id: string): Promise<IAdminUserProject[]> {
    return this.adminUsersService.listUserProjects(id);
  }

  @Post(':id/activate')
  @HttpCode(HttpStatus.OK)
  activate(@Param('id') id: string): Promise<{ sent: true } | { sent: false; password: string }> {
    return this.adminUsersService.activate(id);
  }

  @Patch(':id/role')
  updateRole(
    @CurrentUser() currentUser: IJwtPayloadUser,
    @Param('id') id: string,
    @Body() body: UpdateUserRoleDto,
  ): Promise<IAdminUser> {
    return this.adminUsersService.updateRole(currentUser.id, id, body.role);
  }

  @Post()
  create(@Body() body: CreateUserDto): Promise<{ id: string; username: string; password: string }> {
    return this.adminUsersService.createUser(body.username, body.email);
  }

  @Post(':id/reset-password')
  @HttpCode(HttpStatus.OK)
  resetPassword(@Param('id') id: string): Promise<{ password: string }> {
    return this.adminUsersService.resetPassword(id);
  }
}
