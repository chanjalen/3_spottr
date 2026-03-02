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
  KeyboardAvoidingView,
  Alert,
} from 'react-native';
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp, useNavigation } from '@react-navigation/native';
import Avatar from '../../components/common/Avatar';
import { useAuth } from '../../store/AuthContext';
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
  createWorkoutInvite,
} from '../../api/gyms';
import { Gym, BusyLevel, TopLifter, WorkoutInvite } from '../../types/gym';
import { colors, spacing, typography } from '../../theme';
import { GymsStackParamList, RootStackParamList } from '../../navigation/types';
import { staleCache } from '../../utils/staleCache';

type RootNav = NativeStackNavigationProp<RootStackParamList>;

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
  { label: 'Not crowded',     value: 1 },
  { label: 'Not too crowded',  value: 2 },
  { label: 'Moderately crowded',      value: 3 },
  { label: 'Crowded', value: 4 },
  { label: 'Very crowded',    value: 5 },
];

const LIFT_OPTIONS = [
  { label: 'Total',    value: 'total' },
  { label: 'Bench',    value: 'bench' },
  { label: 'Squat',    value: 'squat' },
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
  const { user: me } = useAuth();
  const rootNav = useNavigation<RootNav>();

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
  const [showLiftDropdown, setShowLiftDropdown] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [joiningInviteId, setJoiningInviteId] = useState<string | null>(null);
  const [joinDesc, setJoinDesc] = useState('');
  const [joinLoading, setJoinLoading] = useState(false);
  const [requestedInvites, setRequestedInvites] = useState<Set<string>>(new Set());

  // Post Invite modal
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteWorkoutType, setInviteWorkoutType] = useState('');
  const [inviteDescription, setInviteDescription] = useState('');
  const [inviteSpots, setInviteSpots] = useState('1');
  const [inviteTime, setInviteTime] = useState<Date | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const cacheKey = `gym:detail:${gymId}`;
    type CachedDetail = { gym: Gym; busyLevel: BusyLevel | null; topLifters: TopLifter[]; invites: WorkoutInvite[] };

    // ── Serve cached data immediately ────────────────────────────────────────
    const cached = await staleCache.get<CachedDetail>(cacheKey);
    if (cached) {
      setGym(cached.gym);
      setBusyLevel(cached.busyLevel);
      setTopLifters(cached.topLifters);
      setInvites(cached.invites);
      setLoading(false);
    }

    // ── Always fetch fresh in background ─────────────────────────────────────
    try {
      const [gymData, busy, lifters] = await Promise.all([
        fetchGymDetail(gymId),
        fetchBusyLevel(gymId).catch(() => null),
        fetchGymLeaderboard(gymId, 'total').catch(() => []),
      ]);
      const inviteData = await fetchWorkoutInvites(gymId).catch(() => []);
      staleCache.set(cacheKey, { gym: gymData, busyLevel: busy, topLifters: lifters, invites: inviteData }, 2 * 60 * 1000);
      setGym(gymData);
      setBusyLevel(busy);
      setTopLifters(lifters);
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

  const formatDateTime = (d: Date) =>
    d.toLocaleDateString([], { month: 'short', day: 'numeric' }) +
    ' at ' +
    d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  const openInviteModal = () => {
    setInviteWorkoutType('');
    setInviteDescription('');
    setInviteSpots('1');
    setInviteTime(null);
    setInviteError(null);
    setShowPicker(false);
    setShowInviteModal(true);
  };

  const handlePostInvite = async () => {
    const spots = parseInt(inviteSpots, 10);
    if (!inviteWorkoutType.trim()) { setInviteError('Workout type is required.'); return; }
    if (!inviteDescription.trim()) { setInviteError('Description is required.'); return; }
    if (isNaN(spots) || spots < 1) { setInviteError('Spots must be at least 1.'); return; }
    if (!inviteTime) { setInviteError('Please select a date and time.'); return; }
    setInviteError(null);
    setInviteLoading(true);
    try {
      const scheduled = inviteTime.toISOString();
      const expires = new Date(inviteTime.getTime() + 24 * 60 * 60 * 1000).toISOString();
      const newInvite = await createWorkoutInvite({
        gym_id: gymId,
        workout_type: inviteWorkoutType.trim(),
        description: inviteDescription.trim(),
        spots_available: spots,
        scheduled_time: scheduled,
        type: 'gym',
        expires_at: expires,
      });
      setInvites(prev => [newInvite, ...prev]);
      setShowInviteModal(false);
    } catch {
      setInviteError('Failed to post invite. Please try again.');
    } finally {
      setInviteLoading(false);
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
  const busyLabel = busyLevel?.label ?? 'No data';
  const selectedLiftLabel = LIFT_OPTIONS.find(o => o.value === selectedLift)?.label ?? 'Total';

  return (
    <View style={{ flex: 1, backgroundColor: colors.background.base }}>

      {/* ── Gradient header ── */}
      <LinearGradient
        colors={['#4FC3E0', '#6DCFE8', '#A8E2F4', '#D6F2FB', '#FFFFFF']}
        locations={[0, 0.2, 0.5, 0.75, 1]}
      >
        {/* Back + action buttons */}
        <View style={[styles.headerRow, { paddingTop: insets.top + 8 }]}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Feather name="arrow-left" size={22} color={colors.textPrimary} />
          </Pressable>
          <View style={styles.headerActions}>
            <Pressable
              style={[styles.headerPill, gym?.is_enrolled && styles.headerPillFilled]}
              onPress={handleEnroll}
              disabled={enrollLoading}
            >
              {enrollLoading ? (
                <ActivityIndicator size="small" color={gym?.is_enrolled ? colors.textOnPrimary : colors.primary} />
              ) : (
                <Text style={[styles.headerPillText, gym?.is_enrolled && styles.headerPillTextFilled]}>
                  {gym?.is_enrolled ? 'Enrolled' : 'Enroll'}
                </Text>
              )}
            </Pressable>
            <Pressable style={styles.headerPillOutline} onPress={() => navigation.goBack()}>
              <Text style={styles.headerPillOutlineText}>View Map</Text>
            </Pressable>
          </View>
        </View>

        {/* Gym name + address + website */}
        <View style={styles.heroInfo}>
          <Text style={styles.heroName}>{gym?.name ?? gymName}</Text>
          {gym?.address ? <Text style={styles.heroAddress}>{gym.address}</Text> : null}
          {gym?.website ? (
            <Pressable onPress={() => Linking.openURL(gym.website!)} style={styles.heroWebsiteRow}>
              <Feather name="globe" size={12} color={colors.primary} />
              <Text style={styles.heroWebsite} numberOfLines={1}>{gym.website}</Text>
            </Pressable>
          ) : null}
        </View>
      </LinearGradient>

      {/* ── Scrollable content ── */}
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(); }}
            tintColor={colors.primary}
          />
        }
      >
        {/* ── Live Activity ── */}
        <Pressable
          style={styles.card}
          onPress={() => navigation.navigate('GymLiveActivity', { gymId, gymName: gym?.name ?? gymName })}
        >
          <View style={styles.activityHeader}>
            <Text style={styles.activityLabel}>LIVE ACTIVITY</Text>
            <View style={styles.activityCenter}>
              <Text style={[styles.activityValue, { color: busyLevel?.level ? busyColor : colors.textPrimary }]}>
                {busyLabel}
              </Text>
              <Text style={styles.activitySub}>Busy Level</Text>
            </View>
            <Pressable
              style={styles.reportBtn}
              onPress={() => {
                if (!gym?.is_enrolled) {
                  Alert.alert('Enrolled Members Only', 'Only enrolled members can post a busy level.');
                  return;
                }
                setShowBusyModal(true);
              }}
            >
              <Feather name="edit-2" size={14} color={colors.primary} />
            </Pressable>
          </View>

          <Text style={[styles.activityBig, { color: busyLevel?.level ? busyColor : colors.textMuted }]}>
            {busyLabel}
          </Text>

          {busyLevel?.level ? (
            <>
              <View style={styles.busyBar}>
                <View style={[styles.busyFill, { width: `${busyPct}%` as any, backgroundColor: busyColor }]} />
              </View>
              <Text style={styles.busyCount}>
                {busyLevel.total_responses} report{busyLevel.total_responses !== 1 ? 's' : ''}
              </Text>
            </>
          ) : null}

          <View style={styles.viewChartBtn}>
            <Text style={styles.viewChartText}>View 24-hour chart</Text>
            <Feather name="chevron-right" size={14} color={colors.primary} />
          </View>
        </Pressable>

        {/* ── Workout Buddies ── */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Workout Buddies</Text>
            <Pressable
              style={[styles.postInviteBtn, !gym?.is_enrolled && styles.postInviteBtnDisabled]}
              onPress={() => gym?.is_enrolled && openInviteModal()}
            >
              <Text style={[styles.postInviteBtnText, !gym?.is_enrolled && styles.postInviteBtnTextDisabled]}>
                Post Invite
              </Text>
            </Pressable>
          </View>

          {invites.length === 0 ? (
            <Text style={styles.noDataText}>No active invites</Text>
          ) : (
            invites.map(invite => {
              const isOwn = invite.username === me?.username;
              const requested = requestedInvites.has(invite.id);
              const d = new Date(invite.scheduled_time);
              const timeStr =
                d.toLocaleDateString([], { month: 'short', day: 'numeric' }) +
                ' at ' +
                d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

              return (
                <View key={invite.id} style={styles.inviteCard}>
                  <Pressable onPress={() => rootNav.navigate('Profile', { username: invite.username })}>
                    <View style={styles.inviteAvatar}>
                      <Text style={styles.inviteAvatarText}>{invite.username[0]?.toUpperCase()}</Text>
                    </View>
                  </Pressable>
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={styles.inviteUser} numberOfLines={2}>
                      <Text
                        style={styles.inviteUserBold}
                        onPress={() => rootNav.navigate('Profile', { username: invite.username })}
                      >@{invite.username}</Text>
                      {` is looking for ${invite.spots_available} ${invite.spots_available === 1 ? 'person' : 'people'}`}
                    </Text>
                    <Text style={styles.inviteMeta}>{invite.workout_type} · {timeStr}</Text>
                    {invite.description ? (
                      <Text style={styles.inviteDesc} numberOfLines={2}>{invite.description}</Text>
                    ) : null}
                  </View>
                  <View style={styles.inviteActions}>
                    {isOwn ? (
                      <Pressable style={styles.cancelInviteBtn} onPress={() => handleCancelInvite(invite.id)}>
                        <Text style={styles.cancelInviteBtnText}>Cancel Invite</Text>
                      </Pressable>
                    ) : requested ? (
                      <Text style={styles.requestedText}>Requested</Text>
                    ) : (
                      <Pressable style={styles.joinBtn} onPress={() => openJoinModal(invite.id)}>
                        <Text style={styles.joinBtnText}>Join</Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              );
            })
          )}
        </View>

        {/* ── Top Lifters ── */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle} numberOfLines={2}>
              Top Lifters at {gym?.name ?? gymName}
            </Text>
            <Pressable style={styles.liftDropBtn} onPress={() => setShowLiftDropdown(true)}>
              <Text style={styles.liftDropText}>{selectedLiftLabel}</Text>
              <Feather name="chevron-down" size={12} color={colors.textSecondary} />
            </Pressable>
          </View>

          {liftLoading ? (
            <ActivityIndicator color={colors.primary} style={{ paddingVertical: spacing.md }} />
          ) : topLifters.length === 0 ? (
            <Text style={styles.noDataText}>No PR data yet</Text>
          ) : (
            topLifters.map(entry => (
              <View key={entry.username} style={styles.leaderRow}>
                <Text style={[styles.rank, { color: RANK_COLORS[entry.rank] ?? colors.textMuted }]}>
                  #{entry.rank}
                </Text>
                <Pressable
                  onPress={() => rootNav.navigate('Profile', { username: entry.username })}
                  style={styles.leaderUser}
                >
                  <Avatar uri={entry.avatar_url} name={entry.display_name} size={36} />
                  <View>
                    <Text style={styles.leaderName} numberOfLines={1}>{entry.display_name}</Text>
                    <Text style={styles.leaderUsername}>@{entry.username}</Text>
                  </View>
                </Pressable>
                <Text style={styles.leaderValue}>{entry.value} {entry.unit}</Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {/* ── Lift dropdown modal ── */}
      <Modal visible={showLiftDropdown} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setShowLiftDropdown(false)}>
          <View style={styles.dropdownSheet}>
            <Text style={styles.dropdownTitle}>Sort by lift</Text>
            {LIFT_OPTIONS.map(opt => (
              <Pressable
                key={opt.value}
                style={[styles.dropdownOption, selectedLift === opt.value && styles.dropdownOptionActive]}
                onPress={() => { handleLiftChange(opt.value); setShowLiftDropdown(false); }}
              >
                <Text style={[styles.dropdownOptionText, selectedLift === opt.value && styles.dropdownOptionTextActive]}>
                  {opt.label}
                </Text>
                {selectedLift === opt.value && <Feather name="check" size={14} color={colors.primary} />}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>

      {/* ── Busy Level modal ── */}
      <Modal visible={showBusyModal} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setShowBusyModal(false)}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>How busy is the gym?</Text>
            {BUSY_OPTIONS.map(opt => (
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

      {/* ── Join Request modal ── */}
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
                {joinLoading
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.submitModalText}>Send</Text>
                }
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Modal>

      {/* ── Post Invite modal ── */}
      <Modal visible={showInviteModal} transparent animationType="fade">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <Pressable style={styles.modalOverlay} onPress={() => setShowInviteModal(false)}>
            <View style={styles.inviteModalSheet}>
              <ScrollView
                bounces={false}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ gap: 0 }}
              >
                <Pressable onPress={e => e.stopPropagation()}>
                  <Text style={styles.inviteModalTitle}>Post Workout Invite</Text>

                  <Text style={styles.inviteFieldLabel}>WORKOUT TYPE</Text>
                  <TextInput
                    style={styles.inviteInput}
                    value={inviteWorkoutType}
                    onChangeText={setInviteWorkoutType}
                    placeholder="e.g. Leg Day, Basketball"
                    placeholderTextColor={colors.textMuted}
                    returnKeyType="next"
                  />

                  <Text style={[styles.inviteFieldLabel, { marginTop: spacing.sm }]}>DESCRIPTION</Text>
                  <TextInput
                    style={styles.inviteInput}
                    value={inviteDescription}
                    onChangeText={setInviteDescription}
                    placeholder="What are you looking for?"
                    placeholderTextColor={colors.textMuted}
                    returnKeyType="next"
                  />

                  <View style={styles.inviteSpotsTimeRow}>
                    <View style={styles.inviteSpotsCol}>
                      <Text style={styles.inviteFieldLabel}>SPOTS</Text>
                      <TextInput
                        style={styles.inviteInput}
                        value={inviteSpots}
                        onChangeText={setInviteSpots}
                        keyboardType="number-pad"
                        placeholder="1"
                        placeholderTextColor={colors.textMuted}
                      />
                    </View>
                    <View style={styles.inviteTimeCol}>
                      <Text style={styles.inviteFieldLabel}>TIME</Text>
                      <Pressable
                        style={[styles.inviteInput, styles.inviteTimeBtn]}
                        onPress={() => setShowPicker(true)}
                      >
                        <Text style={inviteTime ? styles.inviteTimeText : styles.inviteTimePlaceholder}>
                          {inviteTime ? formatDateTime(inviteTime) : 'Select date & time'}
                        </Text>
                      </Pressable>
                    </View>
                  </View>

                  {inviteError ? <Text style={styles.inviteErrorText}>{inviteError}</Text> : null}

                  <View style={[styles.modalActions, { marginTop: spacing.md }]}>
                    <Pressable style={styles.cancelModalBtn} onPress={() => setShowInviteModal(false)}>
                      <Text style={styles.cancelModalText}>Cancel</Text>
                    </Pressable>
                    <Pressable style={styles.postInviteSubmitBtn} onPress={handlePostInvite} disabled={inviteLoading}>
                      {inviteLoading
                        ? <ActivityIndicator size="small" color="#fff" />
                        : <Text style={styles.submitModalText}>Post</Text>
                      }
                    </Pressable>
                  </View>
                </Pressable>
              </ScrollView>
            </View>
          </Pressable>
        </KeyboardAvoidingView>

        <DateTimePickerModal
          isVisible={showPicker}
          mode="datetime"
          minimumDate={new Date()}
          date={inviteTime ?? new Date()}
          themeVariant="light"
          isDarkModeEnabled={false}
          onConfirm={(selected) => {
            setInviteTime(selected);
            setShowPicker(false);
          }}
          onCancel={() => setShowPicker(false)}
        />
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background.base },

  // ── Gradient header ──
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.sm,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerActions: { flexDirection: 'row', gap: spacing.sm },
  headerPill: {
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    minWidth: 72,
    alignItems: 'center',
  },
  headerPillFilled: {
    backgroundColor: colors.primary,
  },
  headerPillText: {
    fontSize: typography.size.xs,
    fontFamily: typography.family.semibold,
    color: colors.primary,
  },
  headerPillTextFilled: {
    color: colors.textOnPrimary,
  },
  headerPillOutline: {
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    alignItems: 'center',
  },
  headerPillOutlineText: {
    fontSize: typography.size.xs,
    fontFamily: typography.family.semibold,
    color: colors.primary,
  },
  heroInfo: {
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.lg,
    gap: 4,
  },
  heroName: {
    fontSize: typography.size.xl,
    fontFamily: typography.family.bold,
    color: colors.textPrimary,
    lineHeight: 28,
  },
  heroAddress: {
    fontSize: typography.size.sm,
    fontFamily: typography.family.regular,
    color: colors.textSecondary,
  },
  heroWebsiteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 2,
  },
  heroWebsite: {
    fontSize: typography.size.xs,
    fontFamily: typography.family.regular,
    color: colors.primary,
    flexShrink: 1,
  },

  // ── Cards ──
  card: {
    marginHorizontal: spacing.base,
    marginTop: spacing.md,
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
  cardTitle: {
    flex: 1,
    fontSize: typography.size.base,
    fontFamily: typography.family.bold,
    color: colors.textPrimary,
    marginRight: spacing.sm,
  },

  // Info
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

  // ── Live Activity ──
  activityHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  activityLabel: {
    flex: 1,
    fontSize: typography.size.xs,
    fontFamily: typography.family.semibold,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  activityCenter: { alignItems: 'flex-end', marginRight: spacing.sm },
  activityValue: { fontSize: typography.size.sm, fontFamily: typography.family.bold },
  activitySub: { fontSize: 10, fontFamily: typography.family.regular, color: colors.textMuted },
  reportBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(79,195,224,0.12)',
    borderRadius: 8,
  },
  activityBig: { fontSize: 28, fontFamily: typography.family.bold },
  busyBar: { height: 8, backgroundColor: colors.background.elevated, borderRadius: 4, overflow: 'hidden' },
  busyFill: { height: '100%', borderRadius: 4 },
  busyCount: { fontSize: typography.size.xs, color: colors.textMuted, textAlign: 'right' },
  viewChartBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border.subtle,
  },
  viewChartText: {
    fontSize: typography.size.xs,
    fontFamily: typography.family.semibold,
    color: colors.primary,
  },
  noDataText: { fontSize: typography.size.sm, color: colors.textMuted, textAlign: 'center', paddingVertical: spacing.md },

  // ── Workout Buddies ──
  postInviteBtn: {
    borderRadius: 20,
    backgroundColor: '#7C3AED',
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  postInviteBtnDisabled: { backgroundColor: colors.background.elevated },
  postInviteBtnText: { fontSize: typography.size.xs, fontFamily: typography.family.bold, color: '#fff' },
  postInviteBtnTextDisabled: { color: colors.textMuted },

  inviteCard: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
    paddingTop: spacing.sm,
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
  inviteAvatarText: { fontSize: typography.size.sm, fontFamily: typography.family.bold, color: colors.primary },
  inviteUser: { fontSize: typography.size.sm, fontFamily: typography.family.regular, color: colors.textPrimary, flexShrink: 1 },
  inviteUserBold: { fontFamily: typography.family.bold, color: colors.textPrimary },
  inviteMeta: { fontSize: typography.size.xs, fontFamily: typography.family.regular, color: colors.textSecondary },
  inviteDesc: { fontSize: typography.size.xs, fontFamily: typography.family.regular, color: colors.textMuted },
  inviteActions: { alignItems: 'flex-end', justifyContent: 'center', paddingTop: 2 },
  cancelInviteBtn: {
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#EF4444',
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
  },
  cancelInviteBtnText: { fontSize: typography.size.xs, fontFamily: typography.family.semibold, color: '#EF4444' },
  joinBtn: { backgroundColor: colors.primary, borderRadius: 20, paddingHorizontal: spacing.md, paddingVertical: 5 },
  joinBtnText: { fontSize: typography.size.xs, fontFamily: typography.family.bold, color: '#fff' },
  requestedText: { fontSize: typography.size.xs, color: colors.textMuted, fontStyle: 'italic' },

  // ── Top Lifters ──
  liftDropBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: colors.border.default,
    borderRadius: 20,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
  },
  liftDropText: { fontSize: typography.size.xs, fontFamily: typography.family.semibold, color: colors.textSecondary },
  leaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border.subtle,
  },
  rank: { fontSize: typography.size.sm, fontFamily: typography.family.bold, width: 28 },
  leaderUser: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  leaderName: { fontSize: typography.size.sm, fontFamily: typography.family.semibold, color: colors.textPrimary },
  leaderUsername: { fontSize: typography.size.xs, color: colors.textMuted },
  leaderValue: { fontSize: typography.size.sm, fontFamily: typography.family.bold, color: '#F59E0B' },

  // ── Lift dropdown ──
  dropdownSheet: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    paddingVertical: spacing.sm,
    marginHorizontal: spacing.xl,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 20 },
      android: { elevation: 8 },
    }),
  },
  dropdownTitle: {
    fontSize: typography.size.xs,
    fontFamily: typography.family.semibold,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.xs,
  },
  dropdownOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
  },
  dropdownOptionActive: { backgroundColor: 'rgba(79,195,224,0.08)' },
  dropdownOptionText: { fontSize: typography.size.base, fontFamily: typography.family.regular, color: colors.textPrimary },
  dropdownOptionTextActive: { fontFamily: typography.family.semibold, color: colors.primary },

  // ── Shared modals ──
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center' },
  modalSheet: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    marginHorizontal: spacing.base,
    padding: spacing.xl,
    gap: spacing.sm,
  },
  modalTitle: { fontSize: typography.size.lg, fontFamily: typography.family.bold, color: colors.textPrimary, marginBottom: spacing.sm },
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
  busyOptionText: { fontSize: typography.size.base, fontFamily: typography.family.regular, color: colors.textPrimary },
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
  cancelModalBtn: { flex: 1, padding: spacing.md, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: colors.border.default },
  cancelModalText: { fontSize: typography.size.sm, fontFamily: typography.family.semibold, color: colors.textSecondary },
  submitModalBtn: { flex: 1, padding: spacing.md, borderRadius: 10, backgroundColor: colors.primary, alignItems: 'center' },
  submitModalText: { fontSize: typography.size.sm, fontFamily: typography.family.bold, color: '#fff' },

  // ── Post Invite modal ──
  inviteModalSheet: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    marginHorizontal: spacing.base,
    padding: spacing.xl,
    maxHeight: '88%',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.2, shadowRadius: 20 },
      android: { elevation: 10 },
    }),
  },
  inviteModalTitle: {
    fontSize: typography.size.lg,
    fontFamily: typography.family.bold,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  inviteFieldLabel: {
    fontSize: 10,
    fontFamily: typography.family.semibold,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: spacing.xs,
    marginBottom: 4,
  },
  inviteInput: {
    backgroundColor: colors.background.elevated,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: Platform.OS === 'ios' ? 12 : 10,
    fontSize: typography.size.sm,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  inviteSpotsTimeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  inviteSpotsCol: { flex: 1 },
  inviteTimeCol: { flex: 1.8 },
  inviteTimeBtn: { justifyContent: 'center' },
  inviteTimeText: { fontSize: typography.size.sm, color: colors.textPrimary },
  inviteTimePlaceholder: { fontSize: typography.size.sm, color: colors.textMuted },
  inviteErrorText: {
    fontSize: typography.size.xs,
    color: '#EF4444',
    marginTop: spacing.xs,
  },
  postInviteSubmitBtn: {
    flex: 1,
    padding: spacing.md,
    borderRadius: 10,
    backgroundColor: '#7C3AED',
    alignItems: 'center',
  },
});
