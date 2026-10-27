import type { TProjectMemberRole } from './project-member.entity.js';

/** A user as the members modal shows them. */
export interface IProjectMemberUser {
  readonly id: string;
  readonly username: string;
  readonly email: string | null;
}

/** One member of a project, all their roles in one row. */
export interface IProjectMemberInfo extends IProjectMemberUser {
  readonly roles: TProjectMemberRole[];
  /** Open tasks of this project assigned to the member. */
  readonly openTasks: number;
  readonly addedAt: string;
}

/** `GET /projects/:id/members` (and every member write's answer). */
export interface IProjectMembers {
  readonly owner: (IProjectMemberUser & { readonly openTasks: number }) | null;
  readonly members: IProjectMemberInfo[];
}
