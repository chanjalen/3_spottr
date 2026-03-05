import React, { useCallback, useMemo, useRef, useState } from 'react';
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
import { pickMedia } from '../../utils/pickMedia';
import BottomSheet, { BottomSheetFlatList, BottomSheetBackdrop } from '@gorhom/bottom-sheet';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../../store/AuthContext';
import { createPost } from '../../api/feed';
import { emitFeedRefresh } from '../../utils/feedEvents';
import { fetchRecentWorkouts } from '../../api/workouts';
import { RecentWorkout } from '../../types/workout';
import { colors, spacing, typography } from '../../theme';
import { RootStackParamList } from '../../navigation/types';
import Avatar from '../../components/common/Avatar';
import MediaViewerModal from '../../components/feed/MediaViewerModal';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'CreatePost'>;
};

const PR_UNITS = ['lbs', 'kg', 'miles', 'km', 'mins', 'reps'];

const POLL_DURATIONS: Array<{ label: string; hours: number }> = [
  { label: '1h',  hours: 1 },
  { label: '6h',  hours: 6 },
  { label: '24h', hours: 24 },
  { label: '3d',  hours: 72 },
  { label: '7d',  hours: 168 },
];

export default function CreatePostScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  // Text
  const [text, setText] = useState('');

  // Media — photos array (up to 10) and optional single video (mutually exclusive)
  type PhotoItem = { uri: string; name: string; type: string };
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [video, setVideo] = useState<PhotoItem | null>(null);
  const [previewViewerIndex, setPreviewViewerIndex] = useState<number | null>(null);
  const MAX_PHOTOS = 10;

  // Workout
  const [attachedWorkout, setAttachedWorkout] = useState<RecentWorkout | null>(null);
  const workoutSheetRef = useRef<BottomSheet>(null);
  const [recentWorkouts, setRecentWorkouts] = useState<RecentWorkout[]>([]);
  const [workoutsLoading, setWorkoutsLoading] = useState(false);

  // PR
  const [showPR, setShowPR] = useState(false);
  const [prExercise, setPrExercise] = useState('');
  const [prValue, setPrValue] = useState('');
  const [prUnit, setPrUnit] = useState('lbs');

  // Poll
  const [showPoll, setShowPoll] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState(['', '']);
  const [pollDuration, setPollDuration] = useState(24);

  const [submitting, setSubmitting] = useState(false);

  const hashtags = useMemo(() => {
    const matches = text.match(/#[\w\u0080-\uFFFF]+/g) ?? [];
    return [...new Set(matches)];
  }, [text]);

  const validPollOptions = pollOptions.filter(o => o.trim().length > 0);
  const hasPoll = showPoll && pollQuestion.trim().length > 0 && validPollOptions.length >= 2;
  const hasContent =
    text.trim().length > 0 ||
    photos.length > 0 ||
    !!video ||
    !!attachedWorkout ||
    (showPR && prExercise.trim() && prValue.trim()) ||
    hasPoll;

  // ── Media picker ─────────────────────────────────────────────────────────────

  const handlePickMedia = async () => {
    // If we already have photos and there's room, only allow picking more photos (no video)
    const addingToExisting = photos.length > 0;

    const picked = await pickMedia({
      allowsMultiple: false,
      mediaTypes: addingToExisting ? ['images'] : ['images', 'videos'],
    });
    if (!picked) return;

    const asset = picked[0];
    if (asset.kind === 'video') {
      // Video clears any existing photos
      setPhotos([]);
      setVideo({ uri: asset.uri, name: asset.filename, type: asset.mimeType });
    } else {
      // Photo — clear video, add to photos array (up to MAX_PHOTOS)
      setVideo(null);
      setPhotos(prev => {
        if (prev.length >= MAX_PHOTOS) return prev;
        return [...prev, { uri: asset.uri, name: asset.filename, type: asset.mimeType }];
      });
    }
  };

  // ── Workout picker ────────────────────────────────────────────────────────────

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

  // ── Poll helpers ──────────────────────────────────────────────────────────────

  const updatePollOption = (index: number, value: string) => {
    const next = [...pollOptions];
    next[index] = value;
    setPollOptions(next);
  };

  const removePollOption = (index: number) => {
    setPollOptions(pollOptions.filter((_, i) => i !== index));
  };

  const togglePoll = () => {
    setShowPoll(v => !v);
    if (showPoll) {
      // Reset poll when closing
      setPollQuestion('');
      setPollOptions(['', '']);
      setPollDuration(24);
    }
  };

  // ── Submit ────────────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    if (!hasContent) {
      Alert.alert('Nothing to post', 'Add some text, media, a poll, or a workout to share.');
      return;
    }
    // Only block for an incomplete poll when it's the only content being added.
    // If the user also has text, media, a workout, or a PR, proceed and simply
    // omit the incomplete poll (hasPoll will be false → poll: undefined is sent).
    const hasNonPollContent =
      text.trim().length > 0 ||
      photos.length > 0 ||
      !!video ||
      !!attachedWorkout ||
      (showPR && prExercise.trim() && prValue.trim());
    if (showPoll && pollQuestion.trim() && validPollOptions.length < 2 && !hasNonPollContent) {
      Alert.alert('Poll incomplete', 'Add at least 2 options to your poll.');
      return;
    }
    setSubmitting(true);
    try {
      await createPost({
        text: text.trim() || undefined,
        photos: photos.length > 0 ? photos : undefined,
        video: video ?? undefined,
        workoutId: attachedWorkout?.id,
        pr: showPR && prExercise.trim() && prValue.trim()
          ? { exerciseName: prExercise.trim(), value: prValue.trim(), unit: prUnit }
          : undefined,
        poll: hasPoll
          ? { question: pollQuestion.trim(), options: validPollOptions, duration: pollDuration }
          : undefined,
      });
      emitFeedRefresh(); // signal FeedScreen to reload before navigating back
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

  // ── Render ────────────────────────────────────────────────────────────────────

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
        contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Composer row */}
        <View style={styles.composerRow}>
          <Avatar uri={user?.avatar_url ?? null} name={user?.display_name ?? 'Me'} size={42} />
          <View style={{ flex: 1 }}>
            <Text style={styles.composerName}>{user?.display_name ?? ''}</Text>
            <TextInput
              style={styles.textInput}
              placeholder="What's happening?"
              placeholderTextColor={colors.textMuted}
              value={text}
              onChangeText={setText}
              multiline
              maxLength={500}
              autoFocus
            />
            {text.length > 0 && (
              <Text style={[styles.charCount, text.length > 450 && styles.charCountWarn]}>
                {text.length}/500
              </Text>
            )}
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

        {/* ── Media preview strip ────────────────────────────────────── */}
        {(photos.length > 0 || video) && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.mediaStrip}
            contentContainerStyle={styles.mediaStripContent}
          >
            {photos.map((p, i) => (
              <View key={p.uri + i} style={styles.mediaTile}>
                <Pressable onPress={() => setPreviewViewerIndex(i)}>
                  <Image source={{ uri: p.uri }} style={styles.mediaTileImg} resizeMode="cover" />
                </Pressable>
                <Pressable
                  style={styles.mediaTileRemove}
                  onPress={() => setPhotos(prev => prev.filter((_, idx) => idx !== i))}
                >
                  <Feather name="x" size={11} color="#fff" />
                </Pressable>
              </View>
            ))}
            {video && (
              <View style={styles.mediaTile}>
                <Pressable style={styles.mediaTileInner} onPress={() => setPreviewViewerIndex(-1)}>
                  <View style={styles.videoTileBg}>
                    <Feather name="video" size={22} color="#fff" />
                    <Text style={styles.videoTileLabel}>Video</Text>
                  </View>
                </Pressable>
                <Pressable style={styles.mediaTileRemove} onPress={() => setVideo(null)}>
                  <Feather name="x" size={11} color="#fff" />
                </Pressable>
              </View>
            )}
            {/* Add more photos button */}
            {photos.length > 0 && photos.length < MAX_PHOTOS && (
              <Pressable style={styles.mediaTileAdd} onPress={handlePickMedia}>
                <Feather name="plus" size={22} color={colors.textMuted} />
              </Pressable>
            )}
          </ScrollView>
        )}

        {/* ── Poll builder ───────────────────────────────────────────── */}
        {showPoll && (
          <View style={styles.pollForm}>
            <TextInput
              style={styles.pollQuestionInput}
              placeholder="Ask a question..."
              placeholderTextColor={colors.textMuted}
              value={pollQuestion}
              onChangeText={setPollQuestion}
              maxLength={100}
            />
            {pollOptions.map((opt, i) => (
              <View key={i} style={styles.pollOptionRow}>
                <TextInput
                  style={styles.pollOptionInput}
                  placeholder={`Choice ${i + 1}`}
                  placeholderTextColor={colors.textMuted}
                  value={opt}
                  onChangeText={v => updatePollOption(i, v)}
                  maxLength={50}
                />
                {pollOptions.length > 2 && (
                  <Pressable
                    onPress={() => removePollOption(i)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    style={{ marginLeft: spacing.sm }}
                  >
                    <Feather name="x" size={16} color={colors.textMuted} />
                  </Pressable>
                )}
              </View>
            ))}
            {pollOptions.length < 4 && (
              <Pressable style={styles.addOptionBtn} onPress={() => setPollOptions([...pollOptions, ''])}>
                <Feather name="plus-circle" size={14} color={colors.primary} />
                <Text style={styles.addOptionText}>Add choice</Text>
              </Pressable>
            )}
            <Text style={styles.pollDurationLabel}>Poll duration</Text>
            <View style={styles.durationRow}>
              {POLL_DURATIONS.map(d => (
                <Pressable
                  key={d.hours}
                  style={[styles.durationChip, pollDuration === d.hours && styles.durationChipActive]}
                  onPress={() => setPollDuration(d.hours)}
                >
                  <Text style={[styles.durationChipText, pollDuration === d.hours && styles.durationChipTextActive]}>
                    {d.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {/* ── PR form ────────────────────────────────────────────────── */}
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

        {/* ── Attached workout (always last) ─────────────────────────── */}
        {attachedWorkout && (
          <View style={styles.attachedSection}>
            <WorkoutCard workout={attachedWorkout} onRemove={() => setAttachedWorkout(null)} />
          </View>
        )}

        {/* ── Compact icon toolbar ───────────────────────────────────── */}
        <View style={styles.toolbar}>
          <ToolbarBtn
            icon="image"
            label="Media"
            active={photos.length > 0 || !!video}
            onPress={handlePickMedia}
          />
          <ToolbarBtn
            icon="bar-chart-2"
            label="Poll"
            active={showPoll}
            onPress={togglePoll}
          />
          <ToolbarBtn
            icon="activity"
            label="Workout"
            active={!!attachedWorkout}
            onPress={openWorkoutPicker}
          />
          <ToolbarBtn
            icon="award"
            label="PR"
            active={showPR}
            onPress={() => setShowPR(v => !v)}
          />
        </View>
      </ScrollView>

      {/* Fullscreen preview of picked media */}
      {previewViewerIndex !== null && (
        <MediaViewerModal
          uri={previewViewerIndex === -1 ? (video?.uri ?? null) : (photos[previewViewerIndex]?.uri ?? null)}
          kind={previewViewerIndex === -1 ? 'video' : 'image'}
          onClose={() => setPreviewViewerIndex(null)}
          uris={previewViewerIndex >= 0 ? photos.map(p => p.uri) : undefined}
          initialIndex={previewViewerIndex >= 0 ? previewViewerIndex : 0}
        />
      )}

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
            ItemSeparatorComponent={() => (
              <View style={{ height: 1, backgroundColor: colors.border.subtle, marginLeft: 56 }} />
            )}
          />
        )}
      </BottomSheet>
    </KeyboardAvoidingView>
  );
}

// ─── Toolbar Button ───────────────────────────────────────────────────────────

function ToolbarBtn({
  icon,
  label,
  active,
  onPress,
}: {
  icon: React.ComponentProps<typeof Feather>['name'];
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.toolbarBtn, pressed && { opacity: 0.6 }]}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <Feather name={icon} size={20} color={active ? colors.primary : colors.textMuted} />
      <Text style={[styles.toolbarLabel, active && styles.toolbarLabelActive]}>{label}</Text>
    </Pressable>
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
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderColor,
  },
  headerBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: typography.size.base, fontFamily: typography.family.semibold, color: colors.textPrimary },
  postBtn: {
    backgroundColor: colors.primary,
    borderRadius: 20,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    minWidth: 60,
    alignItems: 'center',
  },
  postBtnDisabled: { opacity: 0.4 },
  postBtnText: { fontSize: typography.size.sm, fontFamily: typography.family.semibold, color: '#fff' },

  composerRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start', padding: spacing.base, paddingBottom: spacing.sm },
  composerName: { fontSize: typography.size.sm, fontFamily: typography.family.semibold, color: colors.textPrimary, marginBottom: 4 },
  textInput: { fontSize: typography.size.lg, color: colors.textPrimary, minHeight: 80, textAlignVertical: 'top', lineHeight: 26 },
  charCount: { fontSize: typography.size.xs, color: colors.textMuted, textAlign: 'right', marginTop: 4 },
  charCountWarn: { color: colors.warning },

  hashtagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, paddingHorizontal: spacing.base, marginBottom: spacing.xs },
  hashtagChip: { backgroundColor: colors.primary + '18', borderRadius: 12, paddingHorizontal: spacing.sm, paddingVertical: 3 },
  hashtagText: { fontSize: typography.size.xs, color: colors.primary, fontFamily: typography.family.semibold },

  mediaStrip: {
    marginHorizontal: spacing.base,
    marginBottom: spacing.sm,
  },
  mediaStripContent: {
    flexDirection: 'row',
    gap: spacing.xs,
    paddingRight: spacing.xs,
  },
  mediaTile: {
    width: 80,
    height: 80,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: colors.background.elevated,
    position: 'relative',
  },
  mediaTileImg: {
    width: 80,
    height: 80,
  },
  mediaTileInner: {
    width: 80,
    height: 80,
  },
  videoTileBg: {
    width: 80,
    height: 80,
    backgroundColor: '#1a1a2e',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  videoTileLabel: {
    fontSize: 10,
    color: '#fff',
    fontFamily: typography.family.semibold,
  },
  mediaTileRemove: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 9,
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaTileAdd: {
    width: 80,
    height: 80,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.borderColor,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background.elevated,
  },

  attachedSection: { paddingHorizontal: spacing.base, marginBottom: spacing.sm },

  // Compact icon toolbar
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderColor,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    gap: spacing.xl,
  },
  toolbarBtn: {
    alignItems: 'center',
    gap: 3,
  },
  toolbarLabel: {
    fontSize: 10,
    fontFamily: typography.family.medium,
    color: colors.textMuted,
  },
  toolbarLabelActive: {
    color: colors.primary,
  },

  // Poll form
  pollForm: {
    backgroundColor: colors.background.elevated,
    borderRadius: 14, padding: spacing.md, gap: spacing.sm,
    borderWidth: 1.5, borderColor: colors.primary + '30',
    marginHorizontal: spacing.base, marginBottom: spacing.sm,
  },
  pollQuestionInput: {
    backgroundColor: colors.surface,
    borderRadius: 10, borderWidth: 1, borderColor: colors.borderColor,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    fontSize: typography.size.base, color: colors.textPrimary,
    fontFamily: typography.family.regular,
  },
  pollOptionRow: { flexDirection: 'row', alignItems: 'center' },
  pollOptionInput: {
    flex: 1, backgroundColor: colors.surface,
    borderRadius: 10, borderWidth: 1, borderColor: colors.borderColor,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    fontSize: typography.size.sm, color: colors.textPrimary,
    fontFamily: typography.family.regular,
  },
  addOptionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: spacing.xs },
  addOptionText: { fontSize: typography.size.sm, fontFamily: typography.family.semibold, color: colors.primary },
  pollDurationLabel: {
    fontSize: typography.size.xs, fontFamily: typography.family.semibold,
    color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8,
    marginTop: spacing.xs,
  },
  durationRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  durationChip: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
    borderRadius: 9999, borderWidth: 1.5, borderColor: colors.borderColor,
    backgroundColor: colors.surface,
  },
  durationChipActive: { borderColor: colors.primary, backgroundColor: colors.primary + '15' },
  durationChipText: { fontSize: typography.size.sm, fontFamily: typography.family.medium, color: colors.textSecondary },
  durationChipTextActive: { color: colors.primary, fontFamily: typography.family.semibold },

  // PR form
  prForm: { backgroundColor: colors.background.elevated, borderRadius: 14, padding: spacing.md, gap: spacing.sm, marginHorizontal: spacing.base, marginBottom: spacing.sm },
  prInput: {
    backgroundColor: colors.surface, borderRadius: 10, padding: spacing.md,
    fontSize: typography.size.base, color: colors.textPrimary,
    borderWidth: 1, borderColor: colors.borderColor,
  },
  prRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  unitScroll: { flex: 1 },
  unitRow: { flexDirection: 'row', gap: spacing.xs },
  unitChip: {
    paddingHorizontal: spacing.sm, paddingVertical: spacing.xs,
    borderRadius: 8, borderWidth: 1.5, borderColor: colors.borderColor,
    backgroundColor: colors.surface,
  },
  unitChipSelected: { borderColor: colors.primary, backgroundColor: colors.primary + '15' },
  unitText: { fontSize: typography.size.xs, color: colors.textSecondary, fontFamily: typography.family.medium },
  unitTextSelected: { color: colors.primary, fontFamily: typography.family.semibold },

  workoutCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.primary + '0F', borderRadius: 14,
    borderWidth: 1.5, borderColor: colors.primary + '40', padding: spacing.md,
  },
  workoutCardLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flex: 1 },
  workoutCardIcon: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: colors.primary + '20', alignItems: 'center', justifyContent: 'center',
  },
  workoutCardName: { fontSize: typography.size.sm, fontFamily: typography.family.semibold, color: colors.textPrimary },
  workoutCardMeta: { fontSize: typography.size.xs, color: colors.textSecondary, marginTop: 2 },

  // Sheet
  sheetBg: {
    backgroundColor: colors.surface, borderRadius: 24,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.1, shadowRadius: 20 },
      android: { elevation: 10 },
    }),
  },
  sheetHandle: { backgroundColor: colors.borderColor, width: 36 },
  sheetHeader: { paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border.subtle },
  sheetTitle: { fontSize: typography.size.base, fontFamily: typography.family.semibold, color: colors.textPrimary },
  sheetCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl },
  sheetEmpty: { fontSize: typography.size.base, color: colors.textMuted },
  workoutRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, paddingHorizontal: spacing.xl },
  workoutRowIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.primary + '18', alignItems: 'center', justifyContent: 'center' },
  workoutRowName: { fontSize: typography.size.base, fontFamily: typography.family.semibold, color: colors.textPrimary },
  workoutRowMeta: { fontSize: typography.size.xs, color: colors.textMuted, marginTop: 2 },
});
