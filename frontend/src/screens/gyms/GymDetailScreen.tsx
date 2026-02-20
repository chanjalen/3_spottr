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
  Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import Avatar from '../../components/common/Avatar';
import {
  fetchGymDetail,
  fetchBusyLevel,
  submitBusyLevel,
  enrollGym,
  unenrollGym,
  fetchGymLeaderboard,
} from '../../api/gyms';
import { Gym, BusyLevel, LeaderboardEntry } from '../../types/gym';
import { colors, spacing, typography } from '../../theme';
import { GymsStackParamList } from '../../navigation/types';

type Props = {
  navigation: NativeStackNavigationProp<GymsStackParamList, 'GymDetail'>;
  route: RouteProp<GymsStackParamList, 'GymDetail'>;
};

const BUSY_COLORS: Record<string, string> = {
  quiet: '#10B981',
  moderate: '#F59E0B',
  busy: '#F97316',
  very_busy: '#EF4444',
  packed: '#DC2626',
};

const BUSY_OPTIONS = ['quiet', 'moderate', 'busy', 'very_busy', 'packed'] as const;
const BUSY_LABELS: Record<string, string> = {
  quiet: 'Quiet',
  moderate: 'Moderate',
  busy: 'Busy',
  very_busy: 'Very Busy',
  packed: 'Packed',
};

