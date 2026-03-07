import React, { useCallback, useEffect, useState } from 'react';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
  cancelAnimation,
} from 'react-native-reanimated';
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
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { fetchStreakInfo, updateWorkoutGoal } from '../../api/workouts';
import { StreakDetails, Achievement } from '../../types/workout';
import CheckinCalendarCard from '../../components/profile/CheckinCalendarCard';
import { useAuth } from '../../store/AuthContext';
import { colors, spacing, typography } from '../../theme';
import { RootStackParamList } from '../../navigation/types';
import { useTutorial, TUTORIAL_TOTAL_STEPS } from '../../store/TutorialContext';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'StreakDetails'>;
};

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function StreakDetailsScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { setCurrentStreak, user } = useAuth();
  const { isActive: tutorialActive, step: tutorialStep, next: tutorialNext, skip: tutorialSkip } = useTutorial();

  const [streakData, setStreakData] = useState<StreakDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [showGoalPicker, setShowGoalPicker] = useState(false);
  const [selectedAchievement, setSelectedAchievement] = useState<Achievement | null>(null);


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

  useEffect(() => { loadStreak(); }, [loadStreak]);

  const handleGoalChange = () => setShowGoalPicker(true);

  const handleGoalSelect = async (n: number) => {
    setShowGoalPicker(false);
    await updateWorkoutGoal(n).catch(() => {});
    loadStreak();
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
        {user?.username ? <CheckinCalendarCard username={user.username} /> : null}

        {/* Achievements */}
        {streak.achievements && streak.achievements.length > 0 && (() => {
          const earnedCount = streak.achievements.filter(a => a.earned).length;
          return (
            <View style={styles.card}>
              <View style={styles.rowBetween}>
                <Text style={styles.cardTitle}>Achievements</Text>
                <Text style={badgeStyles.countLabel}>
                  {earnedCount} / {streak.achievements.length}
                </Text>
              </View>
              <FlatList
                data={streak.achievements}
                horizontal
                showsHorizontalScrollIndicator={false}
                keyExtractor={(item) => item.id}
                contentContainerStyle={{ gap: 10, paddingVertical: 4 }}
                renderItem={({ item }) => (
                <AchievementBadge item={item} onPress={() => setSelectedAchievement(item)} />
              )}
              />
            </View>
          );
        })()}
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

      {/* Achievement detail modal */}
      <AchievementModal
        achievement={selectedAchievement}
        onClose={() => setSelectedAchievement(null)}
      />

      {/* Tutorial overlay — step 14 (index 13) */}
      {tutorialActive && tutorialStep === 13 && (
        <View style={tutStyles.overlay} pointerEvents="box-none">
          <View style={tutStyles.card}>
            <View style={tutStyles.topRow}>
              <Text style={tutStyles.stepLabel}>Step 14 of {TUTORIAL_TOTAL_STEPS}</Text>
              <Pressable onPress={tutorialSkip} hitSlop={8}>
                <Text style={tutStyles.skipText}>Skip tutorial</Text>
              </Pressable>
            </View>
            <Text style={tutStyles.title}>Your Streak 🔥</Text>
            <Text style={tutStyles.body}>
              Track your daily check-in streak and watch it grow. Hit milestones to earn badges and show off your consistency on your profile.
            </Text>
            <Pressable
              style={tutStyles.nextBtn}
              onPress={() => { navigation.goBack(); tutorialNext(); }}
            >
              <Text style={tutStyles.nextBtnText}>Next</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

const tutStyles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: spacing.lg,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 20,
    elevation: 12,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  stepLabel: {
    fontSize: typography.size.xs,
    color: colors.textMuted,
    fontFamily: typography.family.semibold,
  },
  skipText: {
    fontSize: typography.size.xs,
    color: colors.textMuted,
    fontFamily: typography.family.semibold,
    textDecorationLine: 'underline',
  },
  title: {
    fontSize: typography.size.md,
    fontFamily: typography.family.bold,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  body: {
    fontSize: typography.size.sm,
    fontFamily: typography.family.regular,
    color: colors.textSecondary,
    lineHeight: 19,
    marginBottom: spacing.lg,
  },
  nextBtn: {
    backgroundColor: colors.primary,
    borderRadius: 20,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  nextBtnText: {
    fontSize: typography.size.sm,
    fontFamily: typography.family.bold,
    color: '#fff',
  },
});


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

const RARITY_COLORS: Record<Achievement['rarity'], string> = {
  common: '#6B7280',
  rare: '#3B82F6',
  epic: '#8B5CF6',
  legendary: '#F59E0B',
};

const RARITY_LABELS: Record<Achievement['rarity'], string> = {
  common: 'COMMON',
  rare: 'RARE',
  epic: 'EPIC',
  legendary: 'LEGENDARY',
};

function AchievementBadge({ item, onPress }: { item: Achievement; onPress: () => void }) {
  const color = item.earned ? RARITY_COLORS[item.rarity] : colors.border.subtle;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => pressed && { opacity: 0.75 }}
    >
      <View style={[
        badgeStyles.badge,
        { borderColor: color },
        item.earned
          ? Platform.select({ ios: { shadowColor: color }, android: {} })
          : badgeStyles.badgeLocked,
      ]}>
        {!item.earned && (
          <View style={badgeStyles.lockCorner}>
            <Feather name="lock" size={9} color={colors.textMuted} />
          </View>
        )}
        <Text style={[badgeStyles.badgeEmoji, !item.earned && { opacity: 0.35 }]}>
          {item.emoji}
        </Text>
        <Text style={[badgeStyles.badgeName, !item.earned && badgeStyles.textMuted]} numberOfLines={2}>
          {item.name}
        </Text>
        <Text style={[badgeStyles.badgeDesc, !item.earned && badgeStyles.textMuted]} numberOfLines={2}>
          {item.desc}
        </Text>
        <View style={[badgeStyles.rarityPill, { backgroundColor: item.earned ? color : colors.background.elevated }]}>
          <Text style={[badgeStyles.rarityText, !item.earned && { color: colors.textMuted }]}>
            {item.earned ? RARITY_LABELS[item.rarity] : 'LOCKED'}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

// ─── Achievement modal ─────────────────────────────────────────────────────────

const MODAL_CARD_WIDTH = SCREEN_WIDTH * 0.88;
const PROGRESS_BAR_WIDTH = MODAL_CARD_WIDTH - 56; // 28px padding × 2

const RARITY_GRADIENTS: Record<Achievement['rarity'], [string, string]> = {
  common:    ['#4B5563', '#1F2937'],
  rare:      ['#2563EB', '#1E3A8A'],
  epic:      ['#7C3AED', '#3B0764'],
  legendary: ['#D97706', '#78350F'],
};

function AchievementModal({
  achievement,
  onClose,
}: {
  achievement: Achievement | null;
  onClose: () => void;
}) {
  const emojiY     = useSharedValue(0);
  const emojiScale = useSharedValue(0);
  const cardScale  = useSharedValue(0.82);
  const cardOpacity = useSharedValue(0);
  const progressW  = useSharedValue(0);

  useEffect(() => {
    if (achievement) {
      // Card entrance
      cardScale.value   = withSpring(1, { damping: 16, stiffness: 200 });
      cardOpacity.value = withTiming(1, { duration: 200 });
      // Emoji pop-in then bounce
      emojiScale.value = withDelay(120, withSpring(1, { damping: 5, stiffness: 100 }));
      emojiY.value = withDelay(450, withRepeat(
        withSequence(
          withTiming(-22, { duration: 520 }),
          withTiming(0,   { duration: 520 }),
        ),
        -1,
        true,
      ));
      // Progress bar fill
      const targetW = Math.min(achievement.user_pct, 100) * PROGRESS_BAR_WIDTH / 100;
      progressW.value = withDelay(650, withTiming(targetW, { duration: 900 }));
    } else {
      cancelAnimation(emojiY);
      cancelAnimation(emojiScale);
      cancelAnimation(progressW);
      emojiY.value     = 0;
      emojiScale.value = 0;
      cardScale.value  = 0.82;
      cardOpacity.value = 0;
      progressW.value  = 0;
    }
  }, [achievement?.id]);

  const cardStyle     = useAnimatedStyle(() => ({
    transform: [{ scale: cardScale.value }],
    opacity: cardOpacity.value,
  }));
  const emojiStyle    = useAnimatedStyle(() => ({
    transform: [{ translateY: emojiY.value }, { scale: emojiScale.value }],
  }));
  const progressStyle = useAnimatedStyle(() => ({ width: progressW.value }));

  if (!achievement) return null;

  const gradColors  = achievement.earned ? RARITY_GRADIENTS[achievement.rarity] : ['#374151', '#111827'] as [string, string];
  const rarityColor = achievement.earned ? RARITY_COLORS[achievement.rarity] : '#6B7280';
  const pctText     = achievement.user_pct < 1
    ? '< 1% of Spotters have this'
    : `${achievement.user_pct.toFixed(1)}% of Spotters have this`;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={achievModalStyles.overlay} onPress={onClose}>
        {/* Inner Pressable stops tap-through closing when tapping on the card */}
        <Pressable onPress={() => {}} style={achievModalStyles.cardWrapper}>
          <Animated.View style={[achievModalStyles.cardShadow, cardStyle]}>
            <LinearGradient
              colors={gradColors}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={achievModalStyles.gradient}
            >
              {/* Close */}
              <Pressable style={achievModalStyles.closeBtn} onPress={onClose} hitSlop={14}>
                <Feather name="x" size={22} color="rgba(255,255,255,0.65)" />
              </Pressable>

              {/* Bouncing emoji */}
              <Animated.View style={emojiStyle}>
                <Text style={achievModalStyles.bigEmoji}>{achievement.emoji}</Text>
              </Animated.View>

              {/* Name */}
              <Text style={achievModalStyles.achievName}>{achievement.name}</Text>

              {/* Rarity pill */}
              <View style={achievModalStyles.rarityPill}>
                <Text style={achievModalStyles.rarityPillText}>
                  {achievement.earned
                    ? `★  ${RARITY_LABELS[achievement.rarity]}`
                    : '🔒  LOCKED'}
                </Text>
              </View>

              {/* Description */}
              <Text style={achievModalStyles.achievDesc}>{achievement.desc}</Text>

              {/* Divider */}
              <View style={achievModalStyles.divider} />

              {/* Rarity meter */}
              <Text style={achievModalStyles.pctLabel}>{pctText}</Text>
              <View style={achievModalStyles.progressTrack}>
                <Animated.View
                  style={[
                    achievModalStyles.progressFill,
                    { backgroundColor: rarityColor },
                    progressStyle,
                  ]}
                />
              </View>

              {/* Earned / locked status */}
              <View style={achievModalStyles.statusRow}>
                {achievement.earned ? (
                  <>
                    <Feather name="check-circle" size={16} color="rgba(255,255,255,0.95)" />
                    <Text style={achievModalStyles.statusText}>You earned this!</Text>
                  </>
                ) : (
                  <>
                    <Feather name="lock" size={15} color="rgba(255,255,255,0.45)" />
                    <Text style={[achievModalStyles.statusText, { opacity: 0.5 }]}>Not yet earned</Text>
                  </>
                )}
              </View>
            </LinearGradient>
          </Animated.View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const achievModalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  cardWrapper: {
    width: MODAL_CARD_WIDTH,
    alignItems: 'center',
  },
  cardShadow: {
    width: MODAL_CARD_WIDTH,
    borderRadius: 28,
    overflow: 'hidden',
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 16 }, shadowOpacity: 0.45, shadowRadius: 28 },
      android: { elevation: 20 },
    }),
  },
  gradient: {
    padding: 28,
    alignItems: 'center',
    gap: 12,
  },
  closeBtn: {
    alignSelf: 'flex-end',
    marginBottom: 4,
  },
  bigEmoji: {
    fontSize: 76,
    lineHeight: 90,
  },
  achievName: {
    fontSize: 26,
    fontWeight: '800',
    color: '#fff',
    textAlign: 'center',
  },
  rarityPill: {
    paddingHorizontal: 18,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  rarityPillText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.8,
  },
  achievDesc: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.82)',
    textAlign: 'center',
    lineHeight: 22,
  },
  divider: {
    height: 1,
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.18)',
    marginVertical: 2,
  },
  pctLabel: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '600',
  },
  progressTrack: {
    width: PROGRESS_BAR_WIDTH,
    height: 7,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: 7,
    borderRadius: 4,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 4,
  },
  statusText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
    fontWeight: '600',
  },
});

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


const badgeStyles = StyleSheet.create({
  badge: {
    width: 112,
    borderRadius: 14,
    borderWidth: 1.5,
    backgroundColor: colors.surface,
    padding: 10,
    alignItems: 'center',
    gap: 5,
    ...Platform.select({
      ios: { shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.25, shadowRadius: 8 },
      android: { elevation: 4 },
    }),
  },
  badgeLocked: {
    backgroundColor: colors.background.elevated,
    ...Platform.select({ ios: { shadowOpacity: 0 }, android: { elevation: 0 } }),
  },
  lockCorner: {
    position: 'absolute',
    top: 7,
    right: 7,
    backgroundColor: colors.background.base,
    borderRadius: 6,
    padding: 2,
  },
  badgeEmoji: { fontSize: 30 },
  badgeName: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
    lineHeight: 15,
  },
  badgeDesc: {
    fontSize: 10,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 13,
  },
  textMuted: { color: colors.textMuted, fontWeight: '500' },
  rarityPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginTop: 2,
  },
  rarityText: {
    fontSize: 8,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.6,
  },
  countLabel: {
    fontSize: typography.size.sm,
    color: colors.textMuted,
    fontWeight: '500',
  },
});
