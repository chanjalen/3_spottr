import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  FlatList,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Platform,
  Modal,
  Dimensions,
  TouchableWithoutFeedback,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { fetchStreakInfo, updateWorkoutGoal, fetchCalendarPosts } from '../../api/workouts';
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
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const POPUP_WIDTH = SCREEN_WIDTH - 48;

export default function StreakDetailsScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { setCurrentStreak } = useAuth();

  const [streakData, setStreakData] = useState<StreakDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [showGoalPicker, setShowGoalPicker] = useState(false);

  // Calendar state
  const now = new Date();
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth() + 1); // 1-indexed
  const [workoutDayNums, setWorkoutDayNums] = useState<Set<number>>(new Set());
  const [restDayNums, setRestDayNums] = useState<Set<number>>(new Set());
  const [calPosts, setCalPosts] = useState<CalendarPost[]>([]);
  const [dayModalVisible, setDayModalVisible] = useState(false);
  const [currentModalDay, setCurrentModalDay] = useState(1);
  const dayListRef = useRef<FlatList>(null);

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
    try {
      const res = await fetchCalendarPosts(year, month);
      const workoutNums = new Set<number>();
      const restNums = new Set<number>();
      for (const p of res.posts) {
        const day = parseInt(p.date.split('-')[2], 10);
        if (p.type === 'rest') restNums.add(day);
        else workoutNums.add(day);
      }
      setWorkoutDayNums(workoutNums);
      setRestDayNums(restNums);
      setCalPosts(res.posts);
    } catch {
      setWorkoutDayNums(new Set());
      setRestDayNums(new Set());
      setCalPosts([]);
    }
  }, []);

  useEffect(() => { loadStreak(); }, [loadStreak]);
  useEffect(() => { loadCalendar(calYear, calMonth); }, [loadCalendar, calYear, calMonth]);

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

  // Must be before any early returns — Hook rules
  const sortedWorkoutDays = useMemo(
    () => Array.from(workoutDayNums).sort((a, b) => a - b),
    [workoutDayNums],
  );
  const calFirstDay = new Date(calYear, calMonth - 1, 1).getDay();
  const calDaysInMonth = new Date(calYear, calMonth, 0).getDate();

  const handleDayPress = (day: number) => {
    if (!workoutDayNums.has(day)) return;
    setCurrentModalDay(day);
    setDayModalVisible(true);
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

          <View style={styles.weekStats}>
            <View style={[styles.weekStatItem, goalHit && styles.weekStatItemGoalHit]}>
              <Text style={[styles.weekStatNum, goalHit && styles.weekStatNumGoalHit]}>
                {streak.weekly_workout_count}/{streak.weekly_workout_goal}
              </Text>
              <Text style={styles.weekStatLabel}>workouts</Text>
            </View>
            <View style={styles.weekStatDivider} />
            <View style={styles.weekStatItem}>
              <Text style={styles.weekStatNum}>
                {streak.rest_info.rest_days_used}/{streak.rest_info.rest_days_allowed}
              </Text>
              <Text style={styles.weekStatLabel}>rest days</Text>
            </View>
          </View>
        </View>

        {/* Calendar */}
        <View style={styles.card}>
          <View style={calStyles.calNav}>
            <Pressable style={calStyles.calNavBtn} onPress={prevMonth}>
              <Feather name="chevron-left" size={18} color={colors.textSecondary} />
            </Pressable>
            <Text style={styles.cardTitle}>{MONTH_NAMES[calMonth - 1]} {calYear}</Text>
            <Pressable
              style={[calStyles.calNavBtn, isNextDisabled() && { opacity: 0.3 }]}
              onPress={nextMonth}
              disabled={isNextDisabled()}
            >
              <Feather name="chevron-right" size={18} color={colors.textSecondary} />
            </Pressable>
          </View>

          <View style={calStyles.calWeekdays}>
            {WEEKDAYS.map((d, i) => (
              <Text key={i} style={calStyles.calWeekday}>{d}</Text>
            ))}
          </View>

          <View style={calStyles.calDays}>
            {Array.from({ length: calFirstDay }).map((_, i) => (
              <View key={`e-${i}`} style={calStyles.calDay} />
            ))}
            {Array.from({ length: calDaysInMonth }).map((_, i) => {
              const day = i + 1;
              const hasWorkout = workoutDayNums.has(day);
              const isRest = !hasWorkout && restDayNums.has(day);
              return (
                <Pressable
                  key={day}
                  style={calStyles.calDay}
                  onPress={() => handleDayPress(day)}
                  disabled={!hasWorkout}
                >
                  <View style={[
                    calStyles.calDayBubble,
                    hasWorkout && calStyles.calDayBubbleWorkout,
                    isRest && calStyles.calDayBubbleRest,
                  ]}>
                    <Text style={[
                      calStyles.calDayText,
                      hasWorkout && calStyles.calDayTextWorkout,
                      isRest && calStyles.calDayTextRest,
                    ]}>
                      {day}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
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

      {/* Day workout modal */}
      <Modal
        visible={dayModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setDayModalVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => setDayModalVisible(false)}>
          <View style={calStyles.calModalOverlay} />
        </TouchableWithoutFeedback>
        <View style={calStyles.calModalCenter} pointerEvents="box-none">
          <View style={calStyles.calModalPopup}>
            <View style={calStyles.calModalHeader}>
              <Pressable
                style={calStyles.calModalNavBtn}
                onPress={() => {
                  const idx = sortedWorkoutDays.indexOf(currentModalDay);
                  if (idx > 0) {
                    dayListRef.current?.scrollToIndex({ index: idx - 1, animated: true });
                    setCurrentModalDay(sortedWorkoutDays[idx - 1]);
                  }
                }}
                disabled={sortedWorkoutDays.indexOf(currentModalDay) === 0}
              >
                <Feather
                  name="chevron-left"
                  size={20}
                  color={sortedWorkoutDays.indexOf(currentModalDay) === 0 ? colors.textMuted : colors.textPrimary}
                />
              </Pressable>
              <View style={{ alignItems: 'center', flex: 1 }}>
                <Text style={calStyles.calModalDate}>{MONTH_NAMES[calMonth - 1]} {currentModalDay}</Text>
                <Text style={calStyles.calModalYear}>{calYear}</Text>
              </View>
              <Pressable
                style={calStyles.calModalNavBtn}
                onPress={() => {
                  const idx = sortedWorkoutDays.indexOf(currentModalDay);
                  if (idx < sortedWorkoutDays.length - 1) {
                    dayListRef.current?.scrollToIndex({ index: idx + 1, animated: true });
                    setCurrentModalDay(sortedWorkoutDays[idx + 1]);
                  }
                }}
                disabled={sortedWorkoutDays.indexOf(currentModalDay) === sortedWorkoutDays.length - 1}
              >
                <Feather
                  name="chevron-right"
                  size={20}
                  color={sortedWorkoutDays.indexOf(currentModalDay) === sortedWorkoutDays.length - 1 ? colors.textMuted : colors.textPrimary}
                />
              </Pressable>
              <Pressable style={calStyles.calModalNavBtn} onPress={() => setDayModalVisible(false)}>
                <Feather name="x" size={18} color={colors.textMuted} />
              </Pressable>
            </View>

            <FlatList
              ref={dayListRef}
              style={calStyles.calModalScroll}
              data={sortedWorkoutDays}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              keyExtractor={(day) => String(day)}
              initialScrollIndex={
                sortedWorkoutDays.indexOf(currentModalDay) >= 0
                  ? sortedWorkoutDays.indexOf(currentModalDay)
                  : 0
              }
              getItemLayout={(_, index) => ({
                length: POPUP_WIDTH,
                offset: POPUP_WIDTH * index,
                index,
              })}
              onMomentumScrollEnd={(e) => {
                const idx = Math.round(e.nativeEvent.contentOffset.x / POPUP_WIDTH);
                if (idx >= 0 && idx < sortedWorkoutDays.length) {
                  setCurrentModalDay(sortedWorkoutDays[idx]);
                }
              }}
              renderItem={({ item: day }) => {
                const dayPosts = calPosts.filter(
                  p => parseInt(p.date.split('-')[2], 10) === day
                );
                return (
                  <ScrollView
                    style={{ width: POPUP_WIDTH }}
                    contentContainerStyle={{ padding: spacing.md, paddingBottom: 20 }}
                    showsVerticalScrollIndicator={false}
                    nestedScrollEnabled
                  >
                    {dayPosts.map((item) => (
                      <View key={item.id} style={calStyles.calDayCard}>
                        {item.photo_url && (
                          <Image
                            source={{ uri: item.photo_url }}
                            style={calStyles.calDayCardImage}
                            contentFit="cover"
                          />
                        )}
                        <View style={calStyles.calDayCardBody}>
                          <Text style={calStyles.calPostType}>
                            {item.type === 'checkin' ? 'Check-In' : item.type === 'workout' ? 'Workout' : 'Post'}
                          </Text>
                          {!!item.description && (
                            <Text style={calStyles.calDayCardDesc}>{item.description}</Text>
                          )}
                          {item.workout_name && (
                            <Text style={calStyles.calDayCardMeta}>
                              {item.workout_name}
                              {item.workout_exercises ? ` · ${item.workout_exercises} exercises` : ''}
                              {item.workout_sets ? ` · ${item.workout_sets} sets` : ''}
                            </Text>
                          )}
                          {item.location_name ? (
                            <Text style={calStyles.calDayCardMeta}>📍 {item.location_name}</Text>
                          ) : null}
                        </View>
                      </View>
                    ))}
                  </ScrollView>
                );
              }}
            />
          </View>
        </View>
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
  weekStats: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: colors.background.elevated,
    borderRadius: 14,
    overflow: 'hidden',
  },
  weekStatItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
    gap: 4,
  },
  weekStatItemGoalHit: {
    backgroundColor: colors.primary + '18',
  },
  weekStatNum: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.textPrimary,
    lineHeight: 32,
  },
  weekStatNumGoalHit: {
    color: colors.primary,
  },
  weekStatLabel: {
    fontSize: typography.size.xs,
    fontWeight: '600',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  weekStatDivider: {
    width: 1,
    backgroundColor: colors.border.subtle,
    marginVertical: spacing.md,
  },

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
  // Grid
  calNav: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: spacing.md,
  },
  calNavBtn: {
    width: 36, height: 36, backgroundColor: colors.background.elevated,
    borderRadius: 8, borderWidth: 1, borderColor: colors.border.subtle,
    alignItems: 'center', justifyContent: 'center',
  },
  calWeekdays: { flexDirection: 'row', marginBottom: spacing.sm },
  calWeekday: {
    flex: 1, textAlign: 'center',
    fontSize: 12, fontWeight: '500', color: colors.textMuted, paddingVertical: 4,
  },
  calDays: { flexDirection: 'row', flexWrap: 'wrap' },
  calDay: {
    width: `${100 / 7}%` as any,
    aspectRatio: 1,
    padding: 2,
    alignItems: 'center', justifyContent: 'center',
  },
  calDayBubble: {
    flex: 1, width: '100%',
    alignItems: 'center', justifyContent: 'center',
    borderRadius: 999,
    backgroundColor: 'rgba(120,120,128,0.15)',
  },
  calDayBubbleWorkout: { backgroundColor: colors.primary },
  calDayBubbleRest: { backgroundColor: '#F59E0B' },
  calDayText: { fontSize: 14, fontWeight: '500', color: colors.textSecondary },
  calDayTextWorkout: { color: '#fff', fontWeight: '700' },
  calDayTextRest: { color: '#fff', fontWeight: '700' },

  // Modal
  calModalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  calModalCenter: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  calModalPopup: {
    width: '100%',
    height: Dimensions.get('window').height * 0.55,
    backgroundColor: colors.background.base,
    borderRadius: 20, overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 20 },
      android: { elevation: 12 },
    }),
  },
  calModalHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.sm, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border.subtle,
  },
  calModalNavBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  calModalDate: { fontSize: 17, fontWeight: '700', color: colors.textPrimary },
  calModalYear: { fontSize: 13, color: colors.textMuted, marginTop: 1 },
  calModalScroll: { flex: 1 },

  // Day cards inside modal
  calDayCard: {
    backgroundColor: colors.background.elevated, borderRadius: 12,
    borderWidth: 1, borderColor: colors.border.subtle, overflow: 'hidden',
    marginBottom: 10,
  },
  calDayCardImage: { width: '100%', height: 160 },
  calDayCardBody: { padding: spacing.md, gap: 4 },
  calDayCardDesc: { fontSize: 14, color: colors.textPrimary, lineHeight: 19 },
  calDayCardMeta: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  calPostType: {
    fontSize: 11, fontWeight: '600', color: colors.primary,
    marginBottom: 2, textTransform: 'uppercase', letterSpacing: 0.5,
  },
});
