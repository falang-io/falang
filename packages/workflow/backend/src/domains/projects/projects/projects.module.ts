import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Task } from '../../tasks/task.entity.js';
import { User } from '../../users/users/user.entity.js';
import { UsersModule } from '../../users/users/users.module.js';
import { Document } from '../documents/document.entity.js';
import { AdminProjectTransferController } from '../members/admin-project-transfer.controller.js';
import { ProjectMember } from '../members/project-member.entity.js';
import { ProjectMembersController } from '../members/project-members.controller.js';
import { ProjectMembersService } from '../members/project-members.service.js';
import { ProjectTransferService } from '../members/project-transfer.service.js';
import { Project } from './project.entity.js';
import { ProjectsController } from './projects.controller.js';
import { ProjectsService } from './projects.service.js';

@Module({
  // `UsersModule` for `AdminGuard` on the admin transfer route.
  imports: [TypeOrmModule.forFeature([Project, Document, User, ProjectMember, Task]), UsersModule],
  controllers: [ProjectsController, ProjectMembersController, AdminProjectTransferController],
  providers: [ProjectsService, ProjectMembersService, ProjectTransferService],
  exports: [ProjectsService, ProjectMembersService, ProjectTransferService],
})
export class ProjectsModule {}
