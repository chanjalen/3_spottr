import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { createCheckin } from '../../api/feed';
import { fetchMyGyms } from '../../api/gyms';
import { fetchRecentWorkouts } from '../../api/workouts';
import { GymListItem } from '../../types/gym';
import { RecentWorkout } from '../../types/workout';
import { colors, spacing, typography } from '../../theme';
import { RootStackParamList } from '../../navigation/types';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'QuickCheckin'>;
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

export default function QuickCheckinScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();

  // Compute the same aspect ratio used by the feed's photo card so the preview
  // shows exactly what will be visible above the nav bar in the immersive feed.
  const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
  const bottomNavHeight = 74 + Math.max(insets.bottom, 16);
  const feedPhotoAspectRatio = screenWidth / (screenHeight - bottomNavHeight);

  const [activity, setActivity] = useState('');
  const [description, setDescription] = useState('');
  const [photo, setPhoto] = useState<{ uri: string; name: string; type: string } | null>(null);
  const [gyms, setGyms] = useState<GymListItem[]>([]);
  const [selectedGymId, setSelectedGymId] = useState<string | null>(null);
  const [locationName, setLocationName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [recentWorkout, setRecentWorkout] = useState<RecentWorkout | null>(null);
  const [selectedWorkoutId, setSelectedWorkoutId] = useState<string | null>(null);

  useEffect(() => {
    fetchMyGyms()
      .then(setGyms)
      .catch(() => {});
    fetchRecentWorkouts()
      .then((workouts) => {
        const completed = workouts.find((w) => !w.is_active);
        if (completed) setRecentWorkout(completed);
      })
      .catch(() => {});
  }, []);

  const handlePickPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow access to your photos.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      // No allowsEditing / aspect — show the full photo as it will appear in the feed
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      const filename = asset.uri.split('/').pop() ?? 'photo.jpg';
      setPhoto({ uri: asset.uri, name: filename, type: 'image/jpeg' });
    }
  };

  const handleSubmit = async () => {
    if (!activity) {
      Alert.alert('Activity Required', 'Please select an activity type.');
      return;
    }
    setSubmitting(true);
    try {
      await createCheckin({
        activity,
        description: description.trim() || undefined,
        gymId: selectedGymId ?? undefined,
        locationName: locationName.trim() || undefined,
        photo: photo ?? undefined,
        workoutId: selectedWorkoutId ?? undefined,
      });
      navigation.goBack();
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? 'Could not post check-in.';
      Alert.alert('Error', msg);
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit = !!activity && !submitting;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background.base }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.headerBtn}>
          <Feather name="x" size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Quick Check-In</Text>
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
        contentContainerStyle={{ padding: spacing.base, gap: spacing.lg, paddingBottom: insets.bottom + 80 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Activity type */}
        <View>
          <Text style={styles.sectionLabel}>Activity Type *</Text>
          <View style={styles.activityGrid}>
            {ACTIVITY_TYPES.map((a) => (
              <Pressable
                key={a.type}
                style={[styles.activityChip, activity === a.type && styles.activityChipSelected]}
                onPress={() => setActivity(a.type)}
              >
                <Text style={styles.activityEmoji}>{a.emoji}</Text>
                <Text style={[styles.activityLabel, activity === a.type && styles.activityLabelSelected]}>
                  {a.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Caption */}
        <View>
          <Text style={styles.sectionLabel}>Caption (optional)</Text>
          <TextInput
            style={styles.textInput}
            placeholder="How was it? Add a note..."
            placeholderTextColor={colors.textMuted}
            value={description}
            onChangeText={setDescription}
            multiline
            maxLength={280}
          />
        </View>

        {/* Photo */}
        <View>
          <Text style={styles.sectionLabel}>Photo (optional)</Text>
          {photo ? (
            <View style={styles.photoPreviewWrap}>
              <Image
                source={{ uri: photo.uri }}
                style={[styles.photoPreview, { aspectRatio: feedPhotoAspectRatio }]}
                resizeMode="cover"
              />
              <Pressable style={styles.photoRemove} onPress={() => setPhoto(null)}>
                <Feather name="x" size={14} color="#fff" />
              </Pressable>
            </View>
          ) : (
            <Pressable style={styles.photoPickBtn} onPress={handlePickPhoto}>
              <Feather name="camera" size={20} color={colors.primary} />
              <Text style={styles.photoPickText}>Add Photo</Text>
            </Pressable>
          )}
        </View>

        {/* Logged Workout — shown when the user has a recently completed workout */}
        {recentWorkout && (
          <View>
            <Text style={styles.sectionLabel}>Attach Workout (optional)</Text>
            <Pressable
              style={({ pressed }) => [
                styles.workoutChip,
                selectedWorkoutId === recentWorkout.id && styles.workoutChipSelected,
                pressed && styles.workoutChipPressed,
              ]}
              onPress={() =>
                setSelectedWorkoutId((prev) =>
                  prev === recentWorkout.id ? null : recentWorkout.id,
                )
              }
              accessibilityRole="checkbox"
              accessibilityState={{ checked: selectedWorkoutId === recentWorkout.id }}
              accessibilityLabel={`Attach workout: ${recentWorkout.name}`}
            >
              <View style={[
                styles.workoutChipIcon,
                selectedWorkoutId === recentWorkout.id && styles.workoutChipIconSelected,
              ]}>
                <Feather
                  name="activity"
                  size={18}
                  color={selectedWorkoutId === recentWorkout.id ? colors.primary : colors.textMuted}
                />
              </View>
              <View style={styles.workoutChipInfo}>
                <Text style={styles.workoutChipName} numberOfLines={1}>
                  {recentWorkout.name}
                </Text>
                <Text style={styles.workoutChipMeta}>
                  {recentWorkout.exercise_count} exercises · {recentWorkout.duration} · {recentWorkout.time_ago}
                </Text>
              </View>
              <Feather
                name={selectedWorkoutId === recentWorkout.id ? 'check-circle' : 'circle'}
                size={20}
                color={selectedWorkoutId === recentWorkout.id ? colors.primary : colors.border.default}
              />
            </Pressable>
          </View>
        )}

        {/* Gym / Location */}
        <View>
          <Text style={styles.sectionLabel}>Location (optional)</Text>
          {gyms.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.sm }}>
              <View style={styles.gymRow}>
                {gyms.map((g) => (
                  <Pressable
                    key={g.id}
                    style={[styles.gymChip, selectedGymId === g.id && styles.gymChipSelected]}
                    onPress={() => {
                      if (selectedGymId === g.id) {
                        setSelectedGymId(null);
                        setLocationName('');
                      } else {
                        setSelectedGymId(g.id);
                        setLocationName(g.name);
                      }
                    }}
                  >
                    <Feather name="map-pin" size={12} color={selectedGymId === g.id ? colors.primary : colors.textMuted} />
                    <Text style={[styles.gymChipText, selectedGymId === g.id && styles.gymChipTextSelected]}>
                      {g.name}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
          )}
          {!selectedGymId && (
            <TextInput
              style={[styles.textInput, { paddingVertical: spacing.sm }]}
              placeholder="Or type a location..."
              placeholderTextColor={colors.textMuted}
              value={locationName}
              onChangeText={setLocationName}
            />
          )}
        </View>
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
    borderRadius: 20,
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

  activityGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  activityChip: {
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.border.default,
    backgroundColor: colors.surface,
    minWidth: 58,
  },
  activityChipSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + '15',
  },
  activityEmoji: { fontSize: 22 },
  activityLabel: { fontSize: 10, fontWeight: '500', color: colors.textSecondary },
  activityLabelSelected: { color: colors.primary, fontWeight: '700' },

  textInput: {
    backgroundColor: colors.background.elevated,
    borderRadius: 12,
    padding: spacing.md,
    fontSize: typography.size.base,
    color: colors.textPrimary,
    minHeight: 80,
    textAlignVertical: 'top',
  },

  photoPickBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.background.elevated,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.border.default,
    borderStyle: 'dashed',
    padding: spacing.lg,
    justifyContent: 'center',
  },
  photoPickText: { fontSize: typography.size.sm, fontWeight: '600', color: colors.primary },
  photoPreviewWrap: { position: 'relative', width: '100%' },
  photoPreview: {
    width: '100%',
    // aspectRatio is set inline at runtime to match the visible feed photo area
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  photoRemove: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 14,
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ─── Workout chip ───────────────────────────────────────────────────────────
  workoutChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.border.default,
    padding: spacing.md,
  },
  workoutChipSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + '0D',
  },
  workoutChipPressed: {
    opacity: 0.75,
  },
  workoutChipIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.background.elevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  workoutChipIconSelected: {
    backgroundColor: colors.primary + '18',
  },
  workoutChipInfo: {
    flex: 1,
  },
  workoutChipName: {
    fontSize: typography.size.base,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  workoutChipMeta: {
    fontSize: typography.size.sm,
    color: colors.textMuted,
    marginTop: 2,
  },

  gymRow: { flexDirection: 'row', gap: spacing.sm },
  gymChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: colors.border.default,
    backgroundColor: colors.surface,
  },
  gymChipSelected: { borderColor: colors.primary, backgroundColor: colors.primary + '15' },
  gymChipText: { fontSize: typography.size.sm, color: colors.textSecondary, fontWeight: '500' },
  gymChipTextSelected: { color: colors.primary, fontWeight: '700' },
});
