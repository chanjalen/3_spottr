import React, { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { WorkoutDetail, ExerciseDetail } from '../../types/feed';
import { fetchWorkoutDetail } from '../../api/feed';
import { colors, spacing, typography } from '../../theme';

interface WorkoutDetailModalProps {
  workoutId: string | null;
  onClose: () => void;
}

export default function WorkoutDetailModal({ workoutId, onClose }: WorkoutDetailModalProps) {
  const insets = useSafeAreaInsets();
  const [detail, setDetail] = useState<WorkoutDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!workoutId) {
      setDetail(null);
      setError(false);
      return;
    }
    setLoading(true);
    setError(false);
    fetchWorkoutDetail(workoutId)
      .then(setDetail)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [workoutId]);

  return (
    <Modal
      visible={!!workoutId}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.container, { paddingTop: insets.top || spacing.lg }]}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {detail?.name ?? 'Workout'}
          </Text>
          <Pressable style={styles.closeBtn} onPress={onClose} hitSlop={12}>
            <Feather name="x" size={22} color={colors.textPrimary} />
          </Pressable>
        </View>

        {loading && (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} size="large" />
          </View>
        )}

        {error && !loading && (
          <View style={styles.center}>
            <Feather name="alert-circle" size={32} color={colors.textMuted} />
            <Text style={styles.errorText}>Could not load workout details.</Text>
          </View>
        )}

        {detail && !loading && (
          <>
            {/* Summary row */}
            <View style={styles.summaryRow}>
              <SummaryPill icon="clock" label={detail.duration} />
              <SummaryPill icon="activity" label={`${detail.exercises.length} exercises`} />
              <SummaryPill
                icon="layers"
                label={`${detail.exercises.reduce((acc, ex) => acc + ex.sets.length, 0)} sets`}
              />
            </View>

            <ScrollView
              contentContainerStyle={{ padding: spacing.base, paddingBottom: insets.bottom + 40 }}
              showsVerticalScrollIndicator={false}
            >
              {detail.exercises.map((ex, i) => (
                <ExerciseCard key={ex.id} exercise={ex} index={i} />
              ))}
            </ScrollView>
          </>
        )}
      </View>
    </Modal>
  );
}

function SummaryPill({ icon, label }: { icon: React.ComponentProps<typeof Feather>['name']; label: string }) {
  return (
    <View style={styles.summaryPill}>
      <Feather name={icon} size={13} color={colors.primary} />
      <Text style={styles.summaryPillText}>{label}</Text>
    </View>
  );
}

function ExerciseCard({ exercise, index }: { exercise: ExerciseDetail; index: number }) {
  const completedSets = exercise.sets.filter((s) => s.completed);

  return (
    <View style={styles.exerciseCard}>
      {/* Exercise header */}
      <View style={styles.exerciseHeader}>
        <View style={styles.exerciseIndex}>
          <Text style={styles.exerciseIndexText}>{index + 1}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.exerciseName}>{exercise.name}</Text>
          {exercise.category ? (
            <Text style={styles.exerciseCategory}>{exercise.category}</Text>
          ) : null}
        </View>
        <Text style={styles.setCount}>
          {completedSets.length}/{exercise.sets.length} sets
        </Text>
      </View>

      {/* Sets table */}
      {exercise.sets.length > 0 && (
        <View style={styles.setsTable}>
          {/* Column headers */}
          <View style={[styles.setRow, styles.setHeaderRow]}>
            <Text style={[styles.setCell, styles.setCellSet, styles.setHeader]}>SET</Text>
            <Text style={[styles.setCell, styles.setCellWeight, styles.setHeader]}>
              {exercise.unit === 'bodyweight' ? '' : `WEIGHT (${exercise.unit.toUpperCase()})`}
            </Text>
            <Text style={[styles.setCell, styles.setCellReps, styles.setHeader]}>REPS</Text>
            <View style={styles.setCellCheck} />
          </View>
          {exercise.sets.map((s) => (
            <View key={s.set_number} style={styles.setRow}>
              <Text style={[styles.setCell, styles.setCellSet, styles.setNum]}>{s.set_number}</Text>
              <Text style={[styles.setCell, styles.setCellWeight, styles.setData]}>
                {exercise.unit === 'bodyweight' ? '—' : (s.weight > 0 ? s.weight : '—')}
              </Text>
              <Text style={[styles.setCell, styles.setCellReps, styles.setData]}>{s.reps}</Text>
              <View style={styles.setCellCheck}>
                <View style={[styles.checkDot, s.completed && styles.checkDotCompleted]}>
                  {s.completed && <Feather name="check" size={10} color="#fff" />}
                </View>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.base,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  headerTitle: {
    flex: 1,
    fontSize: typography.size.lg,
    fontFamily: typography.family.bold,
    color: colors.textPrimary,
  },
  closeBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  errorText: {
    fontSize: typography.size.sm,
    fontFamily: typography.family.regular,
    color: colors.textMuted,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  summaryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.surface,
    borderRadius: 20,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4 },
      android: { elevation: 1 },
    }),
  },
  summaryPillText: {
    fontSize: typography.size.xs,
    fontFamily: typography.family.semibold,
    color: colors.textPrimary,
  },
  exerciseCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    marginBottom: spacing.md,
    overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 },
      android: { elevation: 2 },
    }),
  },
  exerciseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
  },
  exerciseIndex: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary + '20',
    alignItems: 'center',
    justifyContent: 'center',
  },
  exerciseIndexText: {
    fontSize: typography.size.sm,
    fontFamily: typography.family.bold,
    color: colors.primary,
  },
  exerciseName: {
    fontSize: typography.size.base,
    fontFamily: typography.family.semibold,
    color: colors.textPrimary,
  },
  exerciseCategory: {
    fontSize: typography.size.xs,
    fontFamily: typography.family.regular,
    color: colors.textMuted,
    marginTop: 1,
  },
  setCount: {
    fontSize: typography.size.xs,
    fontFamily: typography.family.medium,
    color: colors.textSecondary,
  },
  setsTable: {
    borderTopWidth: 1,
    borderTopColor: colors.border.subtle,
  },
  setHeaderRow: {
    backgroundColor: colors.background.elevated,
  },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  setCell: {
    fontSize: typography.size.sm,
  },
  setCellSet: { width: 36 },
  setCellWeight: { flex: 1 },
  setCellReps: { width: 44, textAlign: 'right' },
  setCellCheck: { width: 36, alignItems: 'flex-end' },
  setHeader: {
    fontSize: 10,
    fontFamily: typography.family.medium,
    color: colors.textMuted,
    letterSpacing: 0.5,
  },
  setNum: {
    fontFamily: typography.family.medium,
    color: colors.textSecondary,
  },
  setData: {
    fontFamily: typography.family.semibold,
    color: colors.textPrimary,
  },
  checkDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: colors.border.default,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkDotCompleted: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
});
