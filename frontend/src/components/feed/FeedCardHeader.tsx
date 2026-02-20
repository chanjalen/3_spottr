import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import Avatar from '../common/Avatar';
import { UserBrief } from '../../types/user';
import { timeAgo } from '../../utils/timeAgo';
import { colors, spacing, typography } from '../../theme';

interface FeedCardHeaderProps {
  user: UserBrief;
  createdAt: string;
  locationName: string | null;
  workoutType?: string;
}

export default function FeedCardHeader({
  user,
  createdAt,
  locationName,
  workoutType,
}: FeedCardHeaderProps) {
  // Build the "Posted in X" subtitle: prefer workoutType, fall back to locationName
  const postedIn = workoutType ?? locationName;

  if (!user) return null;

  return (
    <View style={styles.container}>
      <Avatar uri={user.avatar_url} name={user.display_name} size={40} />

      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>
          {user.display_name}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {postedIn ? `Posted in ${postedIn} · ` : ''}{timeAgo(createdAt)}
        </Text>
      </View>

      {/* Three-dot overflow button */}
      <Pressable
        style={({ pressed }) => [styles.moreBtn, pressed && styles.moreBtnPressed]}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityLabel="More options"
        accessibilityRole="button"
      >
        <Feather name="more-horizontal" size={20} color={colors.textMuted} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  info: {
    flex: 1,
  },
  name: {
    fontSize: 14,
    fontFamily: typography.family.semibold,
    color: colors.textPrimary,
    lineHeight: 20,
  },
  meta: {
    fontSize: 12,
    fontFamily: typography.family.regular,
    color: colors.textSecondary,
    lineHeight: 16,
    marginTop: 1,
  },
  moreBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreBtnPressed: {
    opacity: 0.6,
  },
});
