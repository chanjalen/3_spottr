import React from 'react';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Avatar from '../common/Avatar';
import { useAuth } from '../../store/AuthContext';
import { colors, spacing, typography, shadow } from '../../theme';
import { RootStackParamList } from '../../navigation/types';

type RootNav = NativeStackNavigationProp<RootStackParamList>;

interface AppHeaderProps {
  notificationCount?: number;
}

export default function AppHeader({ notificationCount = 0 }: AppHeaderProps) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const navigation = useNavigation<RootNav>();

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
            <Feather name="bell" size={20} color={colors.iconActive} />
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
            accessibilityLabel="Add friend"
            accessibilityRole="button"
          >
            <Feather name="user-plus" size={20} color={colors.iconActive} />
          </Pressable>
        </View>

        {/* Center: Spottr logo text */}
        <Text style={styles.logoText}>Spottr</Text>

        {/* Right: user avatar → Profile */}
        <View style={styles.rightZone}>
          <Pressable onPress={() => user && navigation.navigate('Profile', { username: user.username })}>
            <StoryRingAvatar uri={user?.avatar_url ?? null} name={user?.display_name ?? 'Me'} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function StoryRingAvatar({ uri, name }: { uri: string | null; name: string }) {
  return (
    <LinearGradient
      colors={[colors.storyGradientStart, colors.storyGradientMid, colors.storyGradientEnd]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.storyRing}
    >
      <View style={styles.storyRingInner}>
        <Avatar uri={uri} name={name} size={36} />
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  leftIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
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
    fontSize: 22,
    fontWeight: '700',
    color: colors.textOnPrimary,
    letterSpacing: 0.5,
  },
  rightZone: {
    width: 44,
    alignItems: 'flex-end',
  },
  storyRing: {
    width: 44,
    height: 44,
    borderRadius: 22,
    padding: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  storyRingInner: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: colors.surface,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background.elevated,
  },
});
