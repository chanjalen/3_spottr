import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
  Image,
  Alert,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../../navigation/types';
import { colors, spacing, typography } from '../../theme';
import { createCheckin } from '../../api/feed';
import { fetchMyGyms } from '../../api/gyms';
import { fetchRecentWorkouts } from '../../api/workouts';
import { GymListItem } from '../../types/gym';
import { RecentWorkout } from '../../types/workout';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'CheckInReview'>;
  route: RouteProp<RootStackParamList, 'CheckInReview'>;
};

const ACTIVITY_TYPES = [
  { type: 'strength_training', emoji: '💪', label: 'Strength' },
  { type: 'cardio', emoji: '🏃', label: 'Cardio' },
  { type: 'hiit', emoji: '🔥', label: 'HIIT' },
  { type: 'yoga', emoji: '🧘', label: 'Yoga' },
  { type: 'cycling', emoji: '🚴', label: 'Cycling' },
  { type: 'swimming', emoji: '🏊', label: 'Swimming' },
  { type: 'boxing', emoji: '🥊', label: 'Boxing' },
  { type: 'stretching', emoji: '🤸', label: 'Stretch' },
  { type: 'sports', emoji: '⚽', label: 'Sports' },
  { type: 'hiking', emoji: '🥾', label: 'Hiking' },
  { type: 'other', emoji: '🏅', label: 'Other' },
] as const;

