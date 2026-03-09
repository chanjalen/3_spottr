import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { NavigationContainerRef } from '@react-navigation/native';
import apiClient from '../api/client';
import { RootStackParamList } from '../navigation/types';

const PROJECT_ID = 'a4ef3539-a6f7-405d-ac11-ef7a72dec022';

// Show notifications when app is foregrounded
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export function usePushNotifications(
  navigationRef: NavigationContainerRef<RootStackParamList>,
  isAuthenticated: boolean,
) {
  const tokenSavedRef = useRef(false);
  const listenerRef = useRef<Notifications.EventSubscription | null>(null);

  // Register token once per session when user is logged in
  useEffect(() => {
    if (!isAuthenticated || tokenSavedRef.current) return;

    (async () => {
      if (!Device.isDevice) return; // Skip on simulator — push doesn't work anyway

      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') return;

      // Android requires a notification channel
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'default',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#4FC3E0',
        });
      }

      try {
        const { data: expoPushToken } = await Notifications.getExpoPushTokenAsync({
          projectId: PROJECT_ID,
        });
        await apiClient.post('/accounts/api/push-token/', { token: expoPushToken });
        tokenSavedRef.current = true;
      } catch {
        // Non-critical — push setup failure shouldn't affect app
      }
    })();
  }, [isAuthenticated]);

  // Reset token registration flag on logout so next login re-registers
  useEffect(() => {
    if (!isAuthenticated) {
      tokenSavedRef.current = false;
    }
  }, [isAuthenticated]);

  // Handle notification taps for navigation
  useEffect(() => {
    listenerRef.current = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as Record<string, string> | undefined;
      if (!data || !navigationRef.isReady()) return;

      const { type } = data;

      if (type === 'dm' && data.sender_id) {
        navigationRef.navigate('AllDMs');
      } else if (type === 'group_message' && data.group_id) {
        navigationRef.navigate('AllGroupChats');
      } else if (type === 'like_post' && data.post_id) {
        navigationRef.navigate('PostDetail', { postId: data.post_id, itemType: 'post' });
      } else if (type === 'like_checkin' && data.checkin_id) {
        navigationRef.navigate('PostDetail', { postId: data.checkin_id, itemType: 'checkin' });
      } else if (type === 'comment' && data.post_id) {
        navigationRef.navigate('PostDetail', { postId: data.post_id, itemType: 'post' });
      } else if (type === 'comment' && data.checkin_id) {
        navigationRef.navigate('PostDetail', { postId: data.checkin_id, itemType: 'checkin' });
      } else if (type === 'comment_reply' || type === 'like_comment') {
        navigationRef.navigate('MainTabs', { screen: 'Notifications' });
      } else if (type === 'friend_checkin' && data.username) {
        navigationRef.navigate('Profile', { username: data.username });
      } else if (type === 'follow' && data.username) {
        navigationRef.navigate('Profile', { username: data.username });
      } else if (type === 'mention') {
        navigationRef.navigate('MainTabs', { screen: 'Notifications' });
      } else if (type === 'workout_invite' || type === 'workout_join_request' || type === 'join_request') {
        navigationRef.navigate('MainTabs', { screen: 'Notifications' });
      } else if (type === 'gym_reminder') {
        navigationRef.navigate('MainTabs', { screen: 'Feed' });
      }
    });

    return () => {
      listenerRef.current?.remove();
    };
  }, [navigationRef]);
}
