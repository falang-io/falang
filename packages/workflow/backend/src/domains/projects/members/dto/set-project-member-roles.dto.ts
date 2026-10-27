import { ArrayUnique, IsArray, IsIn } from 'class-validator';
import { PROJECT_MEMBER_ROLES, type TProjectMemberRole } from '../project-member.entity.js';

/** `PUT /projects/:id/members/:userId` — an empty list removes the member. */
export class SetProjectMemberRolesDto {
  @IsArray()
  @ArrayUnique()
  @IsIn(PROJECT_MEMBER_ROLES, { each: true })
  roles!: TProjectMemberRole[];
}
