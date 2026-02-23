import { NavigatorScreenParams } from '@react-navigation/native';

// Shared sub-screens that appear inside every tab stack so the tab bar stays visible
type ProfileParams = { username: string };
type UserListParams = { username: string; type: 'followers' | 'following' | 'friends'; title: string };

// ─── Auth Stack ───────────────────────────────────────────────────────────────
export type AuthStackParamList = {
  Login: undefined;
  Signup: undefined;
};

// ─── Feed Stack ───────────────────────────────────────────────────────────────
export type FeedStackParamList = {
  FeedHome: undefined;
  Profile: ProfileParams;
  UserList: UserListParams;
};

// ─── Gyms Stack ───────────────────────────────────────────────────────────────
export type GymsStackParamList = {
  GymList: undefined;
  GymDetail: { gymId: string; gymName: string };
  CreateInvite: { gymId: string; gymName: string };
  Profile: ProfileParams;
  UserList: UserListParams;
};

// ─── Social Stack ─────────────────────────────────────────────────────────────
export type SocialStackParamList = {
  SocialHome: undefined;
  Profile: ProfileParams;
  UserList: UserListParams;
};

// ─── Ranks Stack ─────────────────────────────────────────────────────────────
export type RanksStackParamList = {
  RanksHome: undefined;
  Profile: ProfileParams;
  UserList: UserListParams;
};

// ─── Main Tabs ────────────────────────────────────────────────────────────────
export type MainTabParamList = {
  Feed: NavigatorScreenParams<FeedStackParamList>;
  Gyms: NavigatorScreenParams<GymsStackParamList>;
  Social: NavigatorScreenParams<SocialStackParamList>;
  Ranks: NavigatorScreenParams<RanksStackParamList>;
};

// ─── Root Stack (wraps tabs + modal screens) ──────────────────────────────────
export type RootStackParamList = {
  MainTabs: NavigatorScreenParams<MainTabParamList>;
  Profile: ProfileParams;
  Notifications: undefined;
  WorkoutLog: undefined;
  ActiveWorkout: { workoutId: string };
  StreakDetails: undefined;
  EditProfile: undefined;
  GroupProfile: { groupId: string };
  Chat: { partnerId: string; partnerName: string; partnerUsername: string; partnerAvatar: string | null };
  GroupChat: { groupId: string; groupName: string; groupAvatar: string | null };
  UserList: UserListParams;
  CreatePost: undefined;
  QuickCheckin: undefined;
};
