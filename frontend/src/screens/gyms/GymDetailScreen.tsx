import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Platform,
  Modal,
  Linking,
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
  fetchWorkoutInvites,
  cancelWorkoutInvite,
  createJoinRequest,
} from '../../api/gyms';
import { Gym, BusyLevel, TopLifter, WorkoutInvite } from '../../types/gym';
import { colors, spacing, typography } from '../../theme';
import { GymsStackParamList } from '../../navigation/types';

type Props = {
  navigation: NativeStackNavigationProp<GymsStackParamList, 'GymDetail'>;
  route: RouteProp<GymsStackParamList, 'GymDetail'>;
};

const BUSY_COLORS: Record<number, string> = {
  1: '#10B981',
  2: '#84CC16',
  3: '#F59E0B',
  4: '#F97316',
  5: '#EF4444',
};

const BUSY_OPTIONS: { label: string; value: number }[] = [
  { label: 'Quiet', value: 1 },
  { label: 'Moderate', value: 2 },
  { label: 'Busy', value: 3 },
  { label: 'Very Busy', value: 4 },
  { label: 'Packed', value: 5 },
];

const LIFT_OPTIONS = [
  { label: 'Total', value: 'total' },
  { label: 'Bench', value: 'bench' },
  { label: 'Squat', value: 'squat' },
  { label: 'Deadlift', value: 'deadlift' },
];

const RANK_COLORS: Record<number, string> = {
  1: '#F59E0B',
  2: '#9CA3AF',
  3: '#B45309',
};

