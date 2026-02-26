import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
  Image,
  TextInput,
} from 'react-native';
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { colors, spacing, typography } from '../../theme';
import { fetchMyGyms } from '../../api/gyms';
import { createCheckin } from '../../api/feed';
import type { GymListItem } from '../../types/gym';

const ACTIVITY_TYPES: Array<{ label: string; value: string; emoji: string }> = [
  { label: 'Back Day',   value: 'back_day',   emoji: '🏋️' },
  { label: 'Leg Day',    value: 'leg_day',    emoji: '🦵' },
  { label: 'Arms',       value: 'arms',       emoji: '💪' },
  { label: 'Chest',      value: 'chest_day',  emoji: '🫁' },
  { label: 'Cardio',     value: 'cardio',     emoji: '🏃' },
  { label: 'Basketball', value: 'basketball', emoji: '🏀' },
  { label: 'Swimming',   value: 'swimming',   emoji: '🏊' },
  { label: 'Other',      value: 'other',      emoji: '✨' },
];

interface SelectedPhoto {
  uri: string;
  name: string;
  type: string;
}

interface Props {
  sheetRef: React.RefObject<BottomSheet>;
  onSuccess?: () => void;
}

export default function CheckInSheet({ sheetRef, onSuccess }: Props) {
  const [gyms, setGyms] = useState<GymListItem[]>([]);
  const [loadingGyms, setLoadingGyms] = useState(false);
  const [selectedGymId, setSelectedGymId] = useState<string | null>(null);
  const [selectedActivity, setSelectedActivity] = useState<string | null>(null);
  const [photo, setPhoto] = useState<SelectedPhoto | null>(null);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadGyms = useCallback(async () => {
    setLoadingGyms(true);
    try {
      const data = await fetchMyGyms();
      setGyms(data);
    } catch {
      // show empty state
    } finally {
      setLoadingGyms(false);
    }
  }, []);

  // Reset everything and load gyms each time the sheet opens
  const handleSheetChange = useCallback(
    (index: number) => {
      if (index === 0) {
        setSelectedGymId(null);
        setSelectedActivity(null);
        setPhoto(null);
        setComment('');
        loadGyms();
      }
    },
    [loadGyms],
  );

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Please allow camera access to take a photo.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: 'images',
      allowsEditing: false, // full-screen, no crop
      quality: 0.9,
    });
    if (!result.canceled && result.assets.length > 0) {
      const asset = result.assets[0];
      setPhoto({
        uri: asset.uri,
        name: 'checkin.jpg',
        type: 'image/jpeg',
      });
    }
  };

  const handleSubmit = async () => {
    if (!photo || submitting) return;
    setSubmitting(true);
    try {
      await createCheckin({
        gymId: selectedGymId ?? undefined,
        activity: selectedActivity ?? undefined,
        description: comment.trim() || undefined,
        photo,
      });
      sheetRef.current?.close();
      onSuccess?.();
    } catch (e: any) {
      const status = e?.response?.status;
      const serverMsg = e?.response?.data?.error;
      const msg = serverMsg
        ?? (status ? `Server error (${status}). Please try again.` : 'Network error. Check your connection.');
      Alert.alert('Check-In Failed', msg);
    } finally {
      setSubmitting(false);
    }
  };

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} opacity={0.4} />
    ),
    [],
  );

  // Photo is the only required field
  const canSubmit = !!photo && !submitting;

  return (
    <BottomSheet
      ref={sheetRef}
      index={-1}
      snapPoints={['85%']}
      enablePanDownToClose
      backdropComponent={renderBackdrop}
      handleIndicatorStyle={styles.handle}
      backgroundStyle={styles.sheetBg}
      onChange={handleSheetChange}
    >
      <BottomSheetScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Quick Check-In</Text>

        {/* ── Photo (required — top of form) ─────────────── */}
        {photo ? (
          <View style={styles.photoPreviewWrap}>
            <Image source={{ uri: photo.uri }} style={styles.photoPreview} resizeMode="cover" />
            <Pressable
              style={styles.photoRemoveBtn}
              onPress={() => setPhoto(null)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Feather name="x" size={15} color="#fff" />
            </Pressable>
            <Pressable style={styles.photoRetakeBtn} onPress={takePhoto}>
              <Feather name="camera" size={14} color="#fff" />
              <Text style={styles.photoRetakeText}>Retake</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable style={styles.cameraBtn} onPress={takePhoto}>
            <Feather name="camera" size={32} color={colors.primary} />
            <Text style={styles.cameraBtnTitle}>Take a Photo</Text>
            <Text style={styles.cameraBtnSub}>Required to check in</Text>
          </Pressable>
        )}

        {/* ── Optional: Gym selection ────────────────────── */}
        <Text style={[styles.sectionLabel, styles.sectionLabelSpaced]}>
          Gym <Text style={styles.optional}>(optional)</Text>
        </Text>
        {loadingGyms ? (
          <ActivityIndicator size="small" color={colors.primary} style={styles.loader} />
        ) : gyms.length === 0 ? (
          <View style={styles.emptyState}>
            <Feather name="map-pin" size={14} color={colors.textMuted} />
            <Text style={styles.emptyStateText}>No enrolled gyms — visit the Gyms tab to join one.</Text>
          </View>
        ) : (
          <View style={styles.chipRow}>
            {gyms.map((gym) => {
              const selected = selectedGymId === gym.id;
              return (
                <Pressable
                  key={gym.id}
                  style={[styles.chip, selected && styles.chipSelected]}
                  onPress={() => setSelectedGymId(selected ? null : gym.id)}
                >
                  <Feather name="map-pin" size={12} color={selected ? colors.primary : colors.textMuted} />
                  <Text style={[styles.chipText, selected && styles.chipTextSelected]} numberOfLines={1}>
                    {gym.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}

        {/* ── Optional: Activity type ────────────────────── */}
        <Text style={[styles.sectionLabel, styles.sectionLabelSpaced]}>
          Activity <Text style={styles.optional}>(optional)</Text>
        </Text>
        <View style={styles.chipRow}>
          {ACTIVITY_TYPES.map((type) => {
            const selected = selectedActivity === type.value;
            return (
              <Pressable
                key={type.value}
                style={[styles.chip, selected && styles.chipSelected]}
                onPress={() => setSelectedActivity(selected ? null : type.value)}
              >
                <Text style={styles.activityEmoji}>{type.emoji}</Text>
                <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                  {type.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* ── Optional: Comment ──────────────────────────── */}
        <Text style={[styles.sectionLabel, styles.sectionLabelSpaced]}>
          Comment <Text style={styles.optional}>(optional)</Text>
        </Text>
        <TextInput
          style={styles.commentInput}
          value={comment}
          onChangeText={setComment}
          placeholder="How's the session going?"
          placeholderTextColor={colors.textMuted}
          multiline
          maxLength={280}
          returnKeyType="done"
          blurOnSubmit
        />

        {/* ── Visibility note ───────────────────────────── */}
        <View style={styles.visibilityNote}>
          <Feather name="users" size={13} color={colors.textMuted} />
          <Text style={styles.visibilityNoteText}>Posts to your Following feed only</Text>
        </View>

        {/* ── Submit ────────────────────────────────────── */}
        <Pressable
          style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={!canSubmit}
        >
          {submitting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Feather name="check-circle" size={18} color="#fff" />
              <Text style={styles.submitBtnText}>Check In</Text>
            </>
          )}
        </Pressable>
      </BottomSheetScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  sheetBg: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.1, shadowRadius: 20 },
      android: { elevation: 10 },
    }),
  },
  handle: { backgroundColor: colors.borderColor, width: 36 },
  content: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing['2xl'],
  },
  title: {
    fontSize: typography.size.lg,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.xl,
  },

  // Camera button (no photo yet)
  cameraBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    height: 180,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: colors.primary,
    borderStyle: 'dashed',
    backgroundColor: 'rgba(79,195,224,0.05)',
  },
  cameraBtnTitle: {
    fontSize: typography.size.base,
    fontWeight: '700',
    color: colors.primary,
  },
  cameraBtnSub: {
    fontSize: typography.size.xs,
    color: colors.textMuted,
  },

  // Photo preview
  photoPreviewWrap: {
    position: 'relative',
    borderRadius: 20,
    overflow: 'hidden',
    height: 220,
  },
  photoPreview: { width: '100%', height: '100%' },
  photoRemoveBtn: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoRetakeBtn: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: 9999,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  photoRetakeText: {
    fontSize: typography.size.xs,
    fontWeight: '600',
    color: '#fff',
  },

  // Section labels
  sectionLabel: {
    fontSize: typography.size.xs,
    fontWeight: '600',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: spacing.sm,
  },
  sectionLabelSpaced: { marginTop: spacing.xl },
  optional: {
    fontSize: typography.size.xs,
    fontWeight: '400',
    color: colors.textMuted,
    textTransform: 'none',
    letterSpacing: 0,
  },

  loader: { marginVertical: spacing.base },

  emptyState: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.background.elevated,
    borderRadius: 12,
  },
  emptyStateText: { flex: 1, fontSize: typography.size.sm, color: colors.textMuted },

  // Chips (gym + activity share the same style)
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 9999,
    borderWidth: 1.5,
    borderColor: colors.borderColor,
    backgroundColor: colors.background.elevated,
  },
  chipSelected: { borderColor: colors.primary, backgroundColor: 'rgba(79,195,224,0.1)' },
  chipText: { fontSize: typography.size.sm, fontWeight: '500', color: colors.textSecondary, maxWidth: 160 },
  chipTextSelected: { color: colors.primary, fontWeight: '600' },
  activityEmoji: { fontSize: 14 },

  // Comment
  commentInput: {
    backgroundColor: colors.background.elevated,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.borderColor,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: typography.size.sm,
    color: colors.textPrimary,
    minHeight: 72,
    textAlignVertical: 'top',
  },

  // Visibility note
  visibilityNote: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.base },
  visibilityNoteText: { fontSize: typography.size.xs, color: colors.textMuted },

  // Submit
  submitBtn: {
    marginTop: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: 9999,
    paddingVertical: spacing.base,
    ...Platform.select({
      ios: { shadowColor: 'rgba(79,195,224,0.5)', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 1, shadowRadius: 16 },
      android: { elevation: 6 },
    }),
  },
  submitBtnDisabled: {
    backgroundColor: colors.borderColor,
    ...Platform.select({ ios: { shadowOpacity: 0 }, android: { elevation: 0 } }),
  },
  submitBtnText: { fontSize: typography.size.base, fontWeight: '700', color: '#fff' },
});
