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
  Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { fetchStreakInfo, updateWorkoutGoal, takeRestDay, fetchCalendarPosts } from '../../api/workouts';
import { StreakDetails, CalendarPost } from '../../types/workout';
import { useAuth } from '../../store/AuthContext';
import { colors, spacing, typography } from '../../theme';
import { RootStackParamList } from '../../navigation/types';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'StreakDetails'>;
};

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export default function StreakDetailsScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { setCurrentStreak } = useAuth();

  const [streakData, setStreakData] = useState<StreakDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [restLoading, setRestLoading] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [showGoalPicker, setShowGoalPicker] = useState(false);

  // Calendar state
  const now = new Date();
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth() + 1); // 1-indexed
  const [activeDates, setActiveDates] = useState<Set<string>>(new Set());
  const [restDates, setRestDates] = useState<Set<string>>(new Set());
  const [calLoading, setCalLoading] = useState(false);

  const loadStreak = useCallback(async () => {
    try {
      const data = await fetchStreakInfo();
      setStreakData(data);
      setCurrentStreak(data.current_streak);
    } catch {
      // ignore
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [setCurrentStreak]);

  const loadCalendar = useCallback(async (year: number, month: number) => {
    setCalLoading(true);
    try {
      const res = await fetchCalendarPosts(year, month);
      const active = new Set<string>();
      const rest = new Set<string>();
      for (const p of res.posts) {
        if (p.type === 'rest') rest.add(p.date);
        else active.add(p.date);
      }
      setActiveDates(active);
      setRestDates(rest);
    } catch {
      setActiveDates(new Set());
      setRestDates(new Set());
    } finally {
      setCalLoading(false);
    }
  }, []);

  useEffect(() => { loadStreak(); }, [loadStreak]);
  useEffect(() => { loadCalendar(calYear, calMonth); }, [loadCalendar, calYear, calMonth]);

  const handleRestDay = () => {
    if (!streakData) return;
    const used = streakData.rest_info.rest_days_used;
    const remaining = streakData.rest_info.rest_days_remaining;
    const allowed = streakData.rest_info.rest_days_allowed;

    Alert.alert(
      'Take a Rest Day?',
      `You've used ${used} of ${allowed} rest days this week.\n${remaining - 1 >= 0 ? remaining - 1 : 0} will remain after this.\n\nRest days protect your streak on recovery days.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Log Rest Day',
          style: 'default',
          onPress: async () => {
            setRestLoading(true);
            try {
              await takeRestDay();
              loadStreak();
            } catch (err: any) {
              const msg = err?.response?.data?.error ?? 'Could not take rest day.';
              Alert.alert('Rest Day', msg);
            } finally {
              setRestLoading(false);
            }
          },
        },
      ],
    );
  };

  const handleGoalChange = () => setShowGoalPicker(true);

  const handleGoalSelect = async (n: number) => {
    setShowGoalPicker(false);
    await updateWorkoutGoal(n).catch(() => {});
    loadStreak();
  };

  const prevMonth = () => {
    if (calMonth === 1) { setCalYear(y => y - 1); setCalMonth(12); }
    else setCalMonth(m => m - 1);
  };

  const nextMonth = () => {
    const today = new Date();
    if (calYear > today.getFullYear() || (calYear === today.getFullYear() && calMonth >= today.getMonth() + 1)) return;
    if (calMonth === 12) { setCalYear(y => y + 1); setCalMonth(1); }
    else setCalMonth(m => m + 1);
  };

  const isNextDisabled = () => {
    const today = new Date();
    return calYear >= today.getFullYear() && calMonth >= today.getMonth() + 1;
  };

  if (loading) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const streak = streakData!;
  const isActive = streak.current_streak > 0;
  const goalHit = streak.weekly_workout_count >= streak.weekly_workout_goal;
  const canRestDay = !streak.has_activity_today && !streak.has_rest_today;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background.base }}>
      {/* Header */}
      <View style={[styles.headerBar, { paddingTop: insets.top }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.headerBtn}>
          <Feather name="arrow-left" size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Streak</Text>
        <Pressable style={styles.headerBtn} onPress={() => setShowInfo(true)}>
          <Feather name="help-circle" size={20} color={colors.textMuted} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.base, gap: spacing.md, paddingBottom: insets.bottom + 100 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); loadStreak(); }}
            tintColor={colors.primary}
          />
        }
      >
        {/* Hero card */}
        <LinearGradient
          colors={
            goalHit
              ? ['#F59E0B', '#D97706']
              : isActive
                ? ['#4FC3E0', '#2FA4C7']
                : ['#9CA3AF', '#6B7280']
          }
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroCard}
        >
          {goalHit && (
            <Text style={styles.goalBannerText}>
              Weekly Goal Achieved!
            </Text>
          )}
          <Text style={styles.heroEmoji}>
            {goalHit ? '🏆' : isActive ? '🔥' : '❄️'}
          </Text>
          <Text style={styles.heroNum}>{streak.current_streak}</Text>
          <Text style={styles.heroLabel}>Day Streak</Text>
          <View style={[styles.statusBadge, isActive ? styles.statusActive : styles.statusInactive]}>
            <Text style={styles.statusText}>
              {goalHit
                ? `${streak.weekly_workout_count}/${streak.weekly_workout_goal} workouts done!`
                : streak.has_activity_today
                  ? 'Completed today!'
                  : isActive
                    ? 'Keep it going!'
                    : 'Start your streak!'}
            </Text>
          </View>
        </LinearGradient>

        {/* Stats */}
        <View style={styles.card}>
          <StatRow label="Current Streak" value={`${streak.current_streak} days`} />
          <View style={styles.divider} />
          <StatRow label="Longest Streak" value={`${streak.longest_streak} days`} />
        </View>

        {/* This Week */}
        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <Text style={styles.cardTitle}>This Week</Text>
            <Pressable onPress={handleGoalChange}>
              <Text style={styles.editGoalText}>
                Goal: {streak.weekly_workout_goal} day{streak.weekly_workout_goal !== 1 ? 's' : ''}
              </Text>
            </Pressable>
          </View>

          <View style={styles.weekRow}>
            {streak.week_days.map((day, i) => (
              <View key={i} style={styles.dayCol}>
                <Text style={[styles.dayLabel, day.is_today && styles.dayLabelToday]}>{day.label}</Text>
                <View style={[
                  styles.dayBubble,
                  day.active && styles.bubbleActive,
                  day.rest && styles.bubbleRest,
                  day.is_today && !day.active && !day.rest && styles.bubbleToday,
                  day.is_future && styles.bubbleFuture,
                ]}>
                  {day.active && <Feather name="check" size={14} color="#fff" />}
                  {day.rest && <Text style={styles.bubbleRestText}>R</Text>}
                </View>
              </View>
            ))}
          </View>

          <Text style={styles.weekFooter}>
            {streak.weekly_workout_count}/{streak.weekly_workout_goal} workouts
            {' · '}{streak.rest_info.rest_days_used}/{streak.rest_info.rest_days_allowed} rest days
          </Text>

          <Pressable
            style={[styles.restDayBtn, (!canRestDay || restLoading) && styles.restDayBtnDisabled]}
            onPress={handleRestDay}
            disabled={!canRestDay || restLoading}
          >
            {restLoading ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <>
                <Feather name="moon" size={16} color={canRestDay ? colors.primary : colors.textMuted} />
                <Text style={[styles.restDayBtnText, !canRestDay && { color: colors.textMuted }]}>
                  {streak.has_rest_today
                    ? 'Rest day logged'
                    : streak.has_activity_today
                      ? 'Already active today'
                      : 'Take Rest Day'}
                </Text>
              </>
            )}
          </Pressable>
        </View>

        {/* Calendar */}
        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <Pressable onPress={prevMonth} style={styles.calNavBtn}>
              <Feather name="chevron-left" size={20} color={colors.textSecondary} />
            </Pressable>
            <Text style={styles.cardTitle}>
              {MONTH_NAMES[calMonth - 1]} {calYear}
            </Text>
            <Pressable
              onPress={nextMonth}
              style={[styles.calNavBtn, isNextDisabled() && { opacity: 0.3 }]}
              disabled={isNextDisabled()}
            >
              <Feather name="chevron-right" size={20} color={colors.textSecondary} />
            </Pressable>
          </View>

          {calLoading ? (
            <View style={styles.calLoadingRow}>
              <ActivityIndicator size="small" color={colors.primary} />
            </View>
          ) : (
            <CalendarGrid year={calYear} month={calMonth} activeDates={activeDates} restDates={restDates} />
          )}
        </View>
      </ScrollView>

      {/* Goal picker modal */}
      <Modal visible={showGoalPicker} transparent animationType="fade" onRequestClose={() => setShowGoalPicker(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowGoalPicker(false)}>
          <Pressable style={styles.infoModal} onPress={() => {}}>
            <View style={styles.goalHeader}>
              <Text style={styles.infoTitle}>Weekly Goal</Text>
              <Pressable onPress={() => setShowGoalPicker(false)} hitSlop={8}>
                <Feather name="x" size={20} color={colors.textMuted} />
              </Pressable>
            </View>
            <Text style={styles.goalSubtitle}>How many days per week do you want to work out?</Text>
            {[1, 2, 3, 4, 5, 6, 7].map((n) => (
              <Pressable
                key={n}
                style={({ pressed }) => [styles.goalOption, pressed && { opacity: 0.6 }]}
                onPress={() => handleGoalSelect(n)}
              >
                <Text style={styles.goalOptionText}>{n} day{n > 1 ? 's' : ''}</Text>
              </Pressable>
            ))}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Info modal */}
      <Modal visible={showInfo} transparent animationType="fade" onRequestClose={() => setShowInfo(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowInfo(false)}>
          <View style={styles.infoModal}>
            <Text style={styles.infoTitle}>How Streaks Work</Text>
            <InfoRule icon="zap" text="Log a workout or check-in every day to keep your streak alive." />
            <InfoRule icon="moon" text="Use rest days to protect your streak on recovery days." />
            <InfoRule icon="clock" text="Activities before 3 AM count for the previous day." />
            <InfoRule icon="target" text={`Your budget: ${streak.rest_info.rest_days_allowed} rest day${streak.rest_info.rest_days_allowed !== 1 ? 's' : ''} per week (7 − weekly goal).`} />
            <Pressable style={styles.infoClose} onPress={() => setShowInfo(false)}>
              <Text style={styles.infoCloseText}>Got it</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

// ─── Calendar grid ────────────────────────────────────────────────────────────

function CalendarGrid({
  year, month, activeDates, restDates,
}: { year: number; month: number; activeDates: Set<string>; restDates: Set<string> }) {
  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDayOfWeek = new Date(year, month - 1, 1).getDay();

  const today = new Date();
  const todayKey = `${today.getFullYear()}-${today.getMonth() + 1}-${today.getDate()}`;

  const cells: (number | null)[] = [
    ...Array(firstDayOfWeek).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const DAY_HEADERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  return (
    <View style={calStyles.grid}>
      <View style={calStyles.headerRow}>
        {DAY_HEADERS.map((d, i) => (
          <Text key={i} style={calStyles.headerCell}>{d}</Text>
        ))}
      </View>
      {Array.from({ length: cells.length / 7 }, (_, rowIdx) => (
        <View key={rowIdx} style={calStyles.row}>
          {cells.slice(rowIdx * 7, rowIdx * 7 + 7).map((day, colIdx) => {
            if (!day) return <View key={colIdx} style={calStyles.cell} />;
            const key = `${year}-${month}-${day}`;
            const isActive = activeDates.has(key);
            const isRest = !isActive && restDates.has(key);
            const isToday = key === todayKey;
            return (
              <View key={colIdx} style={[calStyles.cell, isToday && calStyles.cellToday]}>
                <Text style={[
                  calStyles.dayNum,
                  isActive && calStyles.dayNumActive,
                  isRest && calStyles.dayNumRest,
                  isToday && calStyles.dayNumToday,
                ]}>
                  {day}
                </Text>
                {isActive && <View style={calStyles.dot} />}
                {isRest && <Text style={calStyles.restMark}>🌙</Text>}
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statRow}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

function InfoRule({ icon, text }: { icon: React.ComponentProps<typeof Feather>['name']; text: string }) {
  return (
    <View style={styles.infoRule}>
      <Feather name={icon} size={16} color={colors.primary} />
      <Text style={styles.infoRuleText}>{text}</Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

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
  headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: typography.size.lg, fontWeight: '700', color: colors.textPrimary },

  heroCard: {
    borderRadius: 20,
    padding: spacing['2xl'],
    alignItems: 'center',
    gap: spacing.sm,
  },
  goalBannerText: {
    fontSize: typography.size.sm,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.9)',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  heroEmoji: { fontSize: 36 },
  heroNum: { fontSize: 72, fontWeight: '800', color: '#fff', lineHeight: 80 },
  heroLabel: { fontSize: typography.size.lg, fontWeight: '600', color: 'rgba(255,255,255,0.85)' },
  statusBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 20,
    marginTop: spacing.sm,
  },
  statusActive: { backgroundColor: 'rgba(255,255,255,0.25)' },
  statusInactive: { backgroundColor: 'rgba(255,255,255,0.2)' },
  statusText: { fontSize: typography.size.sm, color: '#fff', fontWeight: '600' },

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
  cardTitle: { fontSize: typography.size.base, fontWeight: '700', color: colors.textPrimary },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  divider: { height: 1, backgroundColor: colors.border.subtle },
  statRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.xs },
  statLabel: { fontSize: typography.size.sm, color: colors.textSecondary },
  statValue: { fontSize: typography.size.base, fontWeight: '700', color: colors.textPrimary },

  editGoalText: { fontSize: typography.size.sm, color: colors.primary, fontWeight: '600' },
  weekRow: { flexDirection: 'row', justifyContent: 'space-between' },
  dayCol: { alignItems: 'center', gap: spacing.xs },
  dayLabel: { fontSize: typography.size.xs, color: colors.textMuted, fontWeight: '500' },
  dayLabelToday: { color: colors.primary, fontWeight: '700' },
  dayBubble: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.background.elevated,
    alignItems: 'center', justifyContent: 'center',
  },
  bubbleActive: { backgroundColor: colors.primary },
  bubbleRest: { backgroundColor: colors.textMuted },
  bubbleToday: { borderWidth: 2, borderColor: colors.primary },
  bubbleFuture: { opacity: 0.35 },
  bubbleRestText: { fontSize: typography.size.xs, fontWeight: '700', color: '#fff' },
  weekFooter: { fontSize: typography.size.xs, color: colors.textSecondary, textAlign: 'center' },
  restDayBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.sm, borderRadius: 12, paddingVertical: spacing.md,
    borderWidth: 1.5, borderColor: colors.primary,
  },
  restDayBtnDisabled: { borderColor: colors.border.default },
  restDayBtnText: { fontSize: typography.size.sm, fontWeight: '600', color: colors.primary },

  calNavBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  calLoadingRow: { alignItems: 'center', paddingVertical: spacing.xl },

  // Goal picker modal
  goalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  goalSubtitle: { fontSize: typography.size.sm, color: colors.textSecondary, marginBottom: spacing.xs },
  goalOption: {
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border.subtle,
  },
  goalOptionText: { fontSize: typography.size.base, color: colors.textPrimary, fontWeight: '500' },

  // Info modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center', justifyContent: 'center', padding: spacing.xl,
  },
  infoModal: {
    backgroundColor: colors.surface,
    borderRadius: 20, padding: spacing.xl, width: '100%', gap: spacing.md,
  },
  infoTitle: { fontSize: typography.size.lg, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.xs },
  infoRule: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  infoRuleText: { flex: 1, fontSize: typography.size.sm, color: colors.textSecondary, lineHeight: 20 },
  infoClose: {
    backgroundColor: colors.primary,
    borderRadius: 12, paddingVertical: spacing.md, alignItems: 'center', marginTop: spacing.sm,
  },
  infoCloseText: { fontSize: typography.size.base, fontWeight: '700', color: '#fff' },
});

const calStyles = StyleSheet.create({
  grid: { gap: 2 },
  headerRow: { flexDirection: 'row' },
  headerCell: {
    flex: 1, textAlign: 'center',
    fontSize: typography.size.xs, fontWeight: '600', color: colors.textMuted,
    paddingBottom: spacing.xs,
  },
  row: { flexDirection: 'row' },
  cell: {
    flex: 1, alignItems: 'center', paddingVertical: 4, gap: 2,
    borderRadius: 8,
  },
  cellToday: { backgroundColor: colors.background.elevated },
  dayNum: { fontSize: typography.size.sm, color: colors.textSecondary },
  dayNumActive: { color: colors.primary, fontWeight: '700' },
  dayNumRest: { color: colors.textMuted, fontWeight: '500' },
  dayNumToday: { fontWeight: '700', color: colors.textPrimary },
  dot: {
    width: 5, height: 5, borderRadius: 2.5,
    backgroundColor: colors.primary,
  },
  restMark: { fontSize: 8, lineHeight: 10 },
});
