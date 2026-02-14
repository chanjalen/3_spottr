import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
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
  return (
    <View style={styles.container}>
      <Avatar uri={user.avatar_url} name={user.display_name} size={44} />
      <View style={styles.info}>
        <View style={styles.nameRow}>
          <Text style={styles.name}>{user.display_name}</Text>
          {user.streak != null && user.streak > 0 && (
            <View style={styles.streakBadge}>
              <Text style={styles.streakText}>{user.streak}d</Text>
            </View>
          )}
          <Text style={styles.dot}>&middot;</Text>
          <Text style={styles.time}>{timeAgo(createdAt)}</Text>
        </View>
        <View style={styles.metaRow}>
          {locationName && (
            <View style={styles.locationRow}>
              <Feather
                name="map-pin"
                size={12}
                color={colors.text.muted}
              />
              <Text style={styles.location}>{locationName}</Text>
            </View>
          )}
          {workoutType && (
            <View style={styles.typeBadge}>
              <Text style={styles.typeText}>{workoutType}</Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    marginBottom: spacing.base,
  },
  info: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  name: {
    fontSize: typography.size.base,
    fontFamily: typography.family.semibold,
    color: colors.text.primary,
  },
  streakBadge: {
    backgroundColor: colors.brand.primary + '20',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  streakText: {
    fontSize: typography.size.xs,
    fontFamily: typography.family.semibold,
    color: colors.brand.primary,
  },
  dot: {
    fontSize: typography.size.xs,
    color: colors.text.muted,
  },
  time: {
    fontSize: typography.size.sm,
    fontFamily: typography.family.regular,
    color: colors.text.secondary,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: 2,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  location: {
    fontSize: typography.size.xs,
    fontFamily: typography.family.regular,
    color: colors.text.muted,
  },
  typeBadge: {
    backgroundColor: colors.brand.secondary + '18',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  typeText: {
    fontSize: typography.size.xs,
    fontFamily: typography.family.medium,
    color: colors.brand.secondary,
  },
});
