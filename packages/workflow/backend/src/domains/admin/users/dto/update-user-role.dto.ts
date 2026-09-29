import { IsIn } from 'class-validator';

export class UpdateUserRoleDto {
  @IsIn(['user', 'admin'])
  role!: 'user' | 'admin';
}