export default function GymDetailScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { gymId, gymName } = route.params;

  const [gym, setGym] = useState<Gym | null>(null);
  const [busyLevel, setBusyLevel] = useState<BusyLevel | null>(null);
  const [topLifters, setTopLifters] = useState<TopLifter[]>([]);
  const [invites, setInvites] = useState<WorkoutInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [enrollLoading, setEnrollLoading] = useState(false);
  const [showBusyModal, setShowBusyModal] = useState(false);
  const [submittingBusy, setSubmittingBusy] = useState(false);
  const [selectedLift, setSelectedLift] = useState('total');
  const [liftLoading, setLiftLoading] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [joiningInviteId, setJoiningInviteId] = useState<string | null>(null);
  const [joinDesc, setJoinDesc] = useState('');
  const [joinLoading, setJoinLoading] = useState(false);
  const [requestedInvites, setRequestedInvites] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const [gymData, busy, lifters] = await Promise.all([
        fetchGymDetail(gymId),
        fetchBusyLevel(gymId).catch(() => null),
        fetchGymLeaderboard(gymId, 'total').catch(() => []),
      ]);
      setGym(gymData);
      setBusyLevel(busy);
      setTopLifters(lifters);
      // Invites visible to all authenticated users
      const inviteData = await fetchWorkoutInvites(gymId).catch(() => []);
      setInvites(inviteData);
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
        setGym(g => g ? { ...g, is_enrolled: false, enrolled_users_count: g.enrolled_users_count - 1 } : g);
      } else {
        const updated = await enrollGym(gymId);
        setGym(updated);
      }
    } finally {
      setEnrollLoading(false);
    }
  };

  const handleBusySubmit = async (surveyResponse: number) => {
    setSubmittingBusy(true);
    try {
      await submitBusyLevel(gymId, surveyResponse);
      setShowBusyModal(false);
      const fresh = await fetchBusyLevel(gymId);
      setBusyLevel(fresh);
    } finally {
      setSubmittingBusy(false);
    }
  };

  const handleLiftChange = async (lift: string) => {
    setSelectedLift(lift);
    setLiftLoading(true);
    try {
      const lifters = await fetchGymLeaderboard(gymId, lift);
      setTopLifters(lifters);
    } finally {
      setLiftLoading(false);
    }
  };

  const handleCancelInvite = async (inviteId: string) => {
    try {
      await cancelWorkoutInvite(inviteId);
      setInvites(prev => prev.filter(i => i.id !== inviteId));
    } catch {
      // ignore
    }
  };

  const openJoinModal = (inviteId: string) => {
    setJoiningInviteId(inviteId);
    setJoinDesc('');
    setShowJoinModal(true);
  };

  const handleJoinSubmit = async () => {
    if (!joiningInviteId) return;
    setJoinLoading(true);
    try {
      await createJoinRequest(joiningInviteId, joinDesc);
      setRequestedInvites(prev => new Set(prev).add(joiningInviteId));
      setShowJoinModal(false);
    } finally {
      setJoinLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const busyColor = busyLevel?.level ? (BUSY_COLORS[busyLevel.level] ?? colors.primary) : colors.textMuted;
  const busyPct = busyLevel?.level ? (busyLevel.level / 5) * 100 : 0;

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
        {/* Hero */}
        {gym && (
          <View style={styles.gymHero}>
            <View style={styles.gymIconLarge}>
              <Feather name="activity" size={36} color={colors.primary} />
            </View>
            <Text style={styles.gymName}>{gym.name}</Text>
            {gym.address ? <Text style={styles.gymAddress}>{gym.address}</Text> : null}
            <Text style={styles.memberCount}>{gym.enrolled_users_count} members</Text>

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

        {/* Quick Info */}
        {gym && (gym.website || gym.phone_number || gym.amenities?.length > 0) && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Info</Text>
            {gym.website ? (
              <Pressable onPress={() => Linking.openURL(gym.website!)} style={styles.infoRow}>
                <Feather name="globe" size={14} color={colors.primary} />
                <Text style={[styles.infoText, { color: colors.primary }]} numberOfLines={1}>{gym.website}</Text>
              </Pressable>
            ) : null}
            {gym.phone_number ? (
              <Pressable onPress={() => Linking.openURL(`tel:${gym.phone_number}`)} style={styles.infoRow}>
                <Feather name="phone" size={14} color={colors.primary} />
                <Text style={[styles.infoText, { color: colors.primary }]}>{gym.phone_number}</Text>
              </Pressable>
            ) : null}
            {gym.amenities?.length > 0 && (
              <View style={styles.amenitiesWrap}>
                {gym.amenities.map((a, i) => (
                  <View key={i} style={styles.amenityChip}>
                    <Text style={styles.amenityText}>{a}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* Live Activity Card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Live Activity</Text>
            <Pressable style={styles.reportBtn} onPress={() => setShowBusyModal(true)}>
              <Feather name="edit-2" size={14} color={colors.primary} />
            </Pressable>
          </View>
          {busyLevel ? (
            <>
              <View style={styles.busyBar}>
                <View style={[styles.busyFill, { width: `${busyPct}%` as any, backgroundColor: busyColor }]} />
              </View>
              <View style={styles.busyRow}>
                <Text style={[styles.busyLabel, { color: busyColor }]}>{busyLevel.label ?? 'Unknown'}</Text>
                <Text style={styles.busyCount}>{busyLevel.total_responses} report{busyLevel.total_responses !== 1 ? 's' : ''}</Text>
              </View>
            </>
          ) : (
            <Text style={styles.noDataText}>No reports yet — be the first!</Text>
          )}
        </View>

        {/* Workout Buddies */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Workout Buddies</Text>
            <Pressable
              style={[styles.postInviteBtn, !gym?.is_enrolled && styles.postInviteBtnDisabled]}
              onPress={() => gym?.is_enrolled && navigation.navigate('CreateInvite', { gymId, gymName })}
            >
              <Feather name="plus" size={14} color={gym?.is_enrolled ? '#fff' : colors.textMuted} />
              <Text style={[styles.postInviteBtnText, !gym?.is_enrolled && styles.postInviteBtnTextDisabled]}>Post Invite</Text>
            </Pressable>
          </View>

          {invites.length === 0 ? (
            <Text style={styles.noDataText}>No active invites</Text>
          ) : (
            invites.map(invite => {
              const isOwn = false; // Will be true if invite.username === currentUser — handled via cancel btn
              const requested = requestedInvites.has(invite.id);
              const scheduledDate = new Date(invite.scheduled_time);
              return (
                <View key={invite.id} style={styles.inviteCard}>
                  <View style={styles.inviteAvatar}>
                    <Text style={styles.inviteAvatarText}>{invite.username[0]?.toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={styles.inviteUser}>@{invite.username}</Text>
                    <Text style={styles.inviteType}>{invite.workout_type} · {scheduledDate.toLocaleDateString()} {scheduledDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
                    {invite.description ? <Text style={styles.inviteDesc} numberOfLines={2}>{invite.description}</Text> : null}
                    <Text style={styles.inviteSpots}>{invite.spots_available} spot{invite.spots_available !== 1 ? 's' : ''} left</Text>
                  </View>
                  <View style={styles.inviteActions}>
                    {requested ? (
                      <Text style={styles.requestedText}>Requested</Text>
                    ) : (
                      <Pressable style={styles.joinBtn} onPress={() => openJoinModal(invite.id)}>
                        <Text style={styles.joinBtnText}>Join</Text>
                      </Pressable>
                    )}
                    <Pressable style={styles.cancelInviteBtn} onPress={() => handleCancelInvite(invite.id)}>
                      <Feather name="x" size={14} color={colors.textMuted} />
                    </Pressable>
                  </View>
                </View>
              );
            })
          )}
        </View>

        {/* Top Lifters */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Top Lifters</Text>

          {/* Lift picker */}
          <View style={styles.liftPicker}>
            {LIFT_OPTIONS.map(opt => (
              <Pressable
                key={opt.value}
                style={[styles.liftOption, selectedLift === opt.value && styles.liftOptionActive]}
                onPress={() => handleLiftChange(opt.value)}
              >
                <Text style={[styles.liftOptionText, selectedLift === opt.value && styles.liftOptionTextActive]}>
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </View>

          {liftLoading ? (
            <ActivityIndicator color={colors.primary} style={{ paddingVertical: spacing.md }} />
          ) : topLifters.length === 0 ? (
            <Text style={styles.noDataText}>No PR data yet</Text>
          ) : (
            topLifters.map((entry) => (
              <View key={entry.username} style={styles.leaderRow}>
                <Text style={[styles.rank, { color: RANK_COLORS[entry.rank] ?? colors.textMuted }]}>
                  #{entry.rank}
                </Text>
                <Avatar uri={entry.avatar_url} name={entry.display_name} size={32} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.leaderName} numberOfLines={1}>{entry.display_name}</Text>
                  <Text style={styles.leaderUsername}>@{entry.username}</Text>
                </View>
                <Text style={styles.leaderValue}>{entry.value} {entry.unit}</Text>
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
                key={opt.value}
                style={({ pressed }) => [styles.busyOption, pressed && styles.busyOptionPressed]}
                onPress={() => handleBusySubmit(opt.value)}
                disabled={submittingBusy}
              >
                <View style={[styles.busyDot, { backgroundColor: BUSY_COLORS[opt.value] }]} />
                <Text style={styles.busyOptionText}>{opt.label}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>

      {/* Join Request Modal */}
      <Modal visible={showJoinModal} transparent animationType="slide">
        <Pressable style={styles.modalOverlay} onPress={() => setShowJoinModal(false)}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Send Join Request</Text>
            <TextInput
              style={styles.descInput}
              value={joinDesc}
              onChangeText={setJoinDesc}
              placeholder="Tell them why you want to join…"
              placeholderTextColor={colors.textMuted}
              multiline
              numberOfLines={3}
            />
            <View style={styles.modalActions}>
              <Pressable style={styles.cancelModalBtn} onPress={() => setShowJoinModal(false)}>
                <Text style={styles.cancelModalText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.submitModalBtn} onPress={handleJoinSubmit} disabled={joinLoading}>
                {joinLoading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.submitModalText}>Send</Text>
                )}
              </Pressable>
            </View>
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
  gymName: { fontSize: typography.size.xl, fontWeight: '700', color: colors.textPrimary, textAlign: 'center' },
  gymAddress: { fontSize: typography.size.sm, color: colors.textSecondary, textAlign: 'center' },
  memberCount: { fontSize: typography.size.xs, color: colors.textMuted },
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

  infoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  infoText: { fontSize: typography.size.sm, flex: 1 },
  amenitiesWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  amenityChip: {
    backgroundColor: colors.background.elevated,
    borderRadius: 8,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  amenityText: { fontSize: typography.size.xs, color: colors.textSecondary },

  reportBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(79,195,224,0.12)',
    borderRadius: 8,
  },
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

  postInviteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  postInviteBtnDisabled: { backgroundColor: colors.background.elevated },
  postInviteBtnText: { fontSize: typography.size.xs, fontWeight: '700', color: '#fff' },
  postInviteBtnTextDisabled: { color: colors.textMuted },
  inviteCard: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border.subtle,
  },
  inviteAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(79,195,224,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  inviteAvatarText: { fontSize: typography.size.sm, fontWeight: '700', color: colors.primary },
  inviteUser: { fontSize: typography.size.sm, fontWeight: '600', color: colors.textPrimary },
  inviteType: { fontSize: typography.size.xs, color: colors.textSecondary },
  inviteDesc: { fontSize: typography.size.xs, color: colors.textMuted },
  inviteSpots: { fontSize: typography.size.xs, color: colors.primary, fontWeight: '600' },
  inviteActions: { alignItems: 'center', gap: spacing.xs },
  joinBtn: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
  },
  joinBtnText: { fontSize: typography.size.xs, fontWeight: '700', color: '#fff' },
  requestedText: { fontSize: typography.size.xs, color: colors.textMuted, fontStyle: 'italic' },
  cancelInviteBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },

  liftPicker: {
    flexDirection: 'row',
    backgroundColor: colors.background.elevated,
    borderRadius: 10,
    padding: 3,
  },
  liftOption: {
    flex: 1,
    paddingVertical: 6,
    alignItems: 'center',
    borderRadius: 8,
  },
  liftOptionActive: { backgroundColor: colors.surface },
  liftOptionText: { fontSize: typography.size.xs, color: colors.textMuted, fontWeight: '500' },
  liftOptionTextActive: { color: colors.textPrimary, fontWeight: '700' },

  leaderRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xs },
  rank: { fontSize: typography.size.sm, fontWeight: '700', width: 28 },
  leaderName: { fontSize: typography.size.sm, fontWeight: '500', color: colors.textPrimary },
  leaderUsername: { fontSize: typography.size.xs, color: colors.textMuted },
  leaderValue: { fontSize: typography.size.sm, fontWeight: '700', color: colors.textPrimary },

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

  descInput: {
    backgroundColor: colors.background.elevated,
    borderRadius: 10,
    padding: spacing.md,
    fontSize: typography.size.sm,
    color: colors.textPrimary,
    minHeight: 80,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  modalActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  cancelModalBtn: {
    flex: 1,
    padding: spacing.md,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  cancelModalText: { fontSize: typography.size.sm, color: colors.textSecondary, fontWeight: '600' },
  submitModalBtn: {
    flex: 1,
    padding: spacing.md,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: 'center',
  },
  submitModalText: { fontSize: typography.size.sm, color: '#fff', fontWeight: '700' },
});
