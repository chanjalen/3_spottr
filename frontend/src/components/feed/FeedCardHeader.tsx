import React from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
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
}

export default function FeedCardHeader({
  user,
  createdAt,
  locationName,
  workoutType,
  sharedContext,
  onPressUser,
}: FeedCardHeaderProps) {
  const postedIn = workoutType ?? locationName;

  if (!user) return null;

  return (
    <View style={styles.container}>
      <Pressable onPress={onPressUser} disabled={!onPressUser} style={styles.userPressable}>
        <Avatar uri={user.avatar_url} name={user.display_name} size={40} />
      </Pressable>

      <Pressable onPress={onPressUser} disabled={!onPressUser} style={styles.info}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>
            {user.display_name}
          </Text>
          {sharedContext && sharedContext.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.tagsScroll}
              contentContainerStyle={styles.tagsContainer}
            >
              {sharedContext.map((tag, i) => (
                <View key={i} style={styles.tag}>
                  <Text style={styles.tagText}>{tag}</Text>
                </View>
              ))}
            </ScrollView>
          )}
        </View>
        <Text style={styles.meta} numberOfLines={1}>
          {postedIn ? `Posted in ${postedIn} · ` : ''}{timeAgo(createdAt)}
        </Text>
      </Pressable>

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
  userPressable: {
    // no extra styles — just wraps the avatar for hit target
  },
  info: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flexWrap: 'nowrap',
  },
  name: {
    fontSize: 14,
    fontFamily: typography.family.semibold,
    color: colors.textPrimary,
    lineHeight: 20,
    flexShrink: 1,
  },
  tagsScroll: {
    flexShrink: 1,
  },
  tagsContainer: {
    flexDirection: 'row',
    gap: 4,
    alignItems: 'center',
  },
  tag: {
    backgroundColor: colors.primary + '18',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: colors.primary + '30',
  },
  tagText: {
    fontSize: 10,
    fontFamily: typography.family.semibold,
    color: colors.primary,
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
