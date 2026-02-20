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
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { fetchStreakInfo, updateWorkoutGoal, takeRestDay } from '../../api/workouts';
import { StreakInfo } from '../../types/workout';
import { colors, spacing, typography } from '../../theme';
import { RootStackParamList } from '../../navigation/types';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'StreakDetails'>;
};

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function StreakDetailsScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [streakInfo, setStreakInfo] = useState<StreakInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [restLoading, setRestLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await fetchStreakInfo();
      setStreakInfo(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleRestDay = async () => {
    setRestLoading(true);
    try {
      await takeRestDay();
      load();
    } catch {
      Alert.alert('Error', 'Could not take rest day.');
    } finally {
      setRestLoading(false);
    }
  };

  const handleGoalChange = () => {
    const options = [1, 2, 3, 4, 5, 6, 7];
    Alert.alert(
      'Weekly Goal',
      'How many days per week do you want to work out?',
      options.map((n) => ({
        text: `${n} day${n > 1 ? 's' : ''}`,
        onPress: async () => {
          await updateWorkoutGoal(n).catch(() => {});
          load();
        },
      })),
    );
  };

  if (loading) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const isActive = streakInfo && streakInfo.current_streak > 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background.base }}>
      {/* Header */}
      <View style={[styles.headerBar, { paddingTop: insets.top }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Streak</Text>
        <Pressable style={styles.infoBtn}>
          <Feather name="help-circle" size={20} color={colors.textMuted} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.base, gap: spacing.md, paddingBottom: insets.bottom + 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />}
      >
        {/* Hero card */}
        <LinearGradient
          colors={isActive ? ['#4FC3E0', '#2FA4C7'] : ['#9CA3AF', '#6B7280']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroCard}
        >
          <Text style={styles.heroNum}>{streakInfo?.current_streak ?? 0}</Text>
          <Text style={styles.heroLabel}>Day Streak</Text>
          <Text style={styles.heroEmoji}>{isActive ? '🔥' : '❄️'}</Text>
          <View style={[styles.statusBadge, isActive ? styles.statusActive : styles.statusInactive]}>
            <Text style={styles.statusText}>{isActive ? 'Active' : 'Start your streak!'}</Text>
          </View>
        </LinearGradient>

        {/* Stats */}
        <View style={styles.statsCard}>
          <StatRow label="Current Streak" value={`${streakInfo?.current_streak ?? 0} days`} />
          <View style={styles.statDivider} />
          <StatRow label="Longest Streak" value={`${streakInfo?.longest_streak ?? 0} days`} />
        </View>

        {/* This Week */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitle}>This Week</Text>
            <Pressable onPress={handleGoalChange}>
              <Text style={styles.editGoalText}>Goal: {streakInfo?.weekly_goal ?? 4} days</Text>
            </Pressable>
          </View>

          <View style={styles.weekRow}>
            {DAY_LABELS.map((day, i) => {
              const dayData = streakInfo?.week_days[i];
              const isWorkout = dayData?.status === 'workout';
              const isRest = dayData?.status === 'rest';
              const isPending = !dayData || dayData.status === 'pending';
              return (
                <View key={day} style={styles.dayColumn}>
                  <Text style={styles.dayLabel}>{day}</Text>
                  <View style={[
                    styles.dayBubble,
                    isWorkout && styles.dayBubbleWorkout,
                    isRest && styles.dayBubbleRest,
                    isPending && styles.dayBubblePending,
                  ]}>
                    {isWorkout && <Feather name="check" size={14} color="#fff" />}
                    {isRest && <Text style={styles.dayBubbleText}>R</Text>}
                  </View>
                </View>
              );
            })}
          </View>

          <View style={styles.weekFooter}>
            <Text style={styles.weekFooterText}>
              {streakInfo?.workouts_this_week ?? 0}/{streakInfo?.weekly_goal ?? 4} workouts · {streakInfo?.rest_days_used ?? 0} rest days used
            </Text>
          </View>

          <Pressable
            style={[styles.restDayBtn, restLoading && styles.restDayBtnDisabled]}
            onPress={handleRestDay}
            disabled={restLoading}
          >
            {restLoading ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <>
                <Feather name="moon" size={16} color={colors.primary} />
                <Text style={styles.restDayBtnText}>Take Rest Day</Text>
              </>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statRow}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background.base },
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
  infoBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  heroCard: {
    borderRadius: 20,
    padding: spacing['2xl'],
    alignItems: 'center',
    gap: spacing.sm,
  },
  heroNum: { fontSize: 72, fontWeight: '800', color: '#fff', lineHeight: 80 },
  heroLabel: { fontSize: typography.size.lg, fontWeight: '600', color: 'rgba(255,255,255,0.85)' },
  heroEmoji: { fontSize: 32 },
  statusBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 20,
    marginTop: spacing.sm,
  },
  statusActive: { backgroundColor: 'rgba(255,255,255,0.25)' },
  statusInactive: { backgroundColor: 'rgba(255,255,255,0.2)' },
  statusText: { fontSize: typography.size.sm, color: '#fff', fontWeight: '600' },
  statsCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.base,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 },
      android: { elevation: 2 },
    }),
  },
  statRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.sm },
  statDivider: { height: 1, backgroundColor: colors.border.subtle },
  statLabel: { fontSize: typography.size.sm, color: colors.textSecondary },
  statValue: { fontSize: typography.size.base, fontWeight: '700', color: colors.textPrimary },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.base,
    gap: spacing.md,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 },
      android: { elevation: 2 },
    }),
  },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { fontSize: typography.size.base, fontWeight: '700', color: colors.textPrimary },
  editGoalText: { fontSize: typography.size.sm, color: colors.primary, fontWeight: '600' },
  weekRow: { flexDirection: 'row', justifyContent: 'space-between' },
  dayColumn: { alignItems: 'center', gap: spacing.xs },
  dayLabel: { fontSize: typography.size.xs, color: colors.textMuted, fontWeight: '500' },
  dayBubble: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.background.elevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayBubbleWorkout: { backgroundColor: colors.primary },
  dayBubbleRest: { backgroundColor: colors.textMuted },
  dayBubblePending: { borderWidth: 1.5, borderColor: colors.border.default },
  dayBubbleText: { fontSize: typography.size.xs, fontWeight: '700', color: '#fff' },
  weekFooter: { alignItems: 'center' },
  weekFooterText: { fontSize: typography.size.xs, color: colors.textSecondary },
  restDayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: 12,
    paddingVertical: spacing.md,
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  restDayBtnDisabled: { opacity: 0.5 },
  restDayBtnText: { fontSize: typography.size.sm, fontWeight: '600', color: colors.primary },
});
