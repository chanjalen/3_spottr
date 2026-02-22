/**
 * Matches MessageListSerializer (used in chat history) and
 * MessageSerializer (used for send responses).
 *
 * `sender` is the FK integer id on the Message model.
 * `sender_username` and `sender_avatar_url` are denormalized via SerializerMethodField.
 */
export interface Message {
  id: number;
  sender: number;
  sender_username: string | null;
  sender_avatar_url: string | null;
  content: string;
  created_at: string;
  is_read: boolean;
  is_system?: boolean;
  is_request?: boolean;
  shared_post?: SharedPost | null;
  join_request_id?: string | null;
  join_request_status?: string | null;
}

/** Embedded shared post/checkin card in a chat message. */
export interface SharedPost {
  id: string;
  item_type: 'post' | 'workout' | 'checkin';
  detail_url: string;
  author_username: string | null;
  author_display_name: string | null;
  author_avatar_url: string | null;
  description?: string | null;
  photo_url?: string | null;
  video_url?: string | null;
  like_count: number;
  comment_count: number;
  workout?: object | null;
  personal_record?: object | null;
  workout_type?: string;
  location_name?: string;
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
  latest_message: Message;
  unread_count: number;
}

/**
 * Matches UnreadCountSerializer.
 * Returned by GET /api/messaging/unread-count/
 */
export interface UnreadCount {
  dm: number;
  group: number;
  total: number;
}

/** Paginated message history response from DM and group message endpoints. */
export interface MessagePage {
  results: Message[];
  has_more: boolean;
  oldest_id: string | null;
  newest_id: string | null;
}
