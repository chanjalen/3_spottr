import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { startWorkout, fetchActiveWorkout, fetchStreakInfo } from '../../api/workouts';
import { Workout, StreakDetails } from '../../types/workout';
import { colors, spacing, typography } from '../../theme';
import { RootStackParamList } from '../../navigation/types';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'WorkoutLog'>;
};

export default function WorkoutLogScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [streakInfo, setStreakInfo] = useState<StreakDetails | null>(null);
  const [activeWorkout, setActiveWorkout] = useState<Workout | null>(null);
  const [loading, setLoading] = useState(true);
  const [startLoading, setStartLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [streak, active] = await Promise.all([
        fetchStreakInfo().catch(() => null),
        fetchActiveWorkout().catch(() => null),
      ]);
      setStreakInfo(streak);
      setActiveWorkout(active);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleStart = async () => {
    setStartLoading(true);
    try {
      const workout = await startWorkout();
      navigation.navigate('ActiveWorkout', { workoutId: workout.id });
    } finally {
      setStartLoading(false);
    }
  };


  return (
    <View style={{ flex: 1, backgroundColor: colors.background.base }}>
      {/* Header */}
      <View style={[styles.headerBar, { paddingTop: insets.top }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Feather name="x" size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Log Workout</Text>
        <Pressable onPress={() => navigation.navigate('StreakDetails')}>
          <Feather name="zap" size={22} color={colors.primary} />
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.base, gap: spacing.md, paddingBottom: insets.bottom + 100 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />}
        >
          {/* Streak card */}
          {streakInfo && (
            <Pressable onPress={() => navigation.navigate('StreakDetails')}>
              <LinearGradient colors={['#4FC3E0', '#2FA4C7']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.streakCard}>
                <View style={styles.streakRow}>
                  <View>
                    <Text style={styles.streakNum}>{streakInfo.current_streak}</Text>
                    <Text style={styles.streakLabel}>Day Streak 🔥</Text>
                  </View>
                  <View style={styles.weekDays}>
                    {streakInfo.week_days.map((dayData, i) => (
                      <View key={i} style={styles.dayWrap}>
                        <Text style={styles.dayLabel}>{dayData.label}</Text>
                        <View style={[
                          styles.dayDot,
                          dayData.active && styles.dayDotWorkout,
                          dayData.rest && styles.dayDotRest,
                        ]} />
                      </View>
                    ))}
                  </View>
                </View>
                <View style={styles.streakGoalRow}>
                  <Text style={styles.streakGoalText}>{streakInfo.weekly_workout_count}/{streakInfo.weekly_workout_goal} this week</Text>
                  <Feather name="chevron-right" size={16} color="rgba(255,255,255,0.7)" />
                </View>
              </LinearGradient>
            </Pressable>
          )}

          {/* Resume active workout */}
          {activeWorkout && (
            <Pressable
              style={styles.resumeCard}
              onPress={() => navigation.navigate('ActiveWorkout', { workoutId: activeWorkout.id })}
            >
              <View style={styles.resumeLeft}>
                <Feather name="activity" size={20} color={colors.primary} />
                <View>
                  <Text style={styles.resumeTitle}>Resume Workout</Text>
                  <Text style={styles.resumeSub}>{activeWorkout.exercise_count} exercises · {activeWorkout.total_sets} sets</Text>
                </View>
              </View>
              <Feather name="chevron-right" size={20} color={colors.textMuted} />
            </Pressable>
          )}

          {/* Start buttons */}
          <Pressable
            style={({ pressed }) => [styles.startBtn, pressed && styles.startBtnPressed]}
            onPress={handleStart}
            disabled={startLoading}
          >
            {startLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Feather name="plus" size={20} color="#fff" />
                <Text style={styles.startBtnText}>Start Empty Workout</Text>
              </>
            )}
          </Pressable>

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or choose template</Text>
            <View style={styles.dividerLine} />
          </View>

          <Pressable style={styles.templateBtn}>
            <Feather name="copy" size={18} color={colors.primary} />
            <Text style={styles.templateBtnText}>Browse Templates</Text>
          </Pressable>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: typography.size.lg, fontWeight: '700', color: colors.textPrimary },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  streakCard: {
    borderRadius: 16,
    padding: spacing.base,
    gap: spacing.sm,
  },
  streakRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  streakNum: { fontSize: 40, fontWeight: '800', color: '#fff' },
  streakLabel: { fontSize: typography.size.sm, color: 'rgba(255,255,255,0.8)', fontWeight: '500' },
  weekDays: { flexDirection: 'row', gap: spacing.xs },
  dayWrap: { alignItems: 'center', gap: 4 },
  dayLabel: { fontSize: 10, color: 'rgba(255,255,255,0.7)', fontWeight: '600' },
  dayDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: 'rgba(255,255,255,0.3)' },
  dayDotWorkout: { backgroundColor: '#fff' },
  dayDotRest: { backgroundColor: 'rgba(255,255,255,0.5)' },
  streakGoalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  streakGoalText: { fontSize: typography.size.sm, color: 'rgba(255,255,255,0.8)' },
  resumeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: spacing.base,
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  resumeLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  resumeTitle: { fontSize: typography.size.base, fontWeight: '600', color: colors.textPrimary },
  resumeSub: { fontSize: typography.size.xs, color: colors.textSecondary },
  startBtn: {
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: spacing.base,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    ...Platform.select({
      ios: { shadowColor: 'rgba(79,195,224,0.4)', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 1, shadowRadius: 12 },
      android: { elevation: 4 },
    }),
  },
  startBtnPressed: { opacity: 0.85 },
  startBtnText: { fontSize: typography.size.base, fontWeight: '700', color: '#fff' },
  divider: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.border.default },
  dividerText: { fontSize: typography.size.xs, color: colors.textMuted },
  templateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: 14,
    paddingVertical: spacing.base,
    borderWidth: 1.5,
    borderColor: colors.primary,
    backgroundColor: 'rgba(79,195,224,0.06)',
  },
  templateBtnText: { fontSize: typography.size.base, fontWeight: '600', color: colors.primary },
});
