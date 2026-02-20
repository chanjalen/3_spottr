import { NavigatorScreenParams } from '@react-navigation/native';

// ─── Auth Stack ───────────────────────────────────────────────────────────────
export type AuthStackParamList = {
  Login: undefined;
  Signup: undefined;
};

// ─── Feed Stack ───────────────────────────────────────────────────────────────
export type FeedStackParamList = {
  FeedHome: undefined;
};

// ─── Gyms Stack ───────────────────────────────────────────────────────────────
export type GymsStackParamList = {
  GymList: undefined;
  GymDetail: { gymId: string; gymName: string };
};

// ─── Social Stack ─────────────────────────────────────────────────────────────
export type SocialStackParamList = {
  SocialHome: undefined;
  Chat: { partnerId: string; partnerName: string; partnerAvatar: string | null };
  GroupChat: { groupId: string; groupName: string };
};

// ─── Ranks Stack ─────────────────────────────────────────────────────────────
export type RanksStackParamList = {
  RanksHome: undefined;
};

// ─── Main Tabs ────────────────────────────────────────────────────────────────
export type MainTabParamList = {
  Feed: NavigatorScreenParams<FeedStackParamList>;
  Gyms: NavigatorScreenParams<GymsStackParamList>;
  Social: NavigatorScreenParams<SocialStackParamList>;
  Ranks: NavigatorScreenParams<RanksStackParamList>;
};

// ─── Root Stack (wraps tabs + modals) ─────────────────────────────────────────
export type RootStackParamList = {
  MainTabs: NavigatorScreenParams<MainTabParamList>;
  Profile: { username: string };
  Notifications: undefined;
  WorkoutLog: undefined;
  ActiveWorkout: { workoutId: string };
  StreakDetails: undefined;
  EditProfile: undefined;
  GroupProfile: { groupId: string };
};
