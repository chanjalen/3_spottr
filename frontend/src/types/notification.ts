import { UserBrief } from './user';

export type NotificationType =
  | 'like_post'
  | 'comment'
  | 'follow'
  | 'pr'
  | 'group_invite'
  | 'workout_invite'
  | 'join_request';

export interface Notification {
  id: number;
  type: NotificationType;
  actor: UserBrief;
  extra_actors: UserBrief[];
  actor_count: number;
  message: string;
  thumbnail_url: string | null;
  is_read: boolean;
  created_at: string;
  time_ago: string;
  target_id: string | number | null;
}
