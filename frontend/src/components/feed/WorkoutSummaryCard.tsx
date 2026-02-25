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
  const displayExercises = workout.exercises.slice(0, 3);
  const remaining = workout.exercise_count - displayExercises.length;

  return (
    <Pressable
      style={({ pressed }) => [styles.container, pressed && onPress && styles.pressed]}
      onPress={onPress}
      disabled={!onPress}
    >
      {/* Workout name row */}
      <View style={styles.nameRow}>
        <Feather name="activity" size={14} color={colors.primary} />
        <Text style={styles.workoutName} numberOfLines={1}>{workout.name}</Text>
        {onPress && <Feather name="chevron-right" size={16} color={colors.primary} />}
      </View>

      {/* Stats row */}
      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{workout.exercise_count}</Text>
          <Text style={styles.statLabel}>exercises</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.stat}>
          <Text style={styles.statValue}>{workout.total_sets}</Text>
          <Text style={styles.statLabel}>sets</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.stat}>
          <Text style={styles.statValue}>{workout.duration}</Text>
        </View>
      </View>

      {/* Exercise list */}
      {displayExercises.length > 0 && (
        <View style={styles.exerciseList}>
          {displayExercises.map((ex, i) => (
            <View key={i} style={styles.exerciseRow}>
              <View style={styles.exerciseDot} />
              <Text style={styles.exerciseName}>{ex.name}</Text>
              <Text style={styles.exerciseSets}>{ex.sets} sets</Text>
            </View>
          ))}
          {remaining > 0 && (
            <Text style={styles.moreText}>+{remaining} more</Text>
          )}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.background.elevated,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border.default,
    padding: spacing.base,
    marginBottom: spacing.md,
  },
  pressed: {
    opacity: 0.75,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  workoutName: {
    flex: 1,
    fontSize: typography.size.sm,
    fontFamily: typography.family.semibold,
    color: colors.textPrimary,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    marginBottom: spacing.md,
  },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statValue: {
    fontSize: typography.size.base,
    fontFamily: typography.family.bold,
    color: colors.textPrimary,
  },
  statLabel: {
    fontSize: typography.size.xs,
    fontFamily: typography.family.regular,
    color: colors.textSecondary,
  },
  divider: {
    width: 1,
    height: 20,
    backgroundColor: colors.border.default,
  },
  exerciseList: {
    borderTopWidth: 1,
    borderTopColor: colors.border.default,
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
  exerciseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  exerciseDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.primary,
  },
  exerciseName: {
    flex: 1,
    fontSize: typography.size.sm,
    fontFamily: typography.family.regular,
    color: colors.textPrimary,
  },
  exerciseSets: {
    fontSize: typography.size.xs,
    fontFamily: typography.family.medium,
    color: colors.textSecondary,
  },
  moreText: {
    fontSize: typography.size.xs,
    fontFamily: typography.family.medium,
    color: colors.primary,
    marginTop: 2,
  },
});
