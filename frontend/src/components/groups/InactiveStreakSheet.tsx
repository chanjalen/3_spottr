import React, { useCallback, useRef } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator } from 'react-native';
import BottomSheet, { BottomSheetBackdrop } from '@gorhom/bottom-sheet';
import { Feather } from '@expo/vector-icons';
import Avatar from '../common/Avatar';
import { GroupStreakMember } from '../../api/groups';
import { colors, spacing, typography } from '../../theme';

interface InactiveStreakSheetProps {
  groupStreak: number;
  members: GroupStreakMember[];
  isLoading: boolean;
  onClose: () => void;
}

export default function InactiveStreakSheet({
  groupStreak,
  members,
  isLoading,
  onClose,
}: InactiveStreakSheetProps) {
  const sheetRef = useRef<BottomSheet>(null);
  const hasActiveStreak = groupStreak > 0;

  // When a group streak is active, flag members who haven't checked in today.
  // When there's no group streak, flag members with no active personal streak.
  const flagged = hasActiveStreak
    ? members.filter((m) => !m.has_activity_today)
    : members.filter((m) => m.current_streak === 0);

  const handleSheetChange = useCallback(
    (index: number) => {
      if (index === -1) onClose();
    },
    [onClose],
  );

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        opacity={0.5}
      />
    ),
    [],
  );

  const renderMember = useCallback(
    ({ item }: { item: GroupStreakMember }) => (
      <View style={styles.row}>
        <Avatar uri={item.avatar_url} name={item.display_name || item.username} size={40} />
        <View style={styles.rowInfo}>
          <Text style={styles.displayName}>{item.display_name || item.username}</Text>
          <Text style={styles.username}>@{item.username}</Text>
        </View>
        <View style={styles.streakBadge}>
          <Feather name="zap" size={13} color={colors.text.muted} />
          <Text style={styles.streakCount}>{item.current_streak}d</Text>
        </View>
      </View>
    ),
    [],
  );

  const title = hasActiveStreak ? 'Not Checked In Today' : 'No Active Streak';
  const emptyTitle = hasActiveStreak ? "Everyone's checked in!" : "All members are on a streak!";
  const emptySubtitle = hasActiveStreak
    ? 'All members have logged activity today.'
    : 'Every member has an active personal streak.';

  return (
    <BottomSheet
      ref={sheetRef}
      index={0}
      snapPoints={['45%', '75%']}
      onChange={handleSheetChange}
      backdropComponent={renderBackdrop}
      enablePanDownToClose
      backgroundStyle={styles.background}
      handleIndicatorStyle={styles.handle}
    >
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        {!isLoading && (
          <View style={[styles.badge, flagged.length === 0 && styles.badgeGreen]}>
            <Text style={styles.badgeText}>{flagged.length}</Text>
          </View>
        )}
      </View>

      {isLoading ? (
        <View style={styles.loader}>
          <ActivityIndicator color={colors.brand.primary} />
        </View>
      ) : flagged.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Feather name="check-circle" size={32} color={colors.semantic.prGreen} />
          <Text style={styles.emptyTitle}>{emptyTitle}</Text>
          <Text style={styles.emptySubtitle}>{emptySubtitle}</Text>
        </View>
      ) : (
        <FlatList
          data={flagged}
          keyExtractor={(m) => m.user_id}
          renderItem={renderMember}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  background: {
    backgroundColor: colors.background.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  handle: {
    backgroundColor: colors.border.default,
    width: 36,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  title: {
    fontSize: typography.size.md,
    fontFamily: typography.family.semibold,
    color: colors.text.primary,
  },
  badge: {
    backgroundColor: colors.semantic.error,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  badgeGreen: {
    backgroundColor: colors.semantic.prGreen,
  },
  badgeText: {
    fontSize: typography.size.xs,
    fontFamily: typography.family.bold,
    color: '#fff',
  },
  loader: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing['3xl'],
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: spacing['3xl'],
    gap: spacing.sm,
  },
  emptyTitle: {
    fontSize: typography.size.base,
    fontFamily: typography.family.semibold,
    color: colors.text.primary,
    marginTop: spacing.sm,
  },
  emptySubtitle: {
    fontSize: typography.size.sm,
    fontFamily: typography.family.regular,
    color: colors.text.muted,
    textAlign: 'center',
    paddingHorizontal: spacing['2xl'],
  },
  list: {
    padding: spacing.base,
    gap: spacing.base,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  rowInfo: {
    flex: 1,
  },
  displayName: {
    fontSize: typography.size.base,
    fontFamily: typography.family.medium,
    color: colors.text.primary,
  },
  username: {
    fontSize: typography.size.sm,
    fontFamily: typography.family.regular,
    color: colors.text.muted,
  },
  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  streakCount: {
    fontSize: typography.size.sm,
    fontFamily: typography.family.medium,
    color: colors.text.muted,
  },
});
