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
  sharedContext?: string[];
  onPressUser?: () => void;
  onMore?: () => void;
}

export default function FeedCardHeader({
  user,
  createdAt,
  locationName,
  workoutType,
  sharedContext,
  onPressUser,
  onMore,
}: FeedCardHeaderProps) {
  if (!user) return null;

  const contextTag = workoutType ?? locationName;

  return (
    <View style={styles.container}>
      <Avatar
        uri={user.avatar_url}
        name={user.display_name}
        size={36}
        onPress={onPressUser}
      />

      {/* Name · @handle · time — all on one compact line */}
      <Pressable
        onPress={onPressUser}
        disabled={!onPressUser}
        style={styles.nameLine}
      >
        <Text style={styles.displayName} numberOfLines={1}>
          {user.display_name}
        </Text>
        <Text style={styles.handle} numberOfLines={1}>
          @{user.username}
        </Text>
        <Text style={styles.dot}>·</Text>
        <Text style={styles.time} numberOfLines={1}>
          {timeAgo(createdAt)}
        </Text>
      </Pressable>

      {/* More button */}
      <Pressable
        style={({ pressed }) => [styles.moreBtn, pressed && { opacity: 0.5 }]}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        accessibilityLabel="More options"
        onPress={onMore}
      >
        <Feather name="more-horizontal" size={18} color={colors.textMuted} />
      </Pressable>

      {/* Context tag (workout type / location) below name row */}
      {contextTag && (
        <View style={styles.tagWrap}>
          <View style={styles.tag}>
            <Text style={styles.tagText}>{contextTag}</Text>
          </View>
          {sharedContext?.map((t, i) => (
            <View key={i} style={styles.tag}>
              <Text style={styles.tagText}>{t}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    marginBottom: spacing.xs,
    gap: spacing.sm,
  },
  nameLine: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'nowrap',
    gap: 4,
    minWidth: 0,
  },
  displayName: {
    fontSize: typography.size.sm,
    fontFamily: typography.family.semibold,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  handle: {
    fontSize: typography.size.sm,
    fontFamily: typography.family.regular,
    color: colors.textMuted,
    flexShrink: 1,
  },
  dot: {
    fontSize: typography.size.sm,
    color: colors.textMuted,
  },
  time: {
    fontSize: typography.size.sm,
    fontFamily: typography.family.regular,
    color: colors.textMuted,
    flexShrink: 0,
  },
  moreBtn: {
    marginLeft: spacing.xs,
    padding: 2,
  },
  tagWrap: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 3,
  },
  tag: {
    backgroundColor: colors.primary + '15',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: colors.primary + '25',
  },
  tagText: {
    fontSize: 10,
    fontFamily: typography.family.semibold,
    color: colors.primary,
  },
});
