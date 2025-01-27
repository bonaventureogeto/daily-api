import { messageToJson } from '../worker';
import { NotificationSourceContext } from '../../notifications';
import { NotificationWorker } from './worker';
import { ChangeObject } from '../../types';
import { NotificationType, Source, SourceMember } from '../../entity';
import { SourceMemberRoles } from '../../roles';

interface Data {
  previousRole: SourceMemberRoles;
  sourceMember: ChangeObject<SourceMember>;
}

const previousRoleToNewRole: Partial<
  Record<
    Partial<SourceMemberRoles>,
    Partial<Record<SourceMemberRoles, NotificationType>>
  >
> = {
  [SourceMemberRoles.Member]: {
    [SourceMemberRoles.Blocked]: 'squad_blocked',
    [SourceMemberRoles.Admin]: 'promoted_to_admin',
    [SourceMemberRoles.Moderator]: 'promoted_to_moderator',
  },
  [SourceMemberRoles.Moderator]: {
    [SourceMemberRoles.Blocked]: 'squad_blocked',
    [SourceMemberRoles.Admin]: 'promoted_to_admin',
    [SourceMemberRoles.Member]: 'demoted_to_member',
  },
  [SourceMemberRoles.Admin]: {
    [SourceMemberRoles.Blocked]: 'squad_blocked',
    [SourceMemberRoles.Moderator]: 'promoted_to_moderator',
    [SourceMemberRoles.Member]: 'demoted_to_member',
  },
};

const worker: NotificationWorker = {
  subscription: 'api.source-member-role-changed-notification',
  handler: async (message, con) => {
    const { previousRole, sourceMember: member }: Data = messageToJson(message);

    const source = await con
      .getRepository(Source)
      .findOneBy({ id: member.sourceId });
    const baseCtx: NotificationSourceContext = {
      userId: member.userId,
      source,
    };
    if (!source) {
      return;
    }

    const roleToNotificationMap =
      previousRoleToNewRole[previousRole]?.[member.role];

    switch (roleToNotificationMap) {
      case 'demoted_to_member':
        return [
          {
            type: roleToNotificationMap,
            ctx: { ...baseCtx, role: previousRole },
          },
        ];
        break;
      case 'promoted_to_admin':
      case 'promoted_to_moderator':
      case 'squad_blocked':
        return [{ type: roleToNotificationMap, ctx: baseCtx }];
        break;
    }
  },
};

export default worker;
