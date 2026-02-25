import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import * as ImagePicker from 'expo-image-picker';
import BottomSheet, { BottomSheetFlatList, BottomSheetBackdrop } from '@gorhom/bottom-sheet';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../../store/AuthContext';
import { createPost } from '../../api/feed';
import { fetchRecentWorkouts } from '../../api/workouts';
import { RecentWorkout } from '../../types/workout';
import { colors, spacing, typography } from '../../theme';
import { RootStackParamList } from '../../navigation/types';
import Avatar from '../../components/common/Avatar';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'CreatePost'>;
};

const PR_UNITS = ['lbs', 'kg', 'miles', 'km', 'mins', 'reps'];

export default function CreatePostScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [text, setText] = useState('');
  const [media, setMedia] = useState<{ uri: string; name: string; type: string; isVideo: boolean } | null>(null);
  const [attachedWorkout, setAttachedWorkout] = useState<RecentWorkout | null>(null);
  const [showPR, setShowPR] = useState(false);
  const [prExercise, setPrExercise] = useState('');
  const [prValue, setPrValue] = useState('');
  const [prUnit, setPrUnit] = useState('lbs');
  const [submitting, setSubmitting] = useState(false);

  // Workout picker sheet
  const workoutSheetRef = useRef<BottomSheet>(null);
  const [recentWorkouts, setRecentWorkouts] = useState<RecentWorkout[]>([]);
  const [workoutsLoading, setWorkoutsLoading] = useState(false);

  const hashtags = useMemo(() => {
    const matches = text.match(/#[\w\u0080-\uFFFF]+/g) ?? [];
    return [...new Set(matches)];
  }, [text]);

  const hasContent = text.trim().length > 0 || !!media || !!attachedWorkout || (showPR && prExercise && prValue);

  const handlePickMedia = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow access to your photos and videos.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsEditing: true,
      quality: 0.85,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      const filename = asset.uri.split('/').pop() ?? 'media';
      const isVideo = asset.type === 'video';
      const mimeType = isVideo
        ? (filename.toLowerCase().endsWith('.mov') ? 'video/quicktime' : 'video/mp4')
        : 'image/jpeg';
      setMedia({ uri: asset.uri, name: filename, type: mimeType, isVideo });
    }
  };

  const openWorkoutPicker = () => {
    if (recentWorkouts.length === 0) {
      setWorkoutsLoading(true);
      fetchRecentWorkouts()
        .then(setRecentWorkouts)
        .catch(() => {})
        .finally(() => setWorkoutsLoading(false));
    }
    workoutSheetRef.current?.expand();
  };

  const handleSelectWorkout = (workout: RecentWorkout) => {
    setAttachedWorkout(workout);
    workoutSheetRef.current?.close();
  };

  const handleSubmit = async () => {
    if (!hasContent) {
      Alert.alert('Nothing to post', 'Add some text, media, or a workout to share.');
      return;
    }
    setSubmitting(true);
    try {
      await createPost({
        text: text.trim() || undefined,
        photo: media && !media.isVideo ? { uri: media.uri, name: media.name, type: media.type } : undefined,
        video: media?.isVideo ? { uri: media.uri, name: media.name, type: media.type } : undefined,
        workoutId: attachedWorkout?.id,
        pr: showPR && prExercise.trim() && prValue.trim()
          ? { exerciseName: prExercise.trim(), value: prValue.trim(), unit: prUnit }
          : undefined,
      });
      navigation.goBack();
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? 'Could not create post.';
      Alert.alert('Error', msg);
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
        <Text style={styles.headerTitle}>New Post</Text>
        <Pressable
          style={[styles.postBtn, (!hasContent || submitting) && styles.postBtnDisabled]}
          onPress={handleSubmit}
          disabled={!hasContent || submitting}
        >
          {submitting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.postBtnText}>Post</Text>
          )}
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.base, gap: spacing.lg, paddingBottom: insets.bottom + 100 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Composer row */}
        <View style={styles.composerRow}>
          <Avatar uri={user?.avatar_url ?? null} name={user?.display_name ?? 'Me'} size={40} />
          <View style={{ flex: 1 }}>
            <Text style={styles.composerName}>{user?.display_name ?? ''}</Text>
            <TextInput
              style={styles.textInput}
              placeholder="What's on your mind? Use #hashtags to tag topics."
              placeholderTextColor={colors.textMuted}
              value={text}
              onChangeText={setText}
              multiline
              maxLength={500}
              autoFocus
            />
            <Text style={[styles.charCount, text.length > 450 && styles.charCountWarn]}>
              {text.length}/500
            </Text>
          </View>
        </View>

        {/* Hashtag chips */}
        {hashtags.length > 0 && (
          <View style={styles.hashtagRow}>
            {hashtags.map((tag) => (
              <View key={tag} style={styles.hashtagChip}>
                <Text style={styles.hashtagText}>{tag}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Media preview / picker */}
        {media ? (
          <View style={styles.mediaPreviewWrap}>
            <Image source={{ uri: media.uri }} style={styles.mediaPreview} resizeMode="cover" />
            {media.isVideo && (
              <View style={styles.videoOverlay}>
                <Feather name="play-circle" size={32} color="#fff" />
              </View>
            )}
            <Pressable style={styles.mediaRemove} onPress={() => setMedia(null)}>
              <Feather name="x" size={14} color="#fff" />
            </Pressable>
          </View>
        ) : (
          <Pressable style={styles.mediaPickBtn} onPress={handlePickMedia}>
            <Feather name="image" size={20} color={colors.primary} />
            <Text style={styles.mediaPickText}>Add Photo / Video</Text>
          </Pressable>
        )}

        {/* Tag a Workout */}
        {attachedWorkout ? (
          <WorkoutCard workout={attachedWorkout} onRemove={() => setAttachedWorkout(null)} />
        ) : (
          <Pressable style={styles.attachRow} onPress={openWorkoutPicker}>
            <View style={styles.attachIcon}>
              <Feather name="activity" size={18} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.attachLabel}>Tag a Workout</Text>
              <Text style={styles.attachSub}>Share a recap of a past session</Text>
            </View>
            <Feather name="chevron-right" size={18} color={colors.textMuted} />
          </Pressable>
        )}

        {/* PR / Milestone */}
        <Pressable
          style={styles.attachRow}
          onPress={() => setShowPR((v) => !v)}
        >
          <View style={styles.attachIcon}>
            <Feather name="award" size={18} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.attachLabel}>Add PR / Milestone</Text>
            <Text style={styles.attachSub}>Share a personal record</Text>
          </View>
          <Feather name={showPR ? 'chevron-up' : 'chevron-right'} size={18} color={colors.textMuted} />
        </Pressable>

        {showPR && (
          <View style={styles.prForm}>
            <TextInput
              style={styles.prInput}
              placeholder="Exercise name (e.g. Bench Press)"
              placeholderTextColor={colors.textMuted}
              value={prExercise}
              onChangeText={setPrExercise}
            />
            <View style={styles.prRow}>
              <TextInput
                style={[styles.prInput, { flex: 1 }]}
                placeholder="Value (e.g. 225)"
                placeholderTextColor={colors.textMuted}
                value={prValue}
                onChangeText={setPrValue}
                keyboardType="decimal-pad"
              />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.unitScroll}>
                <View style={styles.unitRow}>
                  {PR_UNITS.map((u) => (
                    <Pressable
                      key={u}
                      style={[styles.unitChip, prUnit === u && styles.unitChipSelected]}
                      onPress={() => setPrUnit(u)}
                    >
                      <Text style={[styles.unitText, prUnit === u && styles.unitTextSelected]}>{u}</Text>
                    </Pressable>
                  ))}
                </View>
              </ScrollView>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Workout Picker Bottom Sheet */}
      <BottomSheet
        ref={workoutSheetRef}
        index={-1}
        snapPoints={['55%']}
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        backgroundStyle={styles.sheetBg}
        handleIndicatorStyle={styles.sheetHandle}
      >
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>Recent Workouts</Text>
        </View>
        {workoutsLoading ? (
          <View style={styles.sheetCenter}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : recentWorkouts.length === 0 ? (
          <View style={styles.sheetCenter}>
            <Feather name="activity" size={32} color={colors.textMuted} />
            <Text style={styles.sheetEmpty}>No past workouts found</Text>
          </View>
        ) : (
          <BottomSheetFlatList
            data={recentWorkouts}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <Pressable
                style={({ pressed }) => [styles.workoutRow, pressed && { opacity: 0.7 }]}
                onPress={() => handleSelectWorkout(item)}
              >
                <View style={styles.workoutRowIcon}>
                  <Feather name="activity" size={18} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.workoutRowName} numberOfLines={1}>{item.name}</Text>
                  <Text style={styles.workoutRowMeta}>
                    {item.exercise_count} exercise{item.exercise_count !== 1 ? 's' : ''} · {item.duration} · {formatDate(item.started_at)}
                  </Text>
                </View>
                <Feather name="plus-circle" size={20} color={colors.primary} />
              </Pressable>
            )}
            ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: colors.border.subtle, marginLeft: 56 }} />}
          />
        )}
      </BottomSheet>
    </KeyboardAvoidingView>
  );
}

