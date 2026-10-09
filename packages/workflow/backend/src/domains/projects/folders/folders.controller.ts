import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Inject, Param, Patch, Post } from '@nestjs/common';
import type { IProjectTreeFolder } from '@falang/dto';
import { CurrentUser } from '../../auth/auth/current-user.decorator.js';
import type { IJwtPayloadUser } from '../../auth/auth/jwt.strategy.js';
// Kept as value imports (not `import type`): Nest's global `ValidationPipe` resolves the DTO
// class to validate against from these parameters' runtime type metadata, so erasing the import
// would silently disable body validation on these routes.
// oxlint-disable-next-line consistent-type-imports
import { CreateFolderDto } from './dto/create-folder.dto.js';
// oxlint-disable-next-line consistent-type-imports
import { UpdateFolderDto } from './dto/update-folder.dto.js';
import { FoldersService } from './folders.service.js';

@Controller('projects/:projectId/folders')
export class FoldersController {
  private readonly foldersService: FoldersService;

  constructor(@Inject(FoldersService) foldersService: FoldersService) {
    this.foldersService = foldersService;
  }

  @Get()
  list(@Param('projectId') projectId: string, @CurrentUser() user: IJwtPayloadUser): Promise<IProjectTreeFolder[]> {
    return this.foldersService.listTree(projectId, user.id, 'read');
  }

  @Post()
  create(@Param('projectId') projectId: string, @CurrentUser() user: IJwtPayloadUser, @Body() body: CreateFolderDto) {
    return this.foldersService.create(projectId, user.id, body);
  }

  @Patch(':folderId')
  update(
    @Param('projectId') projectId: string,
    @Param('folderId') folderId: string,
    @CurrentUser() user: IJwtPayloadUser,
    @Body() body: UpdateFolderDto,
  ) {
    return this.foldersService.update(projectId, user.id, folderId, body);
  }

  @Delete(':folderId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @Param('projectId') projectId: string,
    @Param('folderId') folderId: string,
    @CurrentUser() user: IJwtPayloadUser,
  ): Promise<void> {
    await this.foldersService.delete(projectId, user.id, folderId);
  }
}
