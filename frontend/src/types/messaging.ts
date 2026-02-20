import { UserBrief } from './user';

export interface Message {
  id: number;
  sender: UserBrief;
  content: string;
  created_at: string;
  is_read: boolean;
  is_system?: boolean;
}

export interface Conversation {
  id: number;
  partner: UserBrief;
  last_message: string | null;
  last_message_at: string | null;
  unread_count: number;
}

export interface GroupConversation {
  id: string;
  name: string;
  avatar_url: string | null;
  last_message: string | null;
  last_message_at: string | null;
  unread_count: number;
  member_count: number;
}

export interface UnreadCount {
  dm_unread: number;
  group_unread: number;
  total: number;
}
