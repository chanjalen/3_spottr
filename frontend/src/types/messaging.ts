/**
 * Matches MessageListSerializer (used in chat history) and
 * MessageSerializer (used for send responses).
 *
 * `sender` is the FK integer id on the Message model.
 * `sender_username` and `sender_avatar_url` are denormalized via SerializerMethodField.
 */
export interface MessageReaction {
  emoji: string;
  count: number;
  user_reacted: boolean;
}

export interface MessageMedia {
  url: string;
  kind: 'image' | 'video';
  thumbnail_url: string | null;
  width: number | null;
  height: number | null;
}

/** Shared user profile card embedded in a chat message (separate from shared posts). */
export interface SharedProfileCard {
  username: string;
  display_name: string;
  avatar_url: string | null;
  current_streak: number;
  total_workouts: number;
}

export interface Message {
  id: string;
  sender: string;
  sender_username: string | null;
  sender_avatar_url: string | null;
  content: string;
  media?: MessageMedia[] | null;
  created_at: string;
  is_read: boolean;
  is_system?: boolean;
  is_request?: boolean;
  shared_post?: SharedPost | null;
  shared_profile_card?: SharedProfileCard | null;
  join_request_id?: string | null;
  join_request_status?: string | null;
  reactions?: MessageReaction[];
  // Present on WebSocket-delivered messages for client-side routing.
  dm_recipient_id?: string | null;
  group_id?: string | null;
  // Optimistic rendering fields — client-side only, not persisted.
  status?: 'sending' | 'sent' | 'failed' | 'waiting';
  client_msg_id?: string;
}

/** Embedded shared post/checkin card in a chat message. */
export interface SharedPostPollOption {
  id: number;
  text: string;
  votes: number;
}

export interface SharedPostPoll {
  question: string;
  total_votes: number;
  is_active: boolean;
  options: SharedPostPollOption[];
}

export interface SharedPost {
  id?: string;
  item_type: 'post' | 'workout' | 'checkin' | 'profile';
  detail_url?: string;
  author_username?: string | null;
  author_display_name?: string | null;
  author_avatar_url?: string | null;
  description?: string | null;
  photo_url?: string | null;
  video_url?: string | null;
  is_front_camera?: boolean;
  like_count?: number;
  comment_count?: number;
  workout?: object | null;
  personal_record?: object | null;
  workout_type?: string;
  location_name?: string;
  poll?: SharedPostPoll | null;
}

/**
 * Matches ConversationSerializer.
 * Returned by GET /api/messaging/dm/conversations/
 */
export interface Conversation {
  partner_id: string;
  partner_username: string;
  partner_display_name: string;
  partner_avatar_url: string | null;
  latest_message: Message;
  unread_count: number;
  partner_has_activity_today: boolean;
  preview_text?: string | null;
}

/**
 * Matches GroupConversationSerializer.
 * Returned by GET /api/messaging/groups/conversations/
 */
export interface GroupConversation {
  group_id: string;
  group_name: string;
  group_streak: number;
  avatar_url: string | null;
  member_count: number;
  latest_message: Message | null;
  unread_count: number;
  preview_text?: string | null;
}

/**
 * Matches UnreadCountSerializer.
 * Returned by GET /api/messaging/unread-count/
 */
export interface UnreadCount {
  dm: number;
  group: number;
  org: number;
  total: number;
}

/** Paginated message history response from DM and group message endpoints. */
export interface MessagePage {
  results: Message[];
  has_more: boolean;
  oldest_id: string | null;
  newest_id: string | null;
}
