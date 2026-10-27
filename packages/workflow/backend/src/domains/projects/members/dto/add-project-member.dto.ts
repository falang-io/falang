import { ArrayMinSize, ArrayUnique, IsArray, IsIn, IsString, MaxLength, MinLength } from 'class-validator';
import { PROJECT_MEMBER_ROLES, type TProjectMemberRole } from '../project-member.entity.js';

/** `POST /projects/:id/members` — `login` is a username or an e-mail. */
export class AddProjectMemberDto {
  @IsString()
  @MinLength(1)
  @MaxLength(320)
  login!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsIn(PROJECT_MEMBER_ROLES, { each: true })
  roles!: TProjectMemberRole[];
}
