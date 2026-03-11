import React, { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
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
  FlatList,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Platform,
  Modal,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Avatar from '../../components/common/Avatar';
import AppHeader from '../../components/navigation/AppHeader';
import CheckinCalendarCard from '../../components/profile/CheckinCalendarCard';
import { fetchLeaderboard, LeaderboardEntry, LeaderboardResponse } from '../../api/leaderboards';
import { fetchStreakInfo, updateWorkoutGoal } from '../../api/workouts';
import { StreakDetails, Achievement } from '../../types/workout';
import { useAuth } from '../../store/AuthContext';
import { colors, spacing, typography } from '../../theme';
import { RootStackParamList } from '../../navigation/types';

type ActiveView = 'streak' | 'leaderboard';
type LeaderboardMode = 'friends' | 'gym';
type RootNav = NativeStackNavigationProp<RootStackParamList>;

// ─── Leaderboard podium constants ────────────────────────────────────────────

// Visual order: [2nd, 1st, 3rd] — indices into top3 array [0,1,2]
const PODIUM_VISUAL_ORDER = [1, 0, 2];
const PODIUM_COLORS = ['#C9A84C', '#9CA3AF', '#CD7F32'];
const PODIUM_MEDALS = ['🥇', '🥈', '🥉'];
const PODIUM_BAR_HEIGHTS = [100, 60, 35];

// ─── Achievement constants ────────────────────────────────────────────────────

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

const RARITY_GRADIENTS: Record<Achievement['rarity'], [string, string]> = {
  common:    ['#4B5563', '#1F2937'],
  rare:      ['#2563EB', '#1E3A8A'],
  epic:      ['#7C3AED', '#3B0764'],
  legendary: ['#D97706', '#78350F'],
};

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const MODAL_CARD_WIDTH = SCREEN_WIDTH * 0.88;
const PROGRESS_BAR_WIDTH = MODAL_CARD_WIDTH - 56;

// ─── Main component ───────────────────────────────────────────────────────────

export default function RanksScreen() {
  const insets = useSafeAreaInsets();
  const { user, setCurrentStreak } = useAuth();
  const navigation = useNavigation<RootNav>();

  // View toggle
  const [activeView, setActiveView] = useState<ActiveView>('streak');

  // ── Streak state ────────────────────────────────────────────────────────────
  const [streakData, setStreakData] = useState<StreakDetails | null>(null);
  const [streakLoading, setStreakLoading] = useState(true);
  const [streakRefreshing, setStreakRefreshing] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [showGoalPicker, setShowGoalPicker] = useState(false);
  const [selectedAchievement, setSelectedAchievement] = useState<Achievement | null>(null);

  // ── Leaderboard state ───────────────────────────────────────────────────────
  const [leaderboardMode, setLeaderboardMode] = useState<LeaderboardMode>('friends');
  const [response, setResponse] = useState<LeaderboardResponse | null>(null);
  const [selectedGymId, setSelectedGymId] = useState<string | undefined>(undefined);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [leaderboardRefreshing, setLeaderboardRefreshing] = useState(false);
  const [modeDropdownOpen, setModeDropdownOpen] = useState(false);
  const [gymDropdownOpen, setGymDropdownOpen] = useState(false);

  // ── Data loaders ────────────────────────────────────────────────────────────

  const loadStreak = useCallback(async () => {
    try {
      const data = await fetchStreakInfo();
      setStreakData(data);
      setCurrentStreak(data.current_streak);
    } catch {
      // ignore
    } finally {
      setStreakLoading(false);
      setStreakRefreshing(false);
    }
  }, [setCurrentStreak]);

  const loadLeaderboard = useCallback(async (forceGymId?: string) => {
    setLeaderboardLoading(true);
    try {
      const gymId = forceGymId ?? selectedGymId;
      const data = await fetchLeaderboard(leaderboardMode, gymId);
      setResponse(data);
      if (data.gym_id && !selectedGymId) setSelectedGymId(data.gym_id);
    } catch {
      // ignore
    } finally {
      setLeaderboardLoading(false);
      setLeaderboardRefreshing(false);
    }
  }, [leaderboardMode, selectedGymId]);

  // Always reload streak when the tab comes into focus
  useFocusEffect(useCallback(() => { loadStreak(); }, []));

  // Load leaderboard when switching to that view or changing mode
  useEffect(() => {
    if (activeView === 'leaderboard') loadLeaderboard();
  }, [activeView, leaderboardMode]);

  const handleGoalSelect = async (n: number) => {
    setShowGoalPicker(false);
    await updateWorkoutGoal(n).catch(() => {});
    loadStreak();
  };

  const handleGymSelect = (gymId: string) => {
    setSelectedGymId(gymId);
    setGymDropdownOpen(false);
    loadLeaderboard(gymId);
  };

  const handleModeSelect = (mode: LeaderboardMode) => {
    setModeDropdownOpen(false);
    setLeaderboardMode(mode);
  };

  const goToProfile = (username: string) => {
    navigation.navigate('Profile', { username });
  };

  // ── Leaderboard render helpers ───────────────────────────────────────────────

  const leaderboard = response?.leaderboard ?? [];
  const myRank = response?.my_rank ?? null;
  const myUsername = user?.username;
  const top3 = leaderboard.slice(0, 3);
  const rest = leaderboard.slice(3);

  const renderPodium = () => {
    if (top3.length === 0) return null;
    return (
      <View style={styles.podiumSection}>
        <View style={styles.podium}>
          {PODIUM_VISUAL_ORDER.map((pos) => {
            const entry = top3[pos];
            if (!entry) return <View key={pos} style={styles.podiumSlot} />;
            const medalColor = PODIUM_COLORS[pos] ?? colors.primary;
            const barHeight = PODIUM_BAR_HEIGHTS[pos] ?? 35;
            const medal = PODIUM_MEDALS[pos] ?? '🏅';
            return (
              <Pressable
                key={entry.user.id}
                style={styles.podiumSlot}
                onPress={() => goToProfile(entry.user.username)}
              >
                <Text style={styles.podiumMedal}>{medal}</Text>
                <Avatar uri={entry.user.avatar_url} name={entry.user.display_name} size={54} />
                <Text style={styles.podiumName} numberOfLines={1}>{entry.user.display_name}</Text>
                <Text style={styles.podiumStreak}>{entry.user.current_streak} 🔥</Text>
                <Text style={styles.podiumWorkouts}>{entry.user.total_workouts} workouts</Text>
                <View style={[styles.podiumBar, { height: barHeight, backgroundColor: medalColor }]}>
                  <Text style={styles.podiumBarRank}>#{entry.rank}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>
    );
  };

  const renderLeaderboardRow = ({ item }: { item: LeaderboardEntry }) => {
    const isMe = item.user.username === myUsername;
    return (
      <Pressable style={[styles.rankRow, isMe && styles.rankRowMe]} onPress={() => goToProfile(item.user.username)}>
        <Text style={[styles.rankNum, isMe && { color: colors.primary }]}>#{item.rank}</Text>
        <Avatar uri={item.user.avatar_url} name={item.user.display_name} size={40} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.rankName, isMe && { color: colors.primary }]} numberOfLines={1}>
            {item.user.display_name}
          </Text>
          <Text style={styles.rankUsername}>@{item.user.username}</Text>
        </View>
        <View style={styles.rankStats}>
          <Text style={styles.rankStreak}>{item.user.current_streak} 🔥</Text>
          <Text style={styles.rankWorkouts}>{item.user.total_workouts} workouts</Text>
        </View>
      </Pressable>
    );
  };

  const renderMyRankCard = () => {
    if (!myRank || !user) return null;
    const myEntry = leaderboard.find(e => e.user.username === myUsername);
    return (
      <View style={styles.myRankCard}>
        <View style={styles.myRankHeader}>
          <Feather name="award" size={13} color={colors.primary} />
          <Text style={styles.myRankLabel}>Your Rank</Text>
        </View>
        <View style={styles.myRankRow}>
          <Text style={styles.myRankNum}>#{myRank}</Text>
          <Avatar uri={user.avatar_url ?? null} name={user.display_name} size={40} />
          <View style={{ flex: 1 }}>
            <Text style={styles.myRankName} numberOfLines={1}>{user.display_name}</Text>
            <Text style={styles.myRankWorkouts}>{myEntry?.user.total_workouts ?? 0} workouts</Text>
          </View>
          <Text style={styles.myRankStreak}>{myEntry?.user.current_streak ?? 0} 🔥</Text>
        </View>
      </View>
    );
  };

  // ── Mode dropdown (Friends | My Gym) ─────────────────────────────────────────

  const activeGymId = response?.gym_id ?? selectedGymId;
  const enrolledGyms = response?.enrolled_gyms ?? [];
  const activeGym = enrolledGyms.find(g => g.id === activeGymId);
  const hasMultipleGyms = enrolledGyms.length > 1;

  const renderModeSelector = () => {
    const label = leaderboardMode === 'friends' ? 'Friends' : 'My Gym';

    return (
      <View style={styles.modeSelectorRow}>
        <Pressable
          style={styles.modePill}
          onPress={() => setModeDropdownOpen(v => !v)}
        >
          <Text style={styles.modePillText}>{label}</Text>
          <Feather
            name={modeDropdownOpen ? 'chevron-up' : 'chevron-down'}
            size={14}
            color={colors.textPrimary}
          />
        </Pressable>
      </View>
    );
  };

  const renderGymSelector = () => {
    if (leaderboardMode !== 'gym' || !hasMultipleGyms) return null;
    return (
      <Pressable
        style={styles.gymDropdownBtn}
        onPress={() => setGymDropdownOpen(true)}
      >
        <Feather name="map-pin" size={14} color={colors.primary} />
        <Text style={styles.gymDropdownLabel} numberOfLines={1}>
          {activeGym?.name ?? 'Select gym'}
        </Text>
        <Feather name="chevron-down" size={16} color={colors.textMuted} />
      </Pressable>
    );
  };

  // ── Main content renders ─────────────────────────────────────────────────────

  const renderStreakContent = () => {
    if (streakLoading) {
      return (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      );
    }

    if (!streakData) return null;

    const streak = streakData;
    const isActive = streak.current_streak > 0;
    const goalHit = streak.weekly_workout_count >= streak.weekly_workout_goal;

    return (
      <ScrollView
        contentContainerStyle={styles.streakScroll}
        refreshControl={
          <RefreshControl
            refreshing={streakRefreshing}
            onRefresh={() => { setStreakRefreshing(true); loadStreak(); }}
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
            <Text style={styles.goalBannerText}>Weekly Goal Achieved!</Text>
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

          {/* Info button */}
          <Pressable style={styles.heroInfoBtn} onPress={() => setShowInfo(true)}>
            <Feather name="help-circle" size={18} color="rgba(255,255,255,0.75)" />
          </Pressable>
        </LinearGradient>

        {/* Stats */}
        <View style={styles.card}>
          <StreakStatRow label="Current Streak" value={`${streak.current_streak} days`} />
          <View style={styles.divider} />
          <StreakStatRow label="Longest Streak" value={`${streak.longest_streak} days`} />
        </View>

        {/* This Week */}
        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <Text style={styles.cardTitle}>This Week</Text>
            <Pressable onPress={() => setShowGoalPicker(true)}>
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
                <Text style={styles.achievCountLabel}>{earnedCount} / {streak.achievements.length}</Text>
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

        <View style={{ height: insets.bottom + 100 }} />
      </ScrollView>
    );
  };

  const renderLeaderboardContent = () => {
    const noGym = leaderboardMode === 'gym' && response !== null && !response.gym_id;

    if (leaderboardLoading) {
      return (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      );
    }

    if (noGym) {
      return (
        <>
          {renderModeSelector()}
          <View style={styles.center}>
            <Feather name="award" size={40} color={colors.textMuted} />
            <Pressable
              style={styles.enrollBtn}
              onPress={() => navigation.navigate('Gyms' as never)}
            >
              <Feather name="map-pin" size={15} color="#fff" />
              <Text style={styles.enrollBtnText}>Enroll in a gym to see gym rankings</Text>
            </Pressable>
          </View>
        </>
      );
    }

    if (leaderboard.length === 0 && response !== null) {
      return (
        <>
          {renderModeSelector()}
          <View style={styles.center}>
            <Feather name="award" size={40} color={colors.textMuted} />
            <Text style={styles.emptyText}>
              No rankings yet{'\n'}Follow people or enroll in a gym to get started
            </Text>
          </View>
        </>
      );
    }

    return (
      <FlatList
        data={rest}
        keyExtractor={(item) => item.user.id}
        renderItem={renderLeaderboardRow}
        ListHeaderComponent={
          <>
            {renderModeSelector()}
            {renderGymSelector()}
            {renderPodium()}
            {renderMyRankCard()}
          </>
        }
        ListFooterComponent={<View style={{ height: insets.bottom + 100 }} />}
        refreshControl={
          <RefreshControl
            refreshing={leaderboardRefreshing}
            onRefresh={() => { setLeaderboardRefreshing(true); loadLeaderboard(); }}
            tintColor={colors.primary}
          />
        }
        ItemSeparatorComponent={() => (
          <View style={{ height: 1, backgroundColor: colors.border.subtle, marginLeft: spacing.base + 40 + spacing.md }} />
        )}
      />
    );
  };

  // ── View toggle ──────────────────────────────────────────────────────────────

  const renderViewToggle = () => (
    <View style={styles.viewToggleRow}>
      <View style={styles.viewToggle}>
        <Pressable
          style={[styles.viewToggleBtn, activeView === 'streak' && styles.viewToggleBtnActive]}
          onPress={() => setActiveView('streak')}
        >
          <Text style={[styles.viewToggleBtnText, activeView === 'streak' && styles.viewToggleBtnTextActive]}>
            🔥 Streak
          </Text>
        </Pressable>
        <Pressable
          style={[styles.viewToggleBtn, activeView === 'leaderboard' && styles.viewToggleBtnActive]}
          onPress={() => setActiveView('leaderboard')}
        >
          <Text style={[styles.viewToggleBtnText, activeView === 'leaderboard' && styles.viewToggleBtnTextActive]}>
            🏆 Leaderboard
          </Text>
        </Pressable>
      </View>
    </View>
  );

  // ── Root render ──────────────────────────────────────────────────────────────

  return (
    <View style={{ flex: 1, backgroundColor: colors.background.base }}>
      <LinearGradient
        colors={['#4FC3E0', '#6DCFE8', '#A8E2F4', '#D6F2FB', '#FFFFFF']}
        locations={[0, 0.2, 0.5, 0.75, 1]}
      >
        <AppHeader />
        {renderViewToggle()}
      </LinearGradient>

      {activeView === 'streak' ? renderStreakContent() : renderLeaderboardContent()}

      {/* Mode inline dropdown (Friends | My Gym) — transparent modal so it floats above the FlatList */}
      <Modal
        visible={modeDropdownOpen}
        transparent
        animationType="none"
        onRequestClose={() => setModeDropdownOpen(false)}
      >
        {/* Invisible backdrop — tap anywhere outside to dismiss */}
        <Pressable
          style={StyleSheet.absoluteFillObject}
          onPress={() => setModeDropdownOpen(false)}
        />
        {/* Small card anchored just below the pill */}
        <View style={styles.modeInlineCard} pointerEvents="box-none">
          {(['friends', 'gym'] as LeaderboardMode[]).map((mode, i, arr) => {
            const isSelected = leaderboardMode === mode;
            const label = mode === 'friends' ? 'Friends' : 'My Gym';
            return (
              <Pressable
                key={mode}
                style={[styles.modeInlineItem, i < arr.length - 1 && styles.modeInlineItemBorder]}
                onPress={() => handleModeSelect(mode)}
              >
                <Text style={[styles.modeInlineText, isSelected && styles.modeInlineTextActive]}>
                  {label}
                </Text>
                {isSelected && <Feather name="check" size={14} color={colors.primary} />}
              </Pressable>
            );
          })}
        </View>
      </Modal>

      {/* Gym picker modal */}
      <Modal
        visible={gymDropdownOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setGymDropdownOpen(false)}
      >
        <Pressable style={styles.dropdownOverlay} onPress={() => setGymDropdownOpen(false)}>
          <View style={styles.dropdownMenu}>
            <Text style={styles.dropdownTitle}>Select Gym</Text>
            {enrolledGyms.map((g, i) => {
              const isSelected = g.id === activeGymId;
              return (
                <Pressable
                  key={g.id}
                  style={[styles.dropdownItem, i < enrolledGyms.length - 1 && styles.dropdownItemBorder]}
                  onPress={() => handleGymSelect(g.id)}
                >
                  <Text style={[styles.dropdownItemText, isSelected && styles.dropdownItemTextActive]}>
                    {g.name}
                  </Text>
                  {isSelected && <Feather name="check" size={16} color={colors.primary} />}
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Modal>

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
      {streakData && (
        <Modal visible={showInfo} transparent animationType="fade" onRequestClose={() => setShowInfo(false)}>
          <Pressable style={styles.modalOverlay} onPress={() => setShowInfo(false)}>
            <View style={styles.infoModal}>
              <Text style={styles.infoTitle}>How Streaks Work</Text>
              <InfoRule icon="zap" text="Log a workout or check-in every day to keep your streak alive." />
              <InfoRule icon="moon" text="Use rest days to protect your streak on recovery days." />
              <InfoRule icon="clock" text="Activities before 3 AM count for the previous day." />
              <InfoRule
                icon="target"
                text={`Your budget: ${streakData.rest_info.rest_days_allowed} rest day${streakData.rest_info.rest_days_allowed !== 1 ? 's' : ''} per week (7 − weekly goal).`}
              />
              <Pressable style={styles.infoClose} onPress={() => setShowInfo(false)}>
                <Text style={styles.infoCloseText}>Got it</Text>
              </Pressable>
            </View>
          </Pressable>
        </Modal>
      )}

      {/* Achievement detail modal */}
      <AchievementModal
        achievement={selectedAchievement}
        onClose={() => setSelectedAchievement(null)}
      />
    </View>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StreakStatRow({ label, value }: { label: string; value: string }) {
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

function AchievementBadge({ item, onPress }: { item: Achievement; onPress: () => void }) {
  const color = item.earned ? RARITY_COLORS[item.rarity] : colors.border.subtle;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && { opacity: 0.75 }}>
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

function AchievementModal({
  achievement,
  onClose,
}: {
  achievement: Achievement | null;
  onClose: () => void;
}) {
  const emojiY      = useSharedValue(0);
  const emojiScale  = useSharedValue(0);
  const cardScale   = useSharedValue(0.82);
  const cardOpacity = useSharedValue(0);
  const progressW   = useSharedValue(0);

  useEffect(() => {
    if (achievement) {
      cardScale.value   = withSpring(1, { damping: 16, stiffness: 200 });
      cardOpacity.value = withTiming(1, { duration: 200 });
      emojiScale.value  = withDelay(120, withSpring(1, { damping: 5, stiffness: 100 }));
      emojiY.value = withDelay(450, withRepeat(
        withSequence(
          withTiming(-22, { duration: 520 }),
          withTiming(0,   { duration: 520 }),
        ),
        -1,
        true,
      ));
      const targetW = Math.min(achievement.user_pct, 100) * PROGRESS_BAR_WIDTH / 100;
      progressW.value = withDelay(650, withTiming(targetW, { duration: 900 }));
    } else {
      cancelAnimation(emojiY);
      cancelAnimation(emojiScale);
      cancelAnimation(progressW);
      emojiY.value      = 0;
      emojiScale.value  = 0;
      cardScale.value   = 0.82;
      cardOpacity.value = 0;
      progressW.value   = 0;
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
      <Pressable style={achievStyles.overlay} onPress={onClose}>
        <Pressable onPress={() => {}} style={achievStyles.cardWrapper}>
          <Animated.View style={[achievStyles.cardShadow, cardStyle]}>
            <LinearGradient
              colors={gradColors}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={achievStyles.gradient}
            >
              <Pressable style={achievStyles.closeBtn} onPress={onClose} hitSlop={14}>
                <Feather name="x" size={22} color="rgba(255,255,255,0.65)" />
              </Pressable>

              <Animated.View style={emojiStyle}>
                <Text style={achievStyles.bigEmoji}>{achievement.emoji}</Text>
              </Animated.View>

              <Text style={achievStyles.achievName}>{achievement.name}</Text>

              <View style={achievStyles.rarityPill}>
                <Text style={achievStyles.rarityPillText}>
                  {achievement.earned ? `★  ${RARITY_LABELS[achievement.rarity]}` : '🔒  LOCKED'}
                </Text>
              </View>

              <Text style={achievStyles.achievDesc}>{achievement.desc}</Text>
              <View style={achievStyles.divider} />

              <Text style={achievStyles.pctLabel}>{pctText}</Text>
              <View style={achievStyles.progressTrack}>
                <Animated.View
                  style={[achievStyles.progressFill, { backgroundColor: rarityColor }, progressStyle]}
                />
              </View>

              <View style={achievStyles.statusRow}>
                {achievement.earned ? (
                  <>
                    <Feather name="check-circle" size={16} color="rgba(255,255,255,0.95)" />
                    <Text style={achievStyles.statusText}>You earned this!</Text>
                  </>
                ) : (
                  <>
                    <Feather name="lock" size={15} color="rgba(255,255,255,0.45)" />
                    <Text style={[achievStyles.statusText, { opacity: 0.5 }]}>Not yet earned</Text>
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

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // View toggle (Streak | Leaderboard)
  viewToggleRow: {
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
  viewToggle: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.1)',
    borderRadius: 24,
    padding: 3,
  },
  viewToggleBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: 21,
  },
  viewToggleBtnActive: {
    backgroundColor: '#fff',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.12, shadowRadius: 4 },
      android: { elevation: 2 },
    }),
  },
  viewToggleBtnText: {
    fontSize: typography.size.sm,
    fontWeight: '600',
    color: 'rgba(0,0,0,0.45)',
  },
  viewToggleBtnTextActive: {
    color: colors.textPrimary,
    fontWeight: '700',
  },

  // Mode selector (centered pill)
  modeSelectorRow: {
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
  },
  modePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surface,
    borderRadius: 20,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4 },
      android: { elevation: 2 },
    }),
  },
  modePillText: {
    fontSize: typography.size.base,
    fontWeight: '700',
    color: colors.textPrimary,
  },

  // Gym dropdown (secondary, only shown for My Gym with multiple gyms)
  gymDropdownBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  gymDropdownLabel: {
    flex: 1,
    fontSize: typography.size.sm,
    fontWeight: '600',
    color: colors.textPrimary,
    marginLeft: 2,
  },

  // Inline mode dropdown card (anchored below the pill)
  modeInlineCard: {
    position: 'absolute',
    alignSelf: 'center',
    top: 172,           // approx: header + toggle row + pill row
    minWidth: 150,
    backgroundColor: colors.surface,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border.subtle,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.14, shadowRadius: 10 },
      android: { elevation: 7 },
    }),
  },
  modeInlineItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
  },
  modeInlineItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  modeInlineText: {
    fontSize: typography.size.sm,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  modeInlineTextActive: {
    color: colors.primary,
    fontWeight: '700',
  },

  // Gym picker dropdown (still uses a full-overlay modal)
  dropdownOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-start',
    alignItems: 'stretch',
  },
  dropdownMenu: {
    marginHorizontal: spacing.base,
    marginTop: 160,
    backgroundColor: colors.surface,
    borderRadius: 14,
    overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12 },
      android: { elevation: 8 },
    }),
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
  dropdownItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  dropdownItemText: {
    fontSize: typography.size.base,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  dropdownItemTextActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  dropdownTitle: {
    fontSize: typography.size.xs,
    fontWeight: '600',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: spacing.base,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },

  // Common
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  emptyText: {
    fontSize: typography.size.base,
    color: colors.textMuted,
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
    lineHeight: 22,
  },
  enrollBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: 24,
  },
  enrollBtnText: {
    fontSize: typography.size.base,
    fontWeight: '600',
    color: '#fff',
  },

  // ── Streak styles ────────────────────────────────────────────────────────────
  streakScroll: {
    padding: spacing.base,
    gap: spacing.md,
  },
  heroCard: {
    borderRadius: 20,
    padding: spacing['2xl'],
    alignItems: 'center',
    gap: spacing.sm,
  },
  heroInfoBtn: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    padding: 4,
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
  weekStatItem: { flex: 1, alignItems: 'center', paddingVertical: spacing.md, gap: 4 },
  weekStatItemGoalHit: { backgroundColor: colors.primary + '18' },
  weekStatNum: { fontSize: 28, fontWeight: '800', color: colors.textPrimary, lineHeight: 32 },
  weekStatNumGoalHit: { color: colors.primary },
  weekStatLabel: {
    fontSize: typography.size.xs,
    fontWeight: '600',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  weekStatDivider: { width: 1, backgroundColor: colors.border.subtle, marginVertical: spacing.md },

  achievCountLabel: { fontSize: typography.size.sm, color: colors.textMuted, fontWeight: '500' },

  // Goal picker modal
  goalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  goalSubtitle: { fontSize: typography.size.sm, color: colors.textSecondary, marginBottom: spacing.xs },
  goalOption: { paddingVertical: spacing.md, borderTopWidth: 1, borderTopColor: colors.border.subtle },
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

  // ── Leaderboard styles ───────────────────────────────────────────────────────
  podiumSection: {
    backgroundColor: colors.background.elevated,
    paddingBottom: 0,
    marginBottom: spacing.sm,
  },
  podium: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingTop: spacing.xl,
    paddingHorizontal: spacing.sm,
  },
  podiumSlot: { flex: 1, alignItems: 'center', gap: 3, maxWidth: 120 },
  podiumMedal: { fontSize: 24 },
  podiumName: {
    fontSize: typography.size.xs, fontWeight: '600',
    color: colors.textPrimary, textAlign: 'center', marginTop: 2,
  },
  podiumStreak: { fontSize: typography.size.sm, fontWeight: '700', color: colors.textPrimary },
  podiumWorkouts: { fontSize: 10, fontWeight: '500', color: colors.textMuted, marginBottom: spacing.xs },
  podiumBar: {
    width: '100%', borderTopLeftRadius: 6, borderTopRightRadius: 6,
    alignItems: 'center', justifyContent: 'center', marginTop: spacing.xs,
  },
  podiumBarRank: { fontSize: typography.size.base, fontWeight: '800', color: '#fff' },

  rankRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingVertical: spacing.sm + 2, paddingHorizontal: spacing.base,
  },
  rankRowMe: { backgroundColor: colors.primary + '0D' },
  rankNum: { width: 36, fontSize: typography.size.sm, fontWeight: '700', color: colors.textMuted },
  rankName: { fontSize: typography.size.base, fontWeight: '500', color: colors.textPrimary },
  rankUsername: { fontSize: typography.size.xs, color: colors.textMuted },
  rankStats: { alignItems: 'flex-end', gap: 2 },
  rankStreak: { fontSize: typography.size.base, fontWeight: '700', color: colors.textPrimary },
  rankWorkouts: { fontSize: 11, fontWeight: '500', color: colors.textMuted },

  myRankCard: {
    margin: spacing.base,
    backgroundColor: colors.surface,
    borderRadius: 14, padding: spacing.md,
    borderWidth: 1.5, borderColor: colors.primary, gap: spacing.sm,
    ...Platform.select({
      ios: { shadowColor: colors.primary, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 6 },
      android: { elevation: 2 },
    }),
  },
  myRankHeader: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  myRankLabel: { fontSize: typography.size.xs, fontWeight: '600', color: colors.primary, textTransform: 'uppercase', letterSpacing: 0.5 },
  myRankRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  myRankNum: { fontSize: typography.size.lg, fontWeight: '800', color: colors.primary, minWidth: 40 },
  myRankName: { fontSize: typography.size.base, fontWeight: '600', color: colors.textPrimary },
  myRankWorkouts: { fontSize: typography.size.xs, color: colors.textMuted, fontWeight: '500' },
  myRankStreak: { fontSize: typography.size.base, fontWeight: '700', color: colors.textPrimary },
});

