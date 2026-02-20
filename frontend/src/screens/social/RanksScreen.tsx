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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import Avatar from '../../components/common/Avatar';
import { fetchGymLeaderboard, fetchMyGyms } from '../../api/gyms';
import { LeaderboardEntry, Gym } from '../../types/gym';
import { colors, spacing, typography } from '../../theme';
import AppHeader from '../../components/navigation/AppHeader';

type RanksTab = 'Friends' | 'My Gym';

const PODIUM_COLORS = ['#C9A84C', '#9CA3AF', '#CD7F32'];
const PODIUM_ORDER = [1, 0, 2]; // 2nd, 1st, 3rd visual order

export default function RanksScreen() {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<RanksTab>('Friends');
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [myGym, setMyGym] = useState<Gym | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (activeTab === 'My Gym') {
        const gyms = await fetchMyGyms().catch(() => []);
        const firstGym = gyms[0] ?? null;
        setMyGym(firstGym);
        if (firstGym) {
          const lb = await fetchGymLeaderboard(firstGym.id).catch(() => []);
          setLeaderboard(lb);
        } else {
          setLeaderboard([]);
        }
      } else {
        // Friends leaderboard — placeholder, would use a dedicated endpoint
        setLeaderboard([]);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeTab]);

  useEffect(() => { load(); }, [load]);

  const top3 = leaderboard.slice(0, 3);
  const rest = leaderboard.slice(3);

  const renderPodium = () => {
    if (top3.length === 0) return null;
    return (
      <View style={styles.podium}>
        {PODIUM_ORDER.map((pos) => {
          const entry = top3[pos];
          if (!entry) return <View key={pos} style={{ flex: 1 }} />;
          const isPrimary = pos === 0;
          return (
            <View key={entry.user?.id ?? pos} style={[styles.podiumItem, isPrimary && styles.podiumItemFirst]}>
              <Avatar uri={entry.user?.avatar_url ?? null} name={entry.user?.display_name ?? ''} size={isPrimary ? 60 : 48} />
              <Text style={styles.podiumName} numberOfLines={1}>{entry.user?.display_name ?? ''}</Text>
              <View style={[styles.podiumRank, { backgroundColor: PODIUM_COLORS[pos] ?? colors.primary }]}>
                <Text style={styles.podiumRankText}>#{entry.rank}</Text>
              </View>
              <Text style={styles.podiumStreak}>{entry.streak} 🔥</Text>
            </View>
          );
        })}
      </View>
    );
  };

  const renderRow = ({ item }: { item: LeaderboardEntry }) => (
    <View style={styles.rankRow}>
      <Text style={styles.rankNum}>#{item.rank}</Text>
      <Avatar uri={item.user?.avatar_url ?? null} name={item.user?.display_name ?? ''} size={36} />
      <Text style={styles.rankName} numberOfLines={1}>{item.user?.display_name ?? ''}</Text>
      <Text style={styles.rankStreak}>{item.streak} 🔥</Text>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background.base }}>
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

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : leaderboard.length === 0 ? (
        <View style={styles.center}>
          <Feather name="award" size={40} color={colors.textMuted} />
          <Text style={styles.emptyText}>
            {activeTab === 'My Gym' && !myGym
              ? 'Enroll in a gym to see rankings'
              : 'No rankings yet'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={rest}
          keyExtractor={(item) => item.user.id}
          renderItem={renderRow}
          ListHeaderComponent={renderPodium}
          contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />}
          ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: colors.border.subtle, marginLeft: spacing.base + 36 + spacing.md }} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tabRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.border.default,
  },
  tab: { flex: 1, alignItems: 'center', paddingVertical: spacing.md },
  tabText: { fontSize: typography.size.sm, fontWeight: '500', color: colors.textSecondary },
  tabTextActive: { fontWeight: '700', color: colors.textPrimary },
  tabIndicator: {
    position: 'absolute',
    bottom: 0,
    left: '25%',
    right: '25%',
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.primary,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  emptyText: { fontSize: typography.size.base, color: colors.textMuted, textAlign: 'center', paddingHorizontal: spacing.xl },
  podium: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingTop: spacing.xl,
    paddingBottom: spacing.base,
    gap: spacing.base,
    backgroundColor: colors.background.elevated,
    marginBottom: spacing.sm,
  },
  podiumItem: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.xs,
    maxWidth: 100,
  },
  podiumItemFirst: { paddingBottom: spacing.base },
  podiumName: { fontSize: typography.size.xs, fontWeight: '600', color: colors.textPrimary, textAlign: 'center' },
  podiumRank: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: 8,
  },
  podiumRankText: { fontSize: typography.size.xs, fontWeight: '700', color: '#fff' },
  podiumStreak: { fontSize: typography.size.sm, fontWeight: '700', color: colors.textPrimary },
  rankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.base,
  },
  rankNum: { width: 36, fontSize: typography.size.sm, fontWeight: '700', color: colors.textMuted },
  rankName: { flex: 1, fontSize: typography.size.base, fontWeight: '500', color: colors.textPrimary },
  rankStreak: { fontSize: typography.size.base, fontWeight: '700', color: colors.textPrimary },
});
