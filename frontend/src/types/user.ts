export interface UserBrief {
  id: number;
  username: string;
  display_name: string;
  avatar_url: string | null;
  streak?: number;
}