// ─── Badge styles ─────────────────────────────────────────────────────────────

const badgeStyles = StyleSheet.create({
  badge: {
    width: 112, borderRadius: 14, borderWidth: 1.5,
    backgroundColor: colors.surface, padding: 10,
    alignItems: 'center', gap: 5,
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
    position: 'absolute', top: 7, right: 7,
    backgroundColor: colors.background.base, borderRadius: 6, padding: 2,
  },
  badgeEmoji: { fontSize: 30 },
  badgeName: { fontSize: 11, fontWeight: '700', color: colors.textPrimary, textAlign: 'center', lineHeight: 15 },
  badgeDesc: { fontSize: 10, color: colors.textMuted, textAlign: 'center', lineHeight: 13 },
  textMuted: { color: colors.textMuted, fontWeight: '500' },
  rarityPill: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, marginTop: 2 },
  rarityText: { fontSize: 8, fontWeight: '800', color: '#fff', letterSpacing: 0.6 },
});

// ─── Achievement modal styles ─────────────────────────────────────────────────

const achievStyles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  cardWrapper: { width: MODAL_CARD_WIDTH, alignItems: 'center' },
  cardShadow: {
    width: MODAL_CARD_WIDTH, borderRadius: 28, overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 16 }, shadowOpacity: 0.45, shadowRadius: 28 },
      android: { elevation: 20 },
    }),
  },
  gradient: { padding: 28, alignItems: 'center', gap: 12 },
  closeBtn: { alignSelf: 'flex-end', marginBottom: 4 },
  bigEmoji: { fontSize: 76, lineHeight: 90 },
  achievName: { fontSize: 26, fontWeight: '800', color: '#fff', textAlign: 'center' },
  rarityPill: { paddingHorizontal: 18, paddingVertical: 6, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.18)' },
  rarityPillText: { fontSize: 13, fontWeight: '700', color: '#fff', letterSpacing: 0.8 },
  achievDesc: { fontSize: 15, color: 'rgba(255,255,255,0.82)', textAlign: 'center', lineHeight: 22 },
  divider: { height: 1, width: '100%', backgroundColor: 'rgba(255,255,255,0.18)', marginVertical: 2 },
  pctLabel: { fontSize: 13, color: 'rgba(255,255,255,0.7)', fontWeight: '600' },
  progressTrack: {
    width: PROGRESS_BAR_WIDTH, height: 7,
    backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 4, overflow: 'hidden',
  },
  progressFill: { height: 7, borderRadius: 4 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 4 },
  statusText: { fontSize: 14, color: 'rgba(255,255,255,0.9)', fontWeight: '600' },
});
