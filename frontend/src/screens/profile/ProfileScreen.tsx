import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import Avatar from '../../components/common/Avatar';
import { useAuth } from '../../store/AuthContext';
import { fetchProfile, toggleFollow } from '../../api/accounts';
import { UserProfile } from '../../types/user';
import { colors, spacing, typography, shadow } from '../../theme';
import { RootStackParamList } from '../../navigation/types';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Profile'>;
  route: RouteProp<RootStackParamList, 'Profile'>;
};

type ProfileTab = 'Posts' | 'Calendar' | 'Records';

export default function ProfileScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { user: me } = useAuth();
  const { username } = route.params;
  const isOwn = me?.username === username;

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<ProfileTab>('Posts');
  const [followLoading, setFollowLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await fetchProfile(username);
      setProfile(data);
    } catch {
      // silently handle
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [username]);

  useEffect(() => {
    load();
  }, [load]);

  const handleFollow = async () => {
    if (!profile) return;
    setFollowLoading(true);
    try {
      const res = await toggleFollow(username);
      setProfile((p) => p ? { ...p, is_following: res.following, follower_count: p.follower_count + (res.following ? 1 : -1) } : p);
    } finally {
      setFollowLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.emptyText}>User not found</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background.base }}>
      {/* Header bar */}
      <View style={[styles.headerBar, { paddingTop: insets.top }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>@{profile.username}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />}
      >
        {/* Avatar + stats row */}
        <View style={styles.profileHeader}>
          <Avatar uri={profile.avatar_url} name={profile.display_name} size={80} />
          <Text style={styles.displayName}>{profile.display_name}</Text>
          <Text style={styles.usernameText}>@{profile.username}</Text>
          {profile.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}

          <View style={styles.statsRow}>
            <StatBox label="Followers" value={profile.follower_count} />
            <StatBox label="Following" value={profile.following_count} />
            <StatBox label="Streak" value={profile.streak ?? 0} suffix=" 🔥" />
          </View>

          {/* Action buttons */}
          <View style={styles.actionRow}>
            {isOwn ? (
              <Pressable
                style={styles.actionBtn}
                onPress={() => navigation.navigate('EditProfile')}
              >
                <Text style={styles.actionBtnText}>Edit Profile</Text>
              </Pressable>
            ) : (
              <>
                <Pressable
                  style={[styles.actionBtn, profile.is_following && styles.actionBtnOutline]}
                  onPress={handleFollow}
                  disabled={followLoading}
                >
                  {followLoading ? (
                    <ActivityIndicator size="small" color={profile.is_following ? colors.textPrimary : colors.textOnPrimary} />
                  ) : (
                    <Text style={[styles.actionBtnText, profile.is_following && styles.actionBtnTextOutline]}>
                      {profile.is_following ? 'Following' : 'Follow'}
                    </Text>
                  )}
                </Pressable>
                <Pressable style={[styles.actionBtn, styles.actionBtnOutline]}>
                  <Text style={styles.actionBtnTextOutline}>Message</Text>
                </Pressable>
              </>
            )}
          </View>
        </View>

        {/* Tabs */}
        <View style={styles.tabRow}>
          {(['Posts', 'Calendar', 'Records'] as ProfileTab[]).map((tab) => (
            <Pressable key={tab} style={styles.tab} onPress={() => setActiveTab(tab)}>
              <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>{tab}</Text>
              {activeTab === tab && <View style={styles.tabIndicator} />}
            </Pressable>
          ))}
        </View>

        {/* Tab content placeholder */}
        <View style={styles.tabContent}>
          {activeTab === 'Posts' && (
            <View style={styles.emptyTab}>
              <Feather name="image" size={36} color={colors.textMuted} />
              <Text style={styles.emptyText}>No posts yet</Text>
            </View>
          )}
          {activeTab === 'Calendar' && (
            <View style={styles.emptyTab}>
              <Feather name="calendar" size={36} color={colors.textMuted} />
              <Text style={styles.emptyText}>No workouts logged</Text>
            </View>
          )}
          {activeTab === 'Records' && (
            <View style={styles.emptyTab}>
              <Feather name="award" size={36} color={colors.textMuted} />
              <Text style={styles.emptyText}>No personal records yet</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function StatBox({ label, value, suffix = '' }: { label: string; value: number; suffix?: string }) {
  return (
    <View style={styles.statBox}>
      <Text style={styles.statValue}>{value}{suffix}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    backgroundColor: colors.background.base,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.sm,
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: typography.size.base,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  profileHeader: {
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.base,
    gap: spacing.sm,
  },
  displayName: {
    fontSize: typography.size.xl,
    fontWeight: '700',
    color: colors.textPrimary,
    marginTop: spacing.sm,
  },
  usernameText: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },
  bio: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginTop: spacing.xs,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing['2xl'],
    marginTop: spacing.md,
  },
  statBox: {
    alignItems: 'center',
    gap: 2,
  },
  statValue: {
    fontSize: typography.size.lg,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  statLabel: {
    fontSize: typography.size.xs,
    color: colors.textSecondary,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  actionBtn: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 110,
  },
  actionBtnOutline: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: colors.borderColor,
  },
  actionBtnText: {
    fontSize: typography.size.sm,
    fontWeight: '600',
    color: colors.textOnPrimary,
  },
  actionBtnTextOutline: {
    color: colors.textPrimary,
  },
  tabRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.border.default,
    marginTop: spacing.md,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  tabText: {
    fontSize: typography.size.sm,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  tabTextActive: {
    fontWeight: '700',
    color: colors.textPrimary,
  },
  tabIndicator: {
    position: 'absolute',
    bottom: 0,
    left: '25%',
    right: '25%',
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.primary,
  },
  tabContent: {
    minHeight: 200,
    paddingTop: spacing.xl,
  },
  emptyTab: {
    alignItems: 'center',
    gap: spacing.md,
    paddingTop: spacing['2xl'],
  },
  emptyText: {
    fontSize: typography.size.base,
    color: colors.textMuted,
  },
});
