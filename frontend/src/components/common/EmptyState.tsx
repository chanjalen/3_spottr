import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, typography } from '../../theme';

interface EmptyStateProps {
  tab: 'main' | 'friends';
}

export default function EmptyState({ tab }: EmptyStateProps) {
  const message =
    tab === 'friends'
      ? "Your friends haven't posted yet. Be the first!"
      : 'No posts to show yet. Start by sharing a workout!';

  return (
    <View style={styles.container}>
      <View style={styles.iconWrap}>
        <Feather name="inbox" size={48} color={colors.textMuted} />
      </View>
      <Text style={styles.title}>Nothing here yet</Text>
      <Text style={styles.message}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing['2xl'],
    paddingTop: 80,
  },
  iconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.background.elevated,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: typography.size.lg,
    fontFamily: typography.family.semibold,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  message: {
    fontSize: typography.size.sm,
    fontFamily: typography.family.regular,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
});
