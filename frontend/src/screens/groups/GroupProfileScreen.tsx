import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import Avatar from '../../components/common/Avatar';
import InactiveStreakSheet from '../../components/groups/InactiveStreakSheet';
import { fetchGroupDetail, fetchGroupStreakDetail, GroupDetail, GroupStreakDetail } from '../../api/groups';
import { colors, spacing, typography } from '../../theme';

interface GroupProfileScreenProps {
  groupId: string;
}

export default function GroupProfileScreen({ groupId }: GroupProfileScreenProps) {
  const insets = useSafeAreaInsets();

  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [streakDetail, setStreakDetail] = useState<GroupStreakDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [streakSheetVisible, setStreakSheetVisible] = useState(false);
  const [streakLoading, setStreakLoading] = useState(false);

  const loadGroup = useCallback(async () => {
    try {
      const data = await fetchGroupDetail(groupId);
      setGroup(data);
    } catch {
      // handle error
    }
  }, [groupId]);

  const loadStreakDetail = useCallback(async () => {
    setStreakLoading(true);
    try {
      const data = await fetchGroupStreakDetail(groupId);
      setStreakDetail(data);
    } catch {
      // handle error
    } finally {
      setStreakLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    const init = async () => {
      setIsLoading(true);
      await loadGroup();
      setIsLoading(false);
    };
    init();
  }, [loadGroup]);

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    await loadGroup();
    if (streakDetail) await loadStreakDetail();
    setIsRefreshing(false);
  }, [loadGroup, loadStreakDetail, streakDetail]);

  const handleStreakPress = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setStreakSheetVisible(true);
    if (!streakDetail) {
      await loadStreakDetail();
    }
  }, [streakDetail, loadStreakDetail]);

  if (isLoading || !group) {
    return (
      <View style={[styles.loader, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={colors.brand.primary} />
      </View>
    );
  }

  const hasActiveStreak = group.group_streak > 0;

  return (
    <GestureHandlerRootView style={styles.root}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.base }]}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={refresh}
            tintColor={colors.brand.primary}
            colors={[colors.brand.primary]}
            progressBackgroundColor={colors.background.elevated}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Group header */}
        <View style={styles.header}>
          {group.avatar ? (
            <Image
              source={{ uri: group.avatar }}
              style={styles.groupAvatar}
              contentFit="cover"
            />
          ) : (
            <View style={styles.groupAvatarFallback}>
              <Text style={styles.groupAvatarInitial}>
                {group.name[0].toUpperCase()}
              </Text>
            </View>
          )}
          <Text style={styles.groupName}>{group.name}</Text>
          {group.description ? (
            <Text style={styles.groupDescription}>{group.description}</Text>
          ) : null}
          <View style={styles.metaRow}>
            <Feather name="users" size={14} color={colors.text.muted} />
            <Text style={styles.metaText}>{group.member_count} members</Text>
            <Text style={styles.metaDot}>·</Text>
            <Feather
              name="lock"
              size={14}
              color={colors.text.muted}
              style={group.privacy === 'public' ? { display: 'none' } : undefined}
            />
            <Text style={styles.metaText}>
              {group.privacy === 'public' ? 'Public' : 'Private'}
            </Text>
          </View>
        </View>

        {/* Streak section */}
        <View style={styles.streakSection}>
          <Text style={styles.streakSectionLabel}>Group Streak</Text>
          <TouchableOpacity
            style={[styles.streakButton, hasActiveStreak && styles.streakButtonActive]}
            onPress={handleStreakPress}
            activeOpacity={0.75}
          >
            {hasActiveStreak ? (
              <>
                <Text style={styles.streakFlame}>🔥</Text>
                <Text style={styles.streakButtonText}>{group.group_streak} day streak</Text>
              </>
            ) : (
              <>
                <Feather name="zap-off" size={15} color={colors.text.muted} />
                <Text style={[styles.streakButtonText, styles.streakButtonTextInactive]}>
                  No group streak active
                </Text>
              </>
            )}
            <Feather name="chevron-right" size={15} color={hasActiveStreak ? colors.brand.primary : colors.text.muted} />
          </TouchableOpacity>
          {group.longest_group_streak > 0 && (
            <Text style={styles.streakBest}>Best: {group.longest_group_streak}d</Text>
          )}
        </View>

        {/* Members list */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Members</Text>
          {group.members.map((member) => (
            <View key={member.id} style={styles.memberRow}>
              <Avatar
                uri={member.avatar_url}
                name={member.display_name || member.username}
                size={38}
              />
              <View style={styles.memberInfo}>
                <Text style={styles.memberName}>{member.display_name || member.username}</Text>
                <Text style={styles.memberUsername}>@{member.username}</Text>
              </View>
              {member.role !== 'member' && (
                <View style={styles.roleBadge}>
                  <Text style={styles.roleText}>{member.role}</Text>
                </View>
              )}
            </View>
          ))}
        </View>
      </ScrollView>

      {streakSheetVisible && (
        <InactiveStreakSheet
          groupStreak={group.group_streak}
          members={streakDetail?.members ?? []}
          isLoading={streakLoading}
          onClose={() => setStreakSheetVisible(false)}
        />
      )}
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background.base,
  },
  loader: {
    flex: 1,
    backgroundColor: colors.background.base,
    alignItems: 'center',
    justifyContent: 'center',
  },
  container: {
    flex: 1,
    backgroundColor: colors.background.base,
  },
  content: {
    paddingHorizontal: spacing.base,
    paddingBottom: spacing['3xl'],
    gap: spacing.base,
  },

  // Header
  header: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
  },
  groupAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    backgroundColor: colors.background.elevated,
  },
  groupAvatarFallback: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.brand.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupAvatarInitial: {
    fontSize: typography.size['2xl'],
    fontFamily: typography.family.bold,
    color: '#fff',
  },
  groupName: {
    fontSize: typography.size.xl,
    fontFamily: typography.family.bold,
    color: colors.text.primary,
    textAlign: 'center',
  },
  groupDescription: {
    fontSize: typography.size.sm,
    fontFamily: typography.family.regular,
    color: colors.text.secondary,
    textAlign: 'center',
    paddingHorizontal: spacing['2xl'],
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  metaText: {
    fontSize: typography.size.sm,
    fontFamily: typography.family.regular,
    color: colors.text.muted,
  },
  metaDot: {
    fontSize: typography.size.sm,
    color: colors.text.muted,
    marginHorizontal: 2,
  },

  // Streak section
  streakSection: {
    gap: spacing.xs,
  },
  streakSectionLabel: {
    fontSize: typography.size.sm,
    fontFamily: typography.family.medium,
    color: colors.text.muted,
    marginBottom: 2,
  },
  streakButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    alignSelf: 'flex-start',
    backgroundColor: colors.background.elevated,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border.default,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  streakButtonActive: {
    backgroundColor: colors.brand.primary + '15',
    borderColor: colors.brand.primary + '40',
  },
  streakFlame: {
    fontSize: typography.size.base,
  },
  streakButtonText: {
    fontSize: typography.size.sm,
    fontFamily: typography.family.semibold,
    color: colors.brand.primary,
  },
  streakButtonTextInactive: {
    color: colors.text.muted,
  },
  streakBest: {
    fontSize: typography.size.xs,
    fontFamily: typography.family.regular,
    color: colors.text.muted,
    paddingLeft: spacing.xs,
  },

  // Members
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    fontSize: typography.size.base,
    fontFamily: typography.family.semibold,
    color: colors.text.primary,
    marginBottom: spacing.xs,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xs,
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    fontSize: typography.size.base,
    fontFamily: typography.family.medium,
    color: colors.text.primary,
  },
  memberUsername: {
    fontSize: typography.size.sm,
    fontFamily: typography.family.regular,
    color: colors.text.muted,
  },
  roleBadge: {
    backgroundColor: colors.background.elevated,
    borderRadius: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  roleText: {
    fontSize: typography.size.xs,
    fontFamily: typography.family.medium,
    color: colors.text.secondary,
    textTransform: 'capitalize',
  },
});