// ─── Workout Card ─────────────────────────────────────────────────────────────

function WorkoutCard({ workout, onRemove }: { workout: RecentWorkout; onRemove: () => void }) {
  return (
    <View style={styles.workoutCard}>
      <View style={styles.workoutCardLeft}>
        <View style={styles.workoutCardIcon}>
          <Feather name="activity" size={18} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.workoutCardName} numberOfLines={1}>{workout.name}</Text>
          <Text style={styles.workoutCardMeta}>
            {workout.exercise_count} exercise{workout.exercise_count !== 1 ? 's' : ''} · {workout.duration}
          </Text>
        </View>
      </View>
      <Pressable onPress={onRemove} hitSlop={8}>
        <Feather name="x" size={18} color={colors.textMuted} />
      </Pressable>
    </View>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// ─── Styles ───────────────────────────────────────────────────────────────────

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
  headerBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: typography.size.base, fontWeight: '700', color: colors.textPrimary },
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

  composerRow: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'flex-start',
  },
  composerName: {
    fontSize: typography.size.sm,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  textInput: {
    fontSize: typography.size.base,
    color: colors.textPrimary,
    minHeight: 100,
    textAlignVertical: 'top',
    lineHeight: 22,
  },
  charCount: {
    fontSize: typography.size.xs,
    color: colors.textMuted,
    textAlign: 'right',
    marginTop: 4,
  },
  charCountWarn: { color: colors.warning },

  hashtagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  hashtagChip: {
    backgroundColor: colors.primary + '18',
    borderRadius: 12,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  hashtagText: { fontSize: typography.size.xs, color: colors.primary, fontWeight: '600' },

  mediaPickBtn: {
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
  mediaPickText: { fontSize: typography.size.sm, fontWeight: '600', color: colors.primary },
  mediaPreviewWrap: { position: 'relative', borderRadius: 12, overflow: 'hidden' },
  mediaPreview: { width: '100%', height: 200, borderRadius: 12 },
  videoOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  mediaRemove: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 12,
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },

  attachRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.background.elevated,
    borderRadius: 14,
    padding: spacing.md,
  },
  attachIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: colors.primary + '18',
    alignItems: 'center',
    justifyContent: 'center',
  },
  attachLabel: { fontSize: typography.size.base, fontWeight: '600', color: colors.textPrimary },
  attachSub: { fontSize: typography.size.xs, color: colors.textMuted, marginTop: 2 },

  prForm: {
    backgroundColor: colors.background.elevated,
    borderRadius: 14,
    padding: spacing.md,
    gap: spacing.sm,
  },
  prInput: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: spacing.md,
    fontSize: typography.size.base,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  prRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  unitScroll: { flex: 1 },
  unitRow: { flexDirection: 'row', gap: spacing.xs },
  unitChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: colors.border.default,
    backgroundColor: colors.surface,
  },
  unitChipSelected: { borderColor: colors.primary, backgroundColor: colors.primary + '15' },
  unitText: { fontSize: typography.size.xs, color: colors.textSecondary, fontWeight: '500' },
  unitTextSelected: { color: colors.primary, fontWeight: '700' },

  workoutCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.primary + '0F',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.primary + '40',
    padding: spacing.md,
  },
  workoutCardLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flex: 1 },
  workoutCardIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.primary + '20',
    alignItems: 'center',
    justifyContent: 'center',
  },
  workoutCardName: { fontSize: typography.size.sm, fontWeight: '700', color: colors.textPrimary },
  workoutCardMeta: { fontSize: typography.size.xs, color: colors.textSecondary, marginTop: 2 },

  // Workout picker sheet
  sheetBg: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.1, shadowRadius: 20 },
      android: { elevation: 10 },
    }),
  },
  sheetHandle: { backgroundColor: colors.borderColor, width: 36 },
  sheetHeader: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  sheetTitle: { fontSize: typography.size.base, fontWeight: '700', color: colors.textPrimary },
  sheetCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl },
  sheetEmpty: { fontSize: typography.size.base, color: colors.textMuted },
  workoutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  workoutRowIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.primary + '18',
    alignItems: 'center',
    justifyContent: 'center',
  },
  workoutRowName: { fontSize: typography.size.base, fontWeight: '600', color: colors.textPrimary },
  workoutRowMeta: { fontSize: typography.size.xs, color: colors.textMuted, marginTop: 2 },
});
