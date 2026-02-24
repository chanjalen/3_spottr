import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { MainTabParamList, FeedStackParamList, GymsStackParamList, SocialStackParamList, RanksStackParamList, RootStackParamList } from './types';
import CustomTabBar from '../components/navigation/CustomTabBar';

// Screens
import FeedScreen from '../screens/FeedScreen';
import GymListScreen from '../screens/gyms/GymListScreen';
import GymDetailScreen from '../screens/gyms/GymDetailScreen';
import GymLiveActivityScreen from '../screens/gyms/GymLiveActivityScreen';
import CreateInviteScreen from '../screens/gyms/CreateInviteScreen';
import SocialScreen from '../screens/social/SocialScreen';
import ChatScreen from '../screens/messages/ChatScreen';
import GroupChatScreen from '../screens/messages/GroupChatScreen';
import RanksScreen from '../screens/social/RanksScreen';
import ProfileScreen from '../screens/profile/ProfileScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import WorkoutLogScreen from '../screens/workouts/WorkoutLogScreen';
import ActiveWorkoutScreen from '../screens/workouts/ActiveWorkoutScreen';
import StreakDetailsScreen from '../screens/workouts/StreakDetailsScreen';
import EditProfileScreen from '../screens/profile/EditProfileScreen';
import GroupProfileScreen from '../screens/groups/GroupProfileScreen';
import OrgAnnouncementsScreen from '../screens/orgs/OrgAnnouncementsScreen';
import OrgProfileScreen from '../screens/orgs/OrgProfileScreen';
import UserListScreen from '../screens/profile/UserListScreen';
import CreatePostScreen from '../screens/social/CreatePostScreen';
import QuickCheckinScreen from '../screens/social/QuickCheckinScreen';

// ─── Stack Navigators ─────────────────────────────────────────────────────────

const FeedStack = createNativeStackNavigator<FeedStackParamList>();
function FeedStackNavigator() {
  return (
    <FeedStack.Navigator id="FeedStack" screenOptions={{ headerShown: false }}>
      <FeedStack.Screen name="FeedHome" component={FeedScreen} />
      <FeedStack.Screen name="Profile" component={ProfileScreen} />
      <FeedStack.Screen name="UserList" component={UserListScreen} />
    </FeedStack.Navigator>
  );
}

const GymsStack = createNativeStackNavigator<GymsStackParamList>();
function GymsStackNavigator() {
  return (
    <GymsStack.Navigator id="GymsStack" screenOptions={{ headerShown: false }}>
      <GymsStack.Screen name="GymList" component={GymListScreen} />
      <GymsStack.Screen name="GymDetail" component={GymDetailScreen} />
      <GymsStack.Screen name="GymLiveActivity" component={GymLiveActivityScreen} />
      <GymsStack.Screen name="CreateInvite" component={CreateInviteScreen} />
      <GymsStack.Screen name="Profile" component={ProfileScreen} />
      <GymsStack.Screen name="UserList" component={UserListScreen} />
    </GymsStack.Navigator>
  );
}

const SocialStack = createNativeStackNavigator<SocialStackParamList>();
function SocialStackNavigator() {
  return (
    <SocialStack.Navigator id="SocialStack" screenOptions={{ headerShown: false }}>
      <SocialStack.Screen name="SocialHome" component={SocialScreen} />
      <SocialStack.Screen name="Profile" component={ProfileScreen} />
      <SocialStack.Screen name="UserList" component={UserListScreen} />
    </SocialStack.Navigator>
  );
}

const RanksStack = createNativeStackNavigator<RanksStackParamList>();
function RanksStackNavigator() {
  return (
    <RanksStack.Navigator id="RanksStack" screenOptions={{ headerShown: false }}>
      <RanksStack.Screen name="RanksHome" component={RanksScreen} />
      <RanksStack.Screen name="Profile" component={ProfileScreen} />
      <RanksStack.Screen name="UserList" component={UserListScreen} />
    </RanksStack.Navigator>
  );
}

// ─── Root Stack (tabs + modal screens) ───────────────────────────────────────

const Tab = createBottomTabNavigator<MainTabParamList>();
const Root = createNativeStackNavigator<RootStackParamList>();

function TabNavigator() {
  return (
    <Tab.Navigator
      id="MainTabs"
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tab.Screen name="Feed" component={FeedStackNavigator} />
      <Tab.Screen name="Gyms" component={GymsStackNavigator} />
      <Tab.Screen name="Social" component={SocialStackNavigator} />
      <Tab.Screen name="Ranks" component={RanksStackNavigator} />
    </Tab.Navigator>
  );
}

export default function MainTabs() {
  return (
    <Root.Navigator id="RootStack" screenOptions={{ headerShown: false }}>
      <Root.Screen name="MainTabs" component={TabNavigator} />
      <Root.Screen name="Profile" component={ProfileScreen} options={{ presentation: 'card' }} />
      <Root.Screen name="Notifications" component={NotificationsScreen} options={{ presentation: 'card' }} />
      <Root.Screen name="WorkoutLog" component={WorkoutLogScreen} options={{ presentation: 'card' }} />
      <Root.Screen name="ActiveWorkout" component={ActiveWorkoutScreen} options={{ presentation: 'card', gestureEnabled: false }} />
      <Root.Screen name="StreakDetails" component={StreakDetailsScreen} options={{ presentation: 'card' }} />
      <Root.Screen name="EditProfile" component={EditProfileScreen} options={{ presentation: 'modal' }} />
      <Root.Screen name="GroupProfile" component={GroupProfileScreen} options={{ presentation: 'card' }} />
      <Root.Screen name="Chat" component={ChatScreen} options={{ presentation: 'card' }} />
      <Root.Screen name="GroupChat" component={GroupChatScreen} options={{ presentation: 'card' }} />
      <Root.Screen name="OrgAnnouncements" component={OrgAnnouncementsScreen} options={{ presentation: 'card' }} />
      <Root.Screen name="OrgProfile" component={OrgProfileScreen} options={{ presentation: 'card' }} />
      <Root.Screen name="UserList" component={UserListScreen} options={{ presentation: 'card' }} />
      <Root.Screen name="CreatePost" component={CreatePostScreen} options={{ presentation: 'modal', gestureEnabled: true }} />
      <Root.Screen name="QuickCheckin" component={QuickCheckinScreen} options={{ presentation: 'modal', gestureEnabled: true }} />
    </Root.Navigator>
  );
}
