export type NotificationType =
  | 'like_post'
  | 'like_checkin'
  | 'like_comment'
  | 'comment'
  | 'follow'
  | 'pr'
  | 'mention'
  | 'workout_invite'
  | 'join_request';

export interface NotificationActor {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
}

export interface Notification {
  id: string;
  ids: string[];
  type: NotificationType;
  grouped: boolean;
  actors: NotificationActor[];
  total_actors: number;
  message: string;
  description?: string;
  thumbnail: string | null;
  is_read: boolean;
  created_at: string;
  time_ago: string;
  target_type: string;
  target_id: string | null;
  context_id: string;
  context_type: string;
  gym_id?: string;
  gym_name?: string;
  action_status?: 'pending' | 'accepted';
}
