import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CommonActions } from '@react-navigation/native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Avatar from '../common/Avatar';
import { useAuth } from '../../store/AuthContext';
import { fetchUnreadCount } from '../../api/notifications';
import { fetchStreakInfo } from '../../api/workouts';
import { fetchMe } from '../../api/accounts';
import { colors, spacing, typography, shadow } from '../../theme';
import { RootStackParamList } from '../../navigation/types';
import { useTutorial } from '../../store/TutorialContext';
import { wsManager } from '../../services/websocket';

type RootNav = NativeStackNavigationProp<RootStackParamList>;

export default function AppHeader() {
  const insets = useSafeAreaInsets();
  const { user, token, currentStreak, setCurrentStreak, updateUser } = useAuth();
  const navigation = useNavigation<RootNav>();
  const { isActive: tutorialActive, step: tutorialStep, next: tutorialNext, restart: restartTutorial } = useTutorial();
  const [notificationCount, setNotificationCount] = useState(0);

  // Real-time: update badge instantly when a new notification arrives via WebSocket
  useEffect(() => {
    const handler = ({ count }: { count: number }) => setNotificationCount(count);
    wsManager.on('notification_unread_update', handler);
    return () => wsManager.off('notification_unread_update', handler);
  }, []);

  // On focus: fetch fresh count (handles read/clear from NotificationsScreen) + streak + profile
  useFocusEffect(
    React.useCallback(() => {
      if (!token) return;
      fetchUnreadCount()
        .then(data => setNotificationCount(data.count))
        .catch(() => {});
      fetchStreakInfo()
        .then(data => setCurrentStreak(data.current_streak))
        .catch(() => {});
      fetchMe()
        .then(latestUser => updateUser(latestUser))
        .catch(() => {});
    }, [token]),
  );

  return (
    <View style={{ paddingTop: insets.top }}>
      <View style={styles.headerRow}>
        {/* Left: bell + add-friend icon buttons */}
        <View style={styles.leftIcons}>
          <Pressable
            style={({ pressed }) => [styles.iconBtn, pressed && styles.iconBtnPressed]}
            onPress={() => navigation.navigate('Notifications')}
            accessibilityLabel={`Notifications${notificationCount > 0 ? `, ${notificationCount} unread` : ''}`}
            accessibilityRole="button"
          >
            <Feather name="bell" size={17} color={colors.textPrimary} />
            {notificationCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>
                  {notificationCount > 9 ? '9+' : notificationCount}
                </Text>
              </View>
            )}
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.iconBtn, pressed && styles.iconBtnPressed]}
            onPress={() => {
              if (tutorialActive && tutorialStep === 16) tutorialNext();
              navigation.navigate('FindFriends');
            }}
            accessibilityLabel="Find friends"
            accessibilityRole="button"
          >
            <Feather name="user-plus" size={17} color={colors.textPrimary} />
          </Pressable>
        </View>

        {/* Center: Spottr logo text */}
        <Text style={styles.logoText}>Spottr</Text>

        {/* Right: info button + streak pill + user avatar */}
        <View style={styles.rightZone}>
          {!tutorialActive && (
            <Pressable
              style={styles.infoBtn}
              onPress={() => {
                restartTutorial();
                navigation.dispatch(CommonActions.navigate({ name: 'MainTabs', params: { screen: 'Feed' } }));
              }}
              accessibilityLabel="Start tutorial"
              accessibilityRole="button"
            >
              <Text style={styles.infoBtnText}>i</Text>
            </Pressable>
          )}
          <Pressable
            style={styles.streakPill}
            onPress={() => {
              if (tutorialActive && tutorialStep === 12) tutorialNext();
              navigation.navigate('StreakDetails');
            }}
            accessibilityLabel={`${currentStreak} day streak`}
            accessibilityRole="button"
          >
            <Text style={styles.streakEmoji}>🔥</Text>
            <Text style={styles.streakNum}>{currentStreak}</Text>
          </Pressable>
          <Pressable onPress={() => {
            if (tutorialActive && tutorialStep === 14) tutorialNext();
            if (user) navigation.navigate('Profile', { username: user.username });
          }}>
            <Avatar uri={user?.avatar_url ?? null} name={user?.display_name ?? 'Me'} size={34} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  leftIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: shadow('sm'),
      android: { elevation: 1 },
    }),
  },
  iconBtnPressed: {
    opacity: 0.8,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.textPrimary,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: colors.surface,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.textOnPrimary,
    lineHeight: 12,
  },
  logoText: {
    fontSize: 19,
    fontWeight: '700',
    color: colors.textOnPrimary,
    letterSpacing: 0.5,
  },
  rightZone: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  infoBtn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: colors.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
    lineHeight: 14,
  },
  streakPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.surface,
    borderRadius: 20,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    ...Platform.select({
      ios: shadow('sm'),
      android: { elevation: 1 },
    }),
  },
  streakEmoji: { fontSize: 12 },
  streakNum: { fontSize: typography.size.sm, fontWeight: '700', color: colors.textPrimary },
});
