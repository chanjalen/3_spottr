import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { WorkoutSummary } from '../../types/feed';
import { colors, spacing, typography } from '../../theme';

interface WorkoutSummaryCardProps {
  workout: WorkoutSummary;
  onPress?: () => void;
}

export default function WorkoutSummaryCard({ workout, onPress }: WorkoutSummaryCardProps) {
  return (
    <Pressable
      style={({ pressed }) => [styles.chip, pressed && onPress && styles.pressed]}
      onPress={onPress}
      disabled={!onPress}
    >
      <Feather name="activity" size={14} color={colors.primary} />
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>{workout.name}</Text>
        <Text style={styles.meta}>
          {workout.exercise_count} exercises · {workout.duration}
        </Text>
      </View>
      {onPress && <Feather name="chevron-right" size={14} color={colors.primary} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary + '12',
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.primary + '30',
    marginBottom: spacing.md,
  },
  pressed: {
    opacity: 0.7,
  },
  info: {
    flex: 1,
  },
  name: {
    fontSize: typography.size.sm,
    fontFamily: typography.family.semibold,
    color: colors.textPrimary,
  },
  meta: {
    fontSize: typography.size.xs,
    fontFamily: typography.family.regular,
    color: colors.textSecondary,
    marginTop: 1,
  },
});