export default function CheckInReviewScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { mediaUri, mediaType } = route.params;

  const [activity, setActivity] = useState('');
  const [description, setDescription] = useState('');
  const [gyms, setGyms] = useState<GymListItem[]>([]);
  const [selectedGymId, setSelectedGymId] = useState<string | null>(null);
  const [otherSelected, setOtherSelected] = useState(false);
  const [customLocation, setCustomLocation] = useState('');
  const [attachedWorkout, setAttachedWorkout] = useState<RecentWorkout | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Only auto-attach when explicitly returning from WorkoutLog
  const navigatedToWorkoutRef = useRef(false);

  useEffect(() => {
    fetchMyGyms().then(setGyms).catch(() => {});
  }, []);

  // When returning from WorkoutLog, auto-attach the newest completed workout
  useEffect(() => {
    const unsub = navigation.addListener('focus', async () => {
      if (!navigatedToWorkoutRef.current) return;
      navigatedToWorkoutRef.current = false;
      try {
        const workouts = await fetchRecentWorkouts();
        const completed = workouts.filter((w) => !w.is_active);
        if (completed.length > 0) {
          const newest = completed[0];
          const startedMs = new Date(newest.started_at).getTime();
          // Auto-attach if workout finished within the last 5 minutes
          if (Date.now() - startedMs < 5 * 60 * 1000) {
            setAttachedWorkout(newest);
          }
        }
      } catch {
        // Non-fatal
      }
    });
    return unsub;
  }, [navigation]);

  const handleGymSelect = (gymId: string) => {
    if (selectedGymId === gymId) {
      setSelectedGymId(null);
    } else {
      setSelectedGymId(gymId);
      setOtherSelected(false);
      setCustomLocation('');
    }
  };

  const handleOtherSelect = () => {
    setOtherSelected(!otherSelected);
    setSelectedGymId(null);
    if (otherSelected) setCustomLocation('');
  };

  const handleLogFullWorkout = () => {
    navigatedToWorkoutRef.current = true;
    navigation.navigate('WorkoutLog', { fromCheckin: true });
  };

  const locationValid =
    !!selectedGymId || (otherSelected && customLocation.trim().length > 0);

  const canSubmit = !!activity && locationValid && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);

    const filename = mediaUri.split('/').pop() ?? (mediaType === 'video' ? 'video.mp4' : 'photo.jpg');
    const mimeType = mediaType === 'video' ? 'video/mp4' : 'image/jpeg';

    try {
      await createCheckin({
        gymId: selectedGymId ?? undefined,
        locationName: otherSelected ? customLocation.trim() : undefined,
        activity,
        description: description.trim() || undefined,
        [mediaType === 'video' ? 'video' : 'photo']: {
          uri: mediaUri,
          name: filename,
          type: mimeType,
        },
        workoutId: attachedWorkout?.id,
      });
      // Pop the full check-in stack (CameraCapture + CheckInReview) back to tabs
      navigation.popToTop();
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? 'Could not post check-in.';
      Alert.alert('Error', msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background.base }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.headerBtn} hitSlop={8}>
          <Feather name="chevron-left" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Your Check-In</Text>
        <Pressable
          style={[styles.postBtn, !canSubmit && styles.postBtnDisabled]}
          onPress={handleSubmit}
          disabled={!canSubmit}
        >
          {submitting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.postBtnText}>Post</Text>
          )}
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: spacing.base,
          gap: spacing.lg,
          paddingBottom: insets.bottom + 100,
        }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Media Preview */}
        <View style={styles.mediaWrap}>
          <Image
            source={{ uri: mediaUri }}
            style={styles.mediaPreview}
            resizeMode="cover"
          />
          {mediaType === 'video' && (
            <View style={styles.videoOverlay}>
              <Feather name="film" size={14} color="#fff" />
              <Text style={styles.videoLabel}>Video</Text>
            </View>
          )}
          <Pressable style={styles.retakeBtn} onPress={() => navigation.goBack()}>
            <Feather name="camera" size={13} color="#fff" />
            <Text style={styles.retakeBtnText}>Retake</Text>
          </Pressable>
        </View>

        {/* Activity Type */}
        <View>
          <Text style={styles.sectionLabel}>
            Workout Type <Text style={styles.required}>*</Text>
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.chipRow}>
              {ACTIVITY_TYPES.map((a) => (
                <Pressable
                  key={a.type}
                  style={[styles.activityChip, activity === a.type && styles.chipSelected]}
                  onPress={() => setActivity(a.type)}
                >
                  <Text style={styles.activityEmoji}>{a.emoji}</Text>
                  <Text style={[styles.chipLabel, activity === a.type && styles.chipLabelSelected]}>
                    {a.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
        </View>

        {/* Location — flat chip list: enrolled gyms + Other */}
        <View>
          <Text style={styles.sectionLabel}>
            Location <Text style={styles.required}>*</Text>
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.chipRow}>
              {gyms.map((g) => (
                <Pressable
                  key={g.id}
                  style={[styles.locationChip, selectedGymId === g.id && styles.chipSelected]}
                  onPress={() => handleGymSelect(g.id)}
                >
                  <Feather
                    name="map-pin"
                    size={13}
                    color={selectedGymId === g.id ? colors.primary : colors.textMuted}
                  />
                  <Text style={[styles.chipLabel, selectedGymId === g.id && styles.chipLabelSelected]}>
                    {g.name}
                  </Text>
                </Pressable>
              ))}
              {/* Other chip always at end */}
              <Pressable
                style={[styles.locationChip, otherSelected && styles.chipSelected]}
                onPress={handleOtherSelect}
              >
                <Feather
                  name="edit-3"
                  size={13}
                  color={otherSelected ? colors.primary : colors.textMuted}
                />
                <Text style={[styles.chipLabel, otherSelected && styles.chipLabelSelected]}>
                  Other
                </Text>
              </Pressable>
            </View>
          </ScrollView>

          {otherSelected && (
            <TextInput
              style={[styles.textInput, { marginTop: spacing.sm, minHeight: 0, paddingVertical: spacing.sm }]}
              placeholder="Where are you? (e.g. Home, Park, Hotel gym)"
              placeholderTextColor={colors.textMuted}
              value={customLocation}
              onChangeText={setCustomLocation}
              maxLength={100}
              autoFocus
            />
          )}
        </View>

        {/* Caption */}
        <View>
          <Text style={styles.sectionLabel}>Caption (optional)</Text>
          <TextInput
            style={styles.textInput}
            placeholder="How was it?"
            placeholderTextColor={colors.textMuted}
            value={description}
            onChangeText={setDescription}
            multiline
            maxLength={280}
          />
        </View>

        {/* Attached Workout */}
        {attachedWorkout ? (
          <View style={styles.attachedCard}>
            <View style={styles.attachedInfo}>
              <Feather name="activity" size={16} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.attachedName}>{attachedWorkout.name}</Text>
                <Text style={styles.attachedMeta}>
                  {attachedWorkout.duration} · {attachedWorkout.exercise_count} exercises · {attachedWorkout.time_ago}
                </Text>
              </View>
            </View>
            <Pressable onPress={() => setAttachedWorkout(null)} hitSlop={8}>
              <Feather name="x" size={18} color={colors.textMuted} />
            </Pressable>
          </View>
        ) : (
          /* Log Full Workout — big prominent button */
          <Pressable
            style={({ pressed }) => [styles.logWorkoutBtn, pressed && styles.logWorkoutBtnPressed]}
            onPress={handleLogFullWorkout}
          >
            <LinearGradient
              colors={['#4FC3E0', '#2FA4C7']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.logWorkoutGradient}
            >
              <Feather name="plus-circle" size={22} color="#fff" />
              <View>
                <Text style={styles.logWorkoutTitle}>Log Full Workout</Text>
                <Text style={styles.logWorkoutSub}>Track exercises, sets & reps</Text>
              </View>
              <Feather name="chevron-right" size={20} color="rgba(255,255,255,0.75)" />
            </LinearGradient>
          </Pressable>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  headerBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: typography.size.base,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  postBtn: {
    backgroundColor: colors.primary,
    borderRadius: 20,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    minWidth: 60,
    alignItems: 'center',
  },
  postBtnDisabled: { opacity: 0.4 },
  postBtnText: { fontSize: typography.size.sm, fontWeight: '700', color: '#fff' },

  sectionLabel: {
    fontSize: typography.size.sm,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  required: { color: '#EF4444' },

  mediaWrap: {
    position: 'relative',
    borderRadius: 16,
    overflow: 'hidden',
  },
  mediaPreview: {
    width: '100%',
    aspectRatio: 4 / 3,
    backgroundColor: colors.surface,
  },
  videoOverlay: {
    position: 'absolute',
    top: 10,
    left: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  videoLabel: { fontSize: 12, color: '#fff', fontWeight: '600' },
  retakeBtn: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  retakeBtnText: { fontSize: 12, color: '#fff', fontWeight: '600' },

  chipRow: { flexDirection: 'row', gap: spacing.sm },

  activityChip: {
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.border.default,
    backgroundColor: colors.surface,
    minWidth: 62,
  },
  activityEmoji: { fontSize: 22 },

  locationChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: colors.border.default,
    backgroundColor: colors.surface,
  },

  chipSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + '15',
  },
  chipLabel: {
    fontSize: typography.size.sm,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  chipLabelSelected: {
    color: colors.primary,
    fontWeight: '700',
  },

  textInput: {
    backgroundColor: colors.background.elevated,
    borderRadius: 12,
    padding: spacing.md,
    fontSize: typography.size.base,
    color: colors.textPrimary,
    minHeight: 72,
    textAlignVertical: 'top',
  },

  attachedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.background.elevated,
    borderRadius: 12,
    padding: spacing.md,
    borderWidth: 1.5,
    borderColor: colors.primary + '40',
  },
  attachedInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  attachedName: {
    fontSize: typography.size.sm,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  attachedMeta: {
    fontSize: typography.size.xs,
    color: colors.textMuted,
    marginTop: 2,
  },

  logWorkoutBtn: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  logWorkoutBtnPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  logWorkoutGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  logWorkoutTitle: {
    fontSize: typography.size.base,
    fontWeight: '700',
    color: '#fff',
  },
  logWorkoutSub: {
    fontSize: typography.size.xs,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 2,
  },
});
