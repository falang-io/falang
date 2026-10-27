import { ArrayUnique, IsArray, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { PROJECT_MEMBER_ROLES, type TProjectMemberRole } from '../project-member.entity.js';

/** `POST /admin/projects/:id/transfer` — `login` (username or e-mail) of the new owner. */
export class TransferProjectDto {
  @IsString()
  @MinLength(1)
  @MaxLength(320)
  login!: string;

  /** Roles the previous owner keeps as a member; empty or absent — they lose access. */
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(PROJECT_MEMBER_ROLES, { each: true })
  previousOwnerRoles?: TProjectMemberRole[];
}
