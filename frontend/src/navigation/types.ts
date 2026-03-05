import { NavigatorScreenParams } from '@react-navigation/native';
import { UserBrief } from '../types/user';

// Shared sub-screens that appear inside every tab stack so the tab bar stays visible
type ProfileParams = { username: string };
type UserListParams = { username: string; type: 'followers' | 'following' | 'friends'; title: string };

// ─── Auth Stack ───────────────────────────────────────────────────────────────
export type AuthStackParamList = {
  Login: undefined;
  Signup: undefined;
  EmailVerification: { email: string; token: string; autoResend?: boolean };
  ForgotPassword: undefined;
  ResetPassword: { email: string };
};

// ─── Onboarding Stack ─────────────────────────────────────────────────────────

export type OnboardingStackParamList = {
  OnboardingStep1: undefined;
  OnboardingStep2: undefined;
  OnboardingStep3: undefined;
  OnboardingStep4: undefined;
  OnboardingComplete: { finalUser: UserBrief };
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
  GymLiveActivity: { gymId: string; gymName: string };
  CreateInvite: { gymId: string; gymName: string };
  Profile: ProfileParams;
  UserList: UserListParams;
};

// ─── Social Stack ─────────────────────────────────────────────────────────────
export type SocialStackParamList = {
  SocialHome: { tab?: 'Messages' | 'Orgs' } | undefined;
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
  WorkoutLog: { fromCheckin?: boolean; checkinMediaUri?: string; checkinMediaType?: 'photo' | 'video' } | undefined;
  ActiveWorkout: { workoutId: string; fromCheckin?: boolean; checkinMediaUri?: string; checkinMediaType?: 'photo' | 'video' };
  StreakDetails: undefined;
  EditProfile: { bio?: string; display_name?: string } | undefined;
  GroupProfile: { groupId: string };
  Chat: { partnerId: string; partnerName: string; partnerUsername: string; partnerAvatar: string | null };
  GroupChat: { groupId: string; groupName: string; groupAvatar: string | null };
  OrgAnnouncements: { orgId: string; orgName: string; orgAvatar: string | null };
  OrgProfile: { orgId: string };
  UserList: UserListParams;
  CreatePost: undefined;
  AllDMs: undefined;
  AllGroupChats: undefined;
  AllOrgs: undefined;
  CheckInSelection: undefined;
  CameraCapture: { fromCheckinReview?: boolean } | undefined;
  CheckInReview: { mediaUri?: string; mediaType?: 'photo' | 'video'; workoutId?: string; isFrontCamera?: boolean };
  FindFriends: undefined;
  PostDetail: { postId: string; itemType: 'post' | 'workout' | 'checkin'; commentId?: string };
};