export default function GymDetailScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { gymId, gymName } = route.params;

  const [gym, setGym] = useState<Gym | null>(null);
  const [busyLevel, setBusyLevel] = useState<BusyLevel | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [enrollLoading, setEnrollLoading] = useState(false);
  const [showBusyModal, setShowBusyModal] = useState(false);
  const [submittingBusy, setSubmittingBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [gymData, busy, lb] = await Promise.all([
        fetchGymDetail(gymId),
        fetchBusyLevel(gymId).catch(() => null),
        fetchGymLeaderboard(gymId).catch(() => []),
      ]);
      setGym(gymData);
      setBusyLevel(busy);
      setLeaderboard(lb);
    } catch {
      // ignore
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [gymId]);

  useEffect(() => { load(); }, [load]);

  const handleEnroll = async () => {
    if (!gym) return;
    setEnrollLoading(true);
    try {
      if (gym.is_enrolled) {
        await unenrollGym(gymId);
      } else {
        await enrollGym(gymId);
      }
      setGym((g) => g ? { ...g, is_enrolled: !g.is_enrolled } : g);
    } finally {
      setEnrollLoading(false);
    }
  };

  const handleBusySubmit = async (level: string) => {
    setSubmittingBusy(true);
    try {
      await submitBusyLevel(gymId, level);
      setShowBusyModal(false);
      const fresh = await fetchBusyLevel(gymId);
      setBusyLevel(fresh);
    } finally {
      setSubmittingBusy(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const busyColor = busyLevel ? BUSY_COLORS[busyLevel.level] ?? colors.primary : colors.textMuted;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background.base }}>
      {/* Header */}
      <View style={[styles.headerBar, { paddingTop: insets.top }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>{gymName}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />}
      >
        {/* Gym info */}
        {gym && (
          <View style={styles.gymHero}>
            <View style={styles.gymIconLarge}>
              <Feather name="activity" size={36} color={colors.primary} />
            </View>
            <Text style={styles.gymName}>{gym.name}</Text>
            <Text style={styles.gymAddress}>{gym.address}, {gym.city}, {gym.state}</Text>
            <Pressable
              style={[styles.enrollBtn, gym.is_enrolled && styles.enrollBtnActive]}
              onPress={handleEnroll}
              disabled={enrollLoading}
            >
              {enrollLoading ? (
                <ActivityIndicator size="small" color={gym.is_enrolled ? colors.primary : '#fff'} />
              ) : (
                <Text style={[styles.enrollBtnText, gym.is_enrolled && styles.enrollBtnTextActive]}>
                  {gym.is_enrolled ? 'Unenroll' : 'Enroll'}
                </Text>
              )}
            </Pressable>
          </View>
        )}

        {/* Busy Level Card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Live Busy Level</Text>
            <Pressable style={styles.reportBtn} onPress={() => setShowBusyModal(true)}>
              <Text style={styles.reportBtnText}>Report</Text>
            </Pressable>
          </View>
          {busyLevel ? (
            <>
              <View style={styles.busyBar}>
                <View style={[styles.busyFill, { width: `${busyLevel.percentage}%`, backgroundColor: busyColor }]} />
              </View>
              <View style={styles.busyRow}>
                <Text style={[styles.busyLabel, { color: busyColor }]}>{busyLevel.label}</Text>
                <Text style={styles.busyCount}>{busyLevel.response_count} reports</Text>
              </View>
            </>
          ) : (
            <Text style={styles.noDataText}>No reports yet — be the first!</Text>
          )}
        </View>

        {/* Leaderboard */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Top Lifters</Text>
          {leaderboard.length === 0 ? (
            <Text style={styles.noDataText}>No data yet</Text>
          ) : (
            leaderboard.slice(0, 10).map((entry, i) => (
              <View key={entry.user?.id ?? i} style={styles.leaderRow}>
                <Text style={styles.rank}>#{entry.rank}</Text>
                <Avatar uri={entry.user?.avatar_url ?? null} name={entry.user?.display_name ?? ''} size={32} />
                <Text style={styles.leaderName} numberOfLines={1}>{entry.user?.display_name ?? ''}</Text>
                <Text style={styles.leaderStreak}>{entry.streak} 🔥</Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {/* Busy Level Modal */}
      <Modal visible={showBusyModal} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setShowBusyModal(false)}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>How busy is it?</Text>
            {BUSY_OPTIONS.map((opt) => (
              <Pressable
                key={opt}
                style={({ pressed }) => [styles.busyOption, pressed && styles.busyOptionPressed]}
                onPress={() => handleBusySubmit(opt)}
                disabled={submittingBusy}
              >
                <View style={[styles.busyDot, { backgroundColor: BUSY_COLORS[opt] }]} />
                <Text style={styles.busyOptionText}>{BUSY_LABELS[opt]}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
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
  headerTitle: { flex: 1, fontSize: typography.size.base, fontWeight: '600', color: colors.textPrimary, textAlign: 'center' },
  gymHero: { alignItems: 'center', padding: spacing.xl, gap: spacing.sm },
  gymIconLarge: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: 'rgba(79,195,224,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gymName: { fontSize: typography.size.xl, fontWeight: '700', color: colors.textPrimary },
  gymAddress: { fontSize: typography.size.sm, color: colors.textSecondary, textAlign: 'center' },
  enrollBtn: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm + 2,
    marginTop: spacing.sm,
  },
  enrollBtnActive: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: colors.primary },
  enrollBtnText: { fontSize: typography.size.sm, fontWeight: '700', color: '#fff' },
  enrollBtnTextActive: { color: colors.primary },
  card: {
    marginHorizontal: spacing.base,
    marginBottom: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.base,
    gap: spacing.sm,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 },
      android: { elevation: 2 },
    }),
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { fontSize: typography.size.base, fontWeight: '700', color: colors.textPrimary },
  reportBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    backgroundColor: 'rgba(79,195,224,0.12)',
    borderRadius: 8,
  },
  reportBtnText: { fontSize: typography.size.xs, fontWeight: '600', color: colors.primary },
  busyBar: {
    height: 10,
    backgroundColor: colors.background.elevated,
    borderRadius: 5,
    overflow: 'hidden',
  },
  busyFill: { height: '100%', borderRadius: 5 },
  busyRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  busyLabel: { fontSize: typography.size.sm, fontWeight: '700' },
  busyCount: { fontSize: typography.size.xs, color: colors.textMuted },
  noDataText: { fontSize: typography.size.sm, color: colors.textMuted, textAlign: 'center', paddingVertical: spacing.md },
  leaderRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xs },
  rank: { fontSize: typography.size.sm, fontWeight: '700', color: colors.textMuted, width: 28 },
  leaderName: { flex: 1, fontSize: typography.size.sm, fontWeight: '500', color: colors.textPrimary },
  leaderStreak: { fontSize: typography.size.sm, fontWeight: '700', color: colors.textPrimary },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: spacing.xl,
    gap: spacing.sm,
  },
  modalTitle: { fontSize: typography.size.lg, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.sm },
  busyOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  busyOptionPressed: { backgroundColor: colors.background.elevated },
  busyDot: { width: 12, height: 12, borderRadius: 6 },
  busyOptionText: { fontSize: typography.size.base, color: colors.textPrimary },
});
