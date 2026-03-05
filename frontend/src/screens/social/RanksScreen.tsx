import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Platform,
  Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Avatar from '../../components/common/Avatar';
import AppHeader from '../../components/navigation/AppHeader';
import { fetchLeaderboard, LeaderboardEntry, LeaderboardResponse } from '../../api/leaderboards';
import { useAuth } from '../../store/AuthContext';
import { colors, spacing, typography } from '../../theme';
import { RootStackParamList } from '../../navigation/types';

type RanksTab = 'Friends' | 'My Gym';
type RootNav = NativeStackNavigationProp<RootStackParamList>;

// Podium: visual order is [2nd, 1st, 3rd] — indices into top3 array [0,1,2]
const PODIUM_VISUAL_ORDER = [1, 0, 2];
// All indexed by rank-1 (pos): 0=gold, 1=silver, 2=bronze
const PODIUM_COLORS = ['#C9A84C', '#9CA3AF', '#CD7F32'];
const PODIUM_MEDALS = ['🥇', '🥈', '🥉'];
// Large height differences so the steps are visually clear
const PODIUM_BAR_HEIGHTS = [100, 60, 35];

export default function RanksScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const navigation = useNavigation<RootNav>();

  const [activeTab, setActiveTab] = useState<RanksTab>('Friends');
  const [response, setResponse] = useState<LeaderboardResponse | null>(null);
  const [selectedGymId, setSelectedGymId] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [gymDropdownOpen, setGymDropdownOpen] = useState(false);

  const load = useCallback(async (forceGymId?: string) => {
    setLoading(true);
    try {
      const tab = activeTab === 'Friends' ? 'friends' : 'gym';
      const gymId = forceGymId ?? selectedGymId;
      const data = await fetchLeaderboard(tab, gymId);
      setResponse(data);
      if (data.gym_id && !selectedGymId) setSelectedGymId(data.gym_id);
    } catch {
      // ignore
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeTab, selectedGymId]);

  useEffect(() => { load(); }, [load]);

  const handleGymSelect = (gymId: string) => {
    setSelectedGymId(gymId);
    load(gymId);
  };

  const goToProfile = (username: string) => {
    navigation.navigate('Profile', { username });
  };

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
                {/* Same structure for all 3 — bar height alone determines visual level */}
                <Text style={styles.podiumMedal}>{medal}</Text>
                <Avatar uri={entry.user.avatar_url} name={entry.user.display_name} size={54} />
                <Text style={styles.podiumName} numberOfLines={1}>{entry.user.display_name}</Text>
                <Text style={styles.podiumStreak}>{entry.user.current_streak} 🔥</Text>
                <Text style={styles.podiumWorkouts}>{entry.user.total_workouts} workouts</Text>

                {/* Platform step — height difference creates the podium levels */}
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

  const renderRow = ({ item }: { item: LeaderboardEntry }) => {
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

  const renderGymSelector = () => {
    const gyms = response?.enrolled_gyms ?? [];
    if (activeTab !== 'My Gym') return null;
    const activeGymId = response?.gym_id ?? selectedGymId;
    const activeGym = gyms.find(g => g.id === activeGymId);
    const hasMultiple = gyms.length > 1;
    return (
      <>
        <Pressable
          style={styles.gymDropdownBtn}
          onPress={() => hasMultiple && setGymDropdownOpen(true)}
        >
          <Feather name="map-pin" size={14} color={colors.primary} />
          <Text style={styles.gymDropdownLabel} numberOfLines={1}>
            {activeGym?.name ?? 'No gym enrolled'}
          </Text>
          {hasMultiple && <Feather name="chevron-down" size={16} color={colors.textMuted} />}
        </Pressable>

        <Modal
          visible={gymDropdownOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setGymDropdownOpen(false)}
        >
          <Pressable style={styles.dropdownOverlay} onPress={() => setGymDropdownOpen(false)}>
            <View style={styles.dropdownMenu}>
              <Text style={styles.dropdownTitle}>Select Gym</Text>
              {gyms.map((g, i) => {
                const isSelected = g.id === activeGymId;
                return (
                  <Pressable
                    key={g.id}
                    style={[
                      styles.dropdownItem,
                      i < gyms.length - 1 && styles.dropdownItemBorder,
                    ]}
                    onPress={() => {
                      setGymDropdownOpen(false);
                      handleGymSelect(g.id);
                    }}
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
      </>
    );
  };

  const isGymTab = activeTab === 'My Gym';
  const noGym = isGymTab && response !== null && !response.gym_id;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background.base }}>
      {/* Gradient header — matches Gyms screen */}
      <LinearGradient
        colors={['#4FC3E0', '#6DCFE8', '#A8E2F4', '#D6F2FB', '#FFFFFF']}
        locations={[0, 0.2, 0.5, 0.75, 1]}
      >
        <AppHeader />

        {/* Tab row */}
        <View style={styles.tabRow}>
          {(['Friends', 'My Gym'] as RanksTab[]).map((tab) => (
            <Pressable key={tab} style={styles.tab} onPress={() => setActiveTab(tab)}>
              <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>{tab}</Text>
              {activeTab === tab && <View style={styles.tabIndicator} />}
            </Pressable>
          ))}
        </View>
      </LinearGradient>

      {renderGymSelector()}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : noGym ? (
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
      ) : leaderboard.length === 0 ? (
        <View style={styles.center}>
          <Feather name="award" size={40} color={colors.textMuted} />
          <Text style={styles.emptyText}>No rankings yet{'\n'}Follow people or enroll in a gym to get started</Text>
        </View>
      ) : (
        <FlatList
          data={rest}
          keyExtractor={(item) => item.user.id}
          renderItem={renderRow}
          ListHeaderComponent={
            <>
              {renderPodium()}
              {renderMyRankCard()}
            </>
          }
          ListFooterComponent={<View style={{ height: insets.bottom + 100 }} />}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); load(); }}
              tintColor={colors.primary}
            />
          }
          ItemSeparatorComponent={() => (
            <View style={{ height: 1, backgroundColor: colors.border.subtle, marginLeft: spacing.base + 40 + spacing.md }} />
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tabRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.4)',
  },
  tab: { flex: 1, alignItems: 'center', paddingVertical: spacing.md },
  tabText: { fontSize: typography.size.sm, fontWeight: '500', color: 'rgba(0,0,0,0.45)' },
  tabTextActive: { fontWeight: '700', color: colors.textPrimary },
  tabIndicator: {
    position: 'absolute', bottom: 0, left: '25%', right: '25%',
    height: 2, borderRadius: 1, backgroundColor: colors.primary,
  },

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

  dropdownOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-start',
    alignItems: 'stretch',
  },
  dropdownMenu: {
    marginHorizontal: spacing.base,
    marginTop: 120,
    backgroundColor: colors.surface,
    borderRadius: 14,
    overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12 },
      android: { elevation: 8 },
    }),
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

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  emptyText: {
    fontSize: typography.size.base, color: colors.textMuted,
    textAlign: 'center', paddingHorizontal: spacing.xl, lineHeight: 22,
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

  // Podium
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
  podiumSlot: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
    maxWidth: 120,
  },
  podiumMedal: {
    fontSize: 24,
  },
  podiumName: {
    fontSize: typography.size.xs,
    fontWeight: '600',
    color: colors.textPrimary,
    textAlign: 'center',
    marginTop: 2,
  },
  podiumStreak: {
    fontSize: typography.size.sm,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  podiumWorkouts: {
    fontSize: 10,
    fontWeight: '500',
    color: colors.textMuted,
    marginBottom: spacing.xs,
  },
  podiumBar: {
    width: '100%',
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xs,
  },
  podiumBarRank: {
    fontSize: typography.size.base,
    fontWeight: '800',
    color: '#fff',
  },

  // Ranked rows
  rankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.base,
  },
  rankRowMe: { backgroundColor: colors.primary + '0D' },
  rankNum: { width: 36, fontSize: typography.size.sm, fontWeight: '700', color: colors.textMuted },
  rankName: { fontSize: typography.size.base, fontWeight: '500', color: colors.textPrimary },
  rankUsername: { fontSize: typography.size.xs, color: colors.textMuted },
  rankStats: { alignItems: 'flex-end', gap: 2 },
  rankStreak: { fontSize: typography.size.base, fontWeight: '700', color: colors.textPrimary },
  rankWorkouts: { fontSize: 11, fontWeight: '500', color: colors.textMuted },

  // My rank card
  myRankCard: {
    margin: spacing.base,
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: spacing.md,
    borderWidth: 1.5,
    borderColor: colors.primary,
    gap: spacing.sm,
    ...Platform.select({
      ios: { shadowColor: colors.primary, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 6 },
      android: { elevation: 2 },
    }),
  },
  myRankHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  myRankLabel: { fontSize: typography.size.xs, fontWeight: '600', color: colors.primary, textTransform: 'uppercase', letterSpacing: 0.5 },
  myRankRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  myRankNum: { fontSize: typography.size.lg, fontWeight: '800', color: colors.primary, minWidth: 40 },
  myRankName: { fontSize: typography.size.base, fontWeight: '600', color: colors.textPrimary },
  myRankWorkouts: { fontSize: typography.size.xs, color: colors.textMuted, fontWeight: '500' },
  myRankStreak: { fontSize: typography.size.base, fontWeight: '700', color: colors.textPrimary },
});