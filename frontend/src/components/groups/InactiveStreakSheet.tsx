import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Pressable,
  Alert,
  Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import Avatar from '../common/Avatar';
import { GroupStreakMember } from '../../api/groups';
import { sendGroupZap } from '../../api/messaging';
import { useAuth } from '../../store/AuthContext';
import { colors, spacing, typography } from '../../theme';

interface InactiveStreakSheetProps {
  isOpen: boolean;
  groupId: string;
  groupStreak: number;
  members: GroupStreakMember[];
  isLoading: boolean;
  onClose: () => void;
}

export default function InactiveStreakSheet({
  isOpen,
  groupId,
  groupStreak,
  members,
  isLoading,
  onClose,
}: InactiveStreakSheetProps) {
  const insets = useSafeAreaInsets();
  const { user: me } = useAuth();
  const [zapping, setZapping] = useState<string | null>(null);

  const hasActiveStreak = groupStreak > 0;

  const flagged = hasActiveStreak
    ? members.filter((m) => !m.has_activity_today)
    : members.filter((m) => m.current_streak === 0);

  const handleZap = useCallback(async (member: GroupStreakMember) => {
    if (zapping) return;
    setZapping(member.user_id);
    try {
      await sendGroupZap(groupId, member.user_id);
    } catch (err: any) {
      Alert.alert('Error', 'Could not send zap to the group chat.');
    } finally {
      setZapping(null);
    }
  }, [zapping, groupId]);

  const renderMember = useCallback(
    ({ item }: { item: GroupStreakMember }) => {
      const isMe = String(item.user_id) === String(me?.id);
      const isZapping = zapping === item.user_id;

      return (
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
          {!isMe && (
            <Pressable
              style={[styles.zapBtn, (isZapping || !!zapping) && styles.zapBtnDisabled]}
              onPress={() => handleZap(item)}
              disabled={!!zapping}
            >
              {isZapping ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Feather name="zap" size={13} color="#fff" />
                  <Text style={styles.zapBtnText}>Zap</Text>
                </>
              )}
            </Pressable>
          )}
        </View>
      );
    },
    [zapping, me?.id, handleZap],
  );

  const title = hasActiveStreak ? 'Not Checked In Today' : 'No Active Streak';
  const emptyTitle = hasActiveStreak ? "Everyone's checked in!" : "All members are on a streak!";
  const emptySubtitle = hasActiveStreak
    ? 'All members have logged activity today.'
    : 'Every member has an active personal streak.';

  return (
    <Modal
      visible={isOpen}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* Tap-outside backdrop */}
      <Pressable style={styles.overlay} onPress={onClose}>
        {/* Sheet — stop propagation so taps inside don't close */}
        <Pressable
          style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}
          onPress={(e) => e.stopPropagation()}
        >
          {/* Drag handle */}
          <View style={styles.handle} />

          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Text style={styles.title}>{title}</Text>
              {!isLoading && (
                <View style={[styles.badge, flagged.length === 0 && styles.badgeGreen]}>
                  <Text style={styles.badgeText}>{flagged.length}</Text>
                </View>
              )}
            </View>
            <Pressable style={styles.closeBtn} onPress={onClose}>
              <Feather name="x" size={16} color={colors.text.secondary} />
            </Pressable>
          </View>

          {/* Content */}
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
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.background.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '75%',
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: colors.border.default,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
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
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.background.elevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loader: {
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
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xs,
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
  zapBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F97316',
    borderRadius: 20,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    minWidth: 60,
    justifyContent: 'center',
  },
  zapBtnDisabled: {
    opacity: 0.5,
  },
  zapBtnText: {
    fontSize: typography.size.sm,
    fontFamily: typography.family.bold,
    color: '#fff',
  },
});
