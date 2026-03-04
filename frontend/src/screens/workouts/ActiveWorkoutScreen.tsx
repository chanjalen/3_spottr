import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
  Modal,
  FlatList,
  Switch,
  KeyboardAvoidingView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import {
  fetchWorkout,
  finishWorkout,
  deleteWorkout,
  addExercise,
  addCustomExercise,
  deleteExercise,
  addSet,
  updateSet,
  deleteSet,
  fetchExerciseCatalog,
} from '../../api/workouts';
import { Workout, WorkoutExercise, ExerciseSet, ExerciseCatalogItem, NewPR } from '../../types/workout';
import { colors, spacing, typography } from '../../theme';
import { RootStackParamList } from '../../navigation/types';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'ActiveWorkout'>;
  route: RouteProp<RootStackParamList, 'ActiveWorkout'>;
};

const CATEGORIES = ['All', 'Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Legs', 'Core', 'Cardio'];

// Only show live PR notifications for major compound lifts.
const BIG_LIFT_KEYWORDS = ['bench', 'squat', 'deadlift', 'run', 'clean', 'snatch'];

function isBigLift(exerciseName: string): boolean {
  const lower = exerciseName.toLowerCase();
  return BIG_LIFT_KEYWORDS.some((kw) => lower.includes(kw));
}

export default function ActiveWorkoutScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { workoutId, fromCheckin = false } = route.params;

  const [workout, setWorkout] = useState<Workout | null>(null);
  const [loading, setLoading] = useState(true);
  const [seconds, setSeconds] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Catalog modal state
  const [showCatalog, setShowCatalog] = useState(false);
  const [catalog, setCatalog] = useState<ExerciseCatalogItem[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogQuery, setCatalogQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [customExerciseName, setCustomExerciseName] = useState('');

  // Finish modal state
  const [showFinish, setShowFinish] = useState(false);
  const [finishLoading, setFinishLoading] = useState(false);
  const [workoutName, setWorkoutName] = useState('Workout');
  const [notes, setNotes] = useState('');
  const [postToFeed, setPostToFeed] = useState(true);
  const [feedVisibility, setFeedVisibility] = useState<'main' | 'friends'>('main');
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);
  const [templateName, setTemplateName] = useState('');

  // PR state
  const [pendingPRs, setPendingPRs] = useState<NewPR[]>([]);

  // ─── Load workout ────────────────────────────────────────────────────────────

  useEffect(() => {
    fetchWorkout(workoutId)
      .then((w) => {
        setWorkout(w);
        setWorkoutName(w.name || 'Workout');
        if (w.started_at) {
          const elapsed = Math.floor((Date.now() - new Date(w.started_at).getTime()) / 1000);
          setSeconds(Math.max(0, elapsed));
        }
      })
      .finally(() => setLoading(false));
  }, [workoutId]);

  // ─── Timer ───────────────────────────────────────────────────────────────────

  useEffect(() => {
    timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  const formatTime = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  };

  // ─── Catalog ─────────────────────────────────────────────────────────────────

  const openCatalog = async () => {
    setShowCatalog(true);
    setCatalogQuery('');
    setCustomExerciseName('');
    setActiveCategory('All');
    if (catalog.length === 0) {
      setCatalogLoading(true);
      const data = await fetchExerciseCatalog().catch(() => []);
      setCatalog(data);
      setCatalogLoading(false);
    }
  };

  const filteredCatalog = catalog.filter((e) => {
    const matchesQuery = !catalogQuery || e.name.toLowerCase().includes(catalogQuery.toLowerCase());
    const matchesCategory = activeCategory === 'All' || e.category.toLowerCase() === activeCategory.toLowerCase();
    return matchesQuery && matchesCategory;
  });

  const handleAddFromCatalog = async (item: ExerciseCatalogItem) => {
    setShowCatalog(false);
    try {
      const ex = await addExercise(workoutId, item.id);
      setWorkout((w) => w ? { ...w, exercises: [...w.exercises, ex] } : w);
    } catch {
      Alert.alert('Error', 'Could not add exercise.');
    }
  };

  const handleAddCustom = async () => {
    const name = customExerciseName.trim();
    if (!name) return;
    setShowCatalog(false);
    setCustomExerciseName('');
    try {
      const ex = await addCustomExercise(workoutId, name);
      setWorkout((w) => w ? { ...w, exercises: [...w.exercises, ex] } : w);
    } catch {
      Alert.alert('Error', 'Could not add custom exercise.');
    }
  };

  // ─── Exercise / set mutations ─────────────────────────────────────────────────

  const handleDeleteExercise = async (exerciseId: string) => {
    await deleteExercise(exerciseId).catch(() => {});
    setWorkout((w) => w ? { ...w, exercises: w.exercises.filter((e) => e.id !== exerciseId) } : w);
  };

  const handleAddSet = async (exerciseId: string) => {
    try {
      const set = await addSet(exerciseId);
      setWorkout((w) => {
        if (!w) return w;
        return {
          ...w,
          exercises: w.exercises.map((e) =>
            e.id === exerciseId ? { ...e, sets: [...e.sets, set] } : e,
          ),
        };
      });
    } catch {
      Alert.alert('Error', 'Could not add set.');
    }
  };

  const handleDeleteSet = async (exerciseId: string, setId: string) => {
    await deleteSet(setId).catch(() => {});
    setWorkout((w) => {
      if (!w) return w;
      return {
        ...w,
        exercises: w.exercises.map((e) =>
          e.id === exerciseId ? { ...e, sets: e.sets.filter((s) => s.id !== setId) } : e,
        ),
      };
    });
  };

  const handleUpdateSet = useCallback(
    async (exerciseId: string, setId: string, field: 'reps' | 'weight' | 'completed', value: any) => {
      // Optimistic update
      setWorkout((w) => {
        if (!w) return w;
        return {
          ...w,
          exercises: w.exercises.map((e) =>
            e.id === exerciseId
              ? { ...e, sets: e.sets.map((s) => s.id === setId ? { ...s, [field]: value } : s) }
              : e,
          ),
        };
      });
      // Persist
      try {
        const result = await updateSet(setId, { [field]: value });
        if (result.is_new_pr && result.pr_exercise && isBigLift(result.pr_exercise)) {
          const pr: NewPR = {
            exercise_name: result.pr_exercise,
            value: result.pr_value ?? '',
            unit: result.pr_unit ?? 'lbs',
          };
          setPendingPRs((prev) => {
            const without = prev.filter((p) => p.exercise_name !== pr.exercise_name);
            return [...without, pr];
          });
        }
      } catch {
        // Revert not implemented — server is source of truth on next fetch
      }
    },
    [],
  );

  // ─── Finish ───────────────────────────────────────────────────────────────────

  const openFinishDialog = () => {
    setWorkoutName(workout?.name || 'Workout');
    setNotes('');
    setPostToFeed(true);
    setFeedVisibility('main');
    setSaveAsTemplate(false);
    setTemplateName(workout?.name || 'Workout');
    setShowFinish(true);
  };

  const handleFinish = async () => {
    setFinishLoading(true);
    try {
      await finishWorkout(workoutId, {
        name: workoutName.trim() || 'Workout',
        notes,
        // Never auto-post to feed when coming from a check-in — the check-in handles posting
        post_to_feed: fromCheckin ? false : postToFeed,
        visibility: feedVisibility,
        save_template: saveAsTemplate,
        template_name: saveAsTemplate ? (templateName.trim() || workoutName) : '',
        pr_data: pendingPRs.map((p) => ({ exercise_name: p.exercise_name, value: p.value, unit: p.unit })),
      });
      setShowFinish(false);
      if (fromCheckin) {
        // Pop both ActiveWorkout and WorkoutLog off the stack — returns to CheckInReview
        navigation.pop(2);
      } else {
        navigation.goBack();
      }
    } catch {
      Alert.alert('Error', 'Could not finish workout.');
    } finally {
      setFinishLoading(false);
    }
  };

  const handleDiscard = () => {
    Alert.alert('Discard Workout', 'Are you sure you want to discard this workout?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: async () => {
          await deleteWorkout(workoutId).catch(() => {});
          navigation.goBack();
        },
      },
    ]);
  };

  // ─── Render ───────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background.base }}>
      {/* Header */}
      <View style={[styles.headerBar, { paddingTop: insets.top }]}>
        <Pressable onPress={handleDiscard} style={styles.headerBtn}>
          <Text style={styles.discardText}>Discard</Text>
        </Pressable>
        <View style={styles.timerWrap}>
          <Text style={styles.timer}>{formatTime(seconds)}</Text>
        </View>
        <Pressable
          style={styles.finishBtn}
          onPress={openFinishDialog}
        >
          <Text style={styles.finishText}>Finish</Text>
        </Pressable>
      </View>

      {/* PR banner */}
      {pendingPRs.length > 0 && (
        <View style={styles.prBanner}>
          <Feather name="award" size={14} color="#fff" />
          <Text style={styles.prBannerText}>
            New PR{pendingPRs.length > 1 ? 's' : ''}: {pendingPRs.map((p) => `${p.exercise_name} (${p.value} ${p.unit})`).join(', ')}
          </Text>
        </View>
      )}

      <ScrollView
        contentContainerStyle={{ padding: spacing.base, gap: spacing.md, paddingBottom: insets.bottom + 120 }}
        keyboardShouldPersistTaps="handled"
      >
        {workout?.exercises.length === 0 && (
          <View style={styles.emptyState}>
            <Feather name="zap-off" size={32} color={colors.textMuted} />
            <Text style={styles.emptyTitle}>No exercises yet</Text>
            <Text style={styles.emptySubtitle}>Tap "Add Exercise" below to get started</Text>
          </View>
        )}

        {workout?.exercises.map((exercise) => (
          <ExerciseCard
            key={exercise.id}
            exercise={exercise}
            onAddSet={() => handleAddSet(exercise.id)}
            onDeleteSet={(setId) => handleDeleteSet(exercise.id, setId)}
            onUpdateSet={(setId, field, value) => handleUpdateSet(exercise.id, setId, field, value)}
            onDeleteExercise={() => handleDeleteExercise(exercise.id)}
          />
        ))}

        <Pressable style={styles.addExerciseBtn} onPress={openCatalog}>
          <Feather name="plus" size={18} color={colors.primary} />
          <Text style={styles.addExerciseBtnText}>Add Exercise</Text>
        </Pressable>
      </ScrollView>

      {/* ── Catalog Modal ─────────────────────────────────────────────── */}
      <Modal visible={showCatalog} animationType="slide" presentationStyle="pageSheet">
        <View style={[styles.catalogWrap, { paddingTop: insets.top }]}>
          <View style={styles.catalogHeader}>
            <Text style={styles.catalogTitle}>Add Exercise</Text>
            <Pressable onPress={() => setShowCatalog(false)}>
              <Feather name="x" size={22} color={colors.textPrimary} />
            </Pressable>
          </View>

          {/* Search */}
          <View style={styles.catalogSearch}>
            <Feather name="search" size={16} color={colors.textMuted} />
            <TextInput
              style={styles.catalogSearchInput}
              value={catalogQuery}
              onChangeText={setCatalogQuery}
              placeholder="Search exercises…"
              placeholderTextColor={colors.textMuted}
              autoFocus
            />
            {catalogQuery.length > 0 && (
              <Pressable onPress={() => setCatalogQuery('')}>
                <Feather name="x" size={14} color={colors.textMuted} />
              </Pressable>
            )}
          </View>

          {/* Category chips */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.categoryChipScroll}
            contentContainerStyle={styles.categoryChips}
          >
            {CATEGORIES.map((cat) => (
              <Pressable
                key={cat}
                style={[styles.chip, activeCategory === cat && styles.chipActive]}
                onPress={() => setActiveCategory(cat)}
              >
                <Text style={[styles.chipText, activeCategory === cat && styles.chipTextActive]}>
                  {cat}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          {/* Custom exercise entry */}
          <View style={styles.customRow}>
            <TextInput
              style={styles.customInput}
              value={customExerciseName}
              onChangeText={setCustomExerciseName}
              placeholder="Can't find it? Enter custom name…"
              placeholderTextColor={colors.textMuted}
              returnKeyType="done"
              onSubmitEditing={handleAddCustom}
            />
            {customExerciseName.trim().length > 0 && (
              <Pressable style={styles.customAddBtn} onPress={handleAddCustom}>
                <Text style={styles.customAddText}>Add</Text>
              </Pressable>
            )}
          </View>

          {/* Exercise list */}
          {catalogLoading ? (
            <View style={styles.center}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : (
            <FlatList
              data={filteredCatalog}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <Pressable
                  style={({ pressed }) => [styles.catalogItem, pressed && styles.catalogItemPressed]}
                  onPress={() => handleAddFromCatalog(item)}
                >
                  <Text style={styles.catalogItemName}>{item.name}</Text>
                  <Text style={styles.catalogItemCategory}>{item.category}</Text>
                </Pressable>
              )}
              contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
              ListEmptyComponent={
                <View style={[styles.center, { paddingTop: 48 }]}>
                  <Text style={styles.emptyText}>No exercises found</Text>
                  <Text style={styles.emptySubtitleSmall}>Use the custom field above</Text>
                </View>
              }
            />
          )}
        </View>
      </Modal>

      {/* ── Finish Modal ──────────────────────────────────────────────── */}
      <Modal visible={showFinish} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={[styles.finishWrap, { paddingTop: insets.top }]}>
            <View style={styles.finishHeader}>
              <Pressable onPress={() => setShowFinish(false)}>
                <Feather name="x" size={22} color={colors.textPrimary} />
              </Pressable>
              <Text style={styles.finishHeaderTitle}>Finish Workout</Text>
              <View style={{ width: 22 }} />
            </View>

            <ScrollView
              contentContainerStyle={{ padding: spacing.base, gap: spacing.md, paddingBottom: insets.bottom + 40 }}
              keyboardShouldPersistTaps="handled"
            >
              {/* Workout name */}
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Workout Name</Text>
                <TextInput
                  style={styles.fieldInput}
                  value={workoutName}
                  onChangeText={setWorkoutName}
                  placeholder="Workout"
                  placeholderTextColor={colors.textMuted}
                />
              </View>

              {/* Notes */}
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Notes (optional)</Text>
                <TextInput
                  style={[styles.fieldInput, styles.fieldInputMulti]}
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="How did it go?"
                  placeholderTextColor={colors.textMuted}
                  multiline
                  numberOfLines={3}
                />
              </View>

              {/* Post to feed toggle — hidden when finishing from a check-in */}
              {!fromCheckin && (
                <>
                  <View style={styles.toggleRow}>
                    <View>
                      <Text style={styles.toggleLabel}>Post to Feed</Text>
                      <Text style={styles.toggleSub}>Share your workout</Text>
                    </View>
                    <Switch
                      value={postToFeed}
                      onValueChange={setPostToFeed}
                      trackColor={{ true: colors.primary }}
                    />
                  </View>

                  {postToFeed && (
                    <View style={styles.visibilityRow}>
                      <Text style={styles.fieldLabel}>Visibility</Text>
                      <View style={styles.visibilityBtns}>
                        {(['main', 'friends'] as const).map((v) => (
                          <Pressable
                            key={v}
                            style={[styles.visibilityBtn, feedVisibility === v && styles.visibilityBtnActive]}
                            onPress={() => setFeedVisibility(v)}
                          >
                            <Text style={[styles.visibilityBtnText, feedVisibility === v && styles.visibilityBtnTextActive]}>
                              {v === 'main' ? 'Everyone' : 'Friends'}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    </View>
                  )}
                </>
              )}

              {fromCheckin && (
                <View style={styles.checkinNotice}>
                  <Feather name="link" size={14} color={colors.primary} />
                  <Text style={styles.checkinNoticeText}>
                    This workout will be attached to your check-in
                  </Text>
                </View>
              )}

              {/* Save as template toggle */}
              <View style={styles.toggleRow}>
                <View>
                  <Text style={styles.toggleLabel}>Save as Template</Text>
                  <Text style={styles.toggleSub}>Reuse this workout later</Text>
                </View>
                <Switch
                  value={saveAsTemplate}
                  onValueChange={setSaveAsTemplate}
                  trackColor={{ true: colors.primary }}
                />
              </View>

              {saveAsTemplate && (
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>Template Name</Text>
                  <TextInput
                    style={styles.fieldInput}
                    value={templateName}
                    onChangeText={setTemplateName}
                    placeholder="My Template"
                    placeholderTextColor={colors.textMuted}
                  />
                </View>
              )}

              {/* PR summary */}
              {pendingPRs.length > 0 && (
                <View style={styles.prSummary}>
                  <Text style={styles.prSummaryTitle}>New PRs detected</Text>
                  {pendingPRs.map((pr) => (
                    <Text key={pr.exercise_name} style={styles.prSummaryItem}>
                      🏆 {pr.exercise_name} — {pr.value} {pr.unit}
                    </Text>
                  ))}
                </View>
              )}

              {/* Confirm button */}
              <Pressable
                style={[styles.confirmBtn, finishLoading && styles.confirmBtnDisabled]}
                onPress={handleFinish}
                disabled={finishLoading}
              >
                {finishLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.confirmBtnText}>Save Workout</Text>
                )}
              </Pressable>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// ─── Exercise Card ─────────────────────────────────────────────────────────────

interface ExerciseCardProps {
  exercise: WorkoutExercise;
  onAddSet: () => void;
  onDeleteSet: (setId: string) => void;
  onUpdateSet: (setId: string, field: 'reps' | 'weight' | 'completed', value: any) => void;
  onDeleteExercise: () => void;
}

function ExerciseCard({ exercise, onAddSet, onDeleteSet, onUpdateSet, onDeleteExercise }: ExerciseCardProps) {
  return (
    <View style={styles.exCard}>
      <View style={styles.exHeader}>
        <View>
          <Text style={styles.exName}>{exercise.name}</Text>
          {exercise.category ? (
            <Text style={styles.exCategory}>{exercise.category}</Text>
          ) : null}
        </View>
        <Pressable
          onPress={() =>
            Alert.alert('Delete Exercise', `Remove "${exercise.name}"?`, [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Remove', style: 'destructive', onPress: onDeleteExercise },
            ])
          }
          style={styles.exDeleteBtn}
        >
          <Feather name="trash-2" size={16} color={colors.error} />
        </Pressable>
      </View>

      <View style={styles.setHeader}>
        <Text style={[styles.setHeaderText, { width: 32 }]}>Set</Text>
        <Text style={[styles.setHeaderText, { flex: 1 }]}>Reps</Text>
        <Text style={[styles.setHeaderText, { flex: 1.2 }]}>Weight (lbs)</Text>
        <View style={{ width: 32 + 24 }} />
      </View>

      {exercise.sets.map((set, i) => (
        <SetRow
          key={set.id}
          set={set}
          index={i}
          onUpdate={(field, value) => onUpdateSet(set.id, field, value)}
          onDelete={() => onDeleteSet(set.id)}
        />
      ))}

      <Pressable style={styles.addSetBtn} onPress={onAddSet}>
        <Feather name="plus" size={14} color={colors.primary} />
        <Text style={styles.addSetText}>Add Set</Text>
      </Pressable>
    </View>
  );
}

interface SetRowProps {
  set: ExerciseSet;
  index: number;
  onUpdate: (field: 'reps' | 'weight' | 'completed', value: any) => void;
  onDelete: () => void;
}

function SetRow({ set, index, onUpdate, onDelete }: SetRowProps) {
  const [localReps, setLocalReps] = useState(() =>
    set.reps != null && set.reps !== 0 ? String(set.reps) : ''
  );
  const [localWeight, setLocalWeight] = useState(() =>
    set.weight != null && set.weight !== 0 ? String(set.weight) : ''
  );

  return (
    <View style={[styles.setRow, set.completed && styles.setRowCompleted]}>
      <Text style={[styles.setNum, { width: 32 }]}>{index + 1}</Text>
      <TextInput
        style={[styles.setInput, { flex: 1 }]}
        value={localReps}
        onChangeText={setLocalReps}
        onEndEditing={() => onUpdate('reps', localReps ? parseInt(localReps, 10) : 0)}
        keyboardType="number-pad"
        placeholder="—"
        placeholderTextColor={colors.textMuted}
        selectTextOnFocus
      />
      <TextInput
        style={[styles.setInput, { flex: 1.2 }]}
        value={localWeight}
        onChangeText={setLocalWeight}
        onEndEditing={() => onUpdate('weight', localWeight ? parseFloat(localWeight) : 0)}
        keyboardType="decimal-pad"
        placeholder="—"
        placeholderTextColor={colors.textMuted}
        selectTextOnFocus
      />
      <Pressable
        style={[styles.checkBox, set.completed && styles.checkBoxDone]}
        onPress={() => onUpdate('completed', !set.completed)}
      >
        {set.completed && <Feather name="check" size={14} color="#fff" />}
      </Pressable>
      <Pressable onPress={onDelete} style={styles.setDeleteBtn}>
        <Feather name="minus" size={14} color={colors.textMuted} />
      </Pressable>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },

  // Header
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  headerBtn: { paddingHorizontal: spacing.sm },
  discardText: {
    fontSize: typography.size.sm,
    fontFamily: typography.family.semibold,
    color: colors.error,
  },
  timerWrap: { alignItems: 'center' },
  timer: {
    fontSize: typography.size.xl,
    fontFamily: typography.family.bold,
    color: colors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  finishBtn: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    minWidth: 70,
    alignItems: 'center',
  },
  finishText: {
    fontSize: typography.size.sm,
    fontFamily: typography.family.bold,
    color: '#fff',
  },

  // PR banner
  prBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: '#f59e0b',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.xs,
  },
  prBannerText: {
    fontSize: typography.size.xs,
    fontFamily: typography.family.medium,
    color: '#fff',
    flex: 1,
  },

  // Empty state
  emptyState: { alignItems: 'center', paddingVertical: 48, gap: spacing.sm },
  emptyTitle: {
    fontSize: typography.size.lg,
    fontFamily: typography.family.semibold,
    color: colors.textSecondary,
  },
  emptySubtitle: {
    fontSize: typography.size.sm,
    fontFamily: typography.family.regular,
    color: colors.textMuted,
  },
  emptySubtitleSmall: {
    fontSize: typography.size.xs,
    fontFamily: typography.family.regular,
    color: colors.textMuted,
    marginTop: 4,
  },

  // Add exercise button
  addExerciseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: 12,
    paddingVertical: spacing.md,
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderStyle: 'dashed',
  },
  addExerciseBtnText: {
    fontSize: typography.size.base,
    fontFamily: typography.family.semibold,
    color: colors.primary,
  },

  // Exercise card
  exCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: spacing.md,
    gap: spacing.sm,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6 },
      android: { elevation: 2 },
    }),
  },
  exHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  exName: {
    fontSize: typography.size.base,
    fontFamily: typography.family.bold,
    color: colors.textPrimary,
  },
  exCategory: {
    fontSize: typography.size.xs,
    fontFamily: typography.family.regular,
    color: colors.textMuted,
    marginTop: 2,
    textTransform: 'capitalize',
  },
  exDeleteBtn: { padding: spacing.xs },

  // Set row
  setHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: 2 },
  setHeaderText: {
    fontSize: typography.size.xs,
    fontFamily: typography.family.semibold,
    color: colors.textMuted,
    textAlign: 'center',
  },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 4,
    borderRadius: 8,
    paddingHorizontal: 2,
  },
  setRowCompleted: { backgroundColor: 'rgba(16,185,129,0.07)' },
  setNum: {
    fontSize: typography.size.sm,
    fontFamily: typography.family.semibold,
    color: colors.textMuted,
    textAlign: 'center',
  },
  setInput: {
    borderWidth: 1,
    borderColor: colors.borderColor,
    borderRadius: 8,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    fontSize: typography.size.sm,
    fontFamily: typography.family.regular,
    color: colors.textPrimary,
    textAlign: 'center',
    backgroundColor: colors.background.elevated,
  },
  checkBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.borderColor,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkBoxDone: { backgroundColor: colors.success, borderColor: colors.success },
  setDeleteBtn: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addSetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
  },
  addSetText: {
    fontSize: typography.size.sm,
    fontFamily: typography.family.semibold,
    color: colors.primary,
  },
  emptyText: {
    fontSize: typography.size.sm,
    fontFamily: typography.family.regular,
    color: colors.textMuted,
  },

  // Catalog modal
  catalogWrap: { flex: 1, backgroundColor: colors.background.base },
  catalogHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  catalogTitle: {
    fontSize: typography.size.lg,
    fontFamily: typography.family.bold,
    color: colors.textPrimary,
  },
  catalogSearch: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    margin: spacing.base,
    marginBottom: spacing.sm,
    backgroundColor: colors.background.elevated,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  catalogSearchInput: {
    flex: 1,
    fontSize: typography.size.sm,
    fontFamily: typography.family.regular,
    color: colors.textPrimary,
  },
  categoryChipScroll: { height: 48, marginBottom: spacing.xs },
  categoryChips: {
    paddingHorizontal: spacing.base,
    gap: spacing.xs,
    alignItems: 'center',
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 20,
    backgroundColor: colors.background.elevated,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: {
    fontSize: typography.size.sm,
    fontFamily: typography.family.medium,
    color: colors.textSecondary,
  },
  chipTextActive: { color: '#fff' },
  customRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.sm,
  },
  customInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border.default,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: typography.size.sm,
    fontFamily: typography.family.regular,
    color: colors.textPrimary,
    backgroundColor: colors.background.elevated,
  },
  customAddBtn: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  customAddText: {
    fontSize: typography.size.sm,
    fontFamily: typography.family.semibold,
    color: '#fff',
  },
  catalogItem: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  catalogItemPressed: { backgroundColor: colors.background.elevated },
  catalogItemName: {
    fontSize: typography.size.base,
    fontFamily: typography.family.medium,
    color: colors.textPrimary,
  },
  catalogItemCategory: {
    fontSize: typography.size.xs,
    fontFamily: typography.family.regular,
    color: colors.textSecondary,
    marginTop: 2,
    textTransform: 'capitalize',
  },

  // Finish modal
  finishWrap: { flex: 1, backgroundColor: colors.background.base },
  finishHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  finishHeaderTitle: {
    fontSize: typography.size.lg,
    fontFamily: typography.family.bold,
    color: colors.textPrimary,
  },
  field: { gap: 6 },
  fieldLabel: {
    fontSize: typography.size.sm,
    fontFamily: typography.family.semibold,
    color: colors.textSecondary,
  },
  fieldInput: {
    borderWidth: 1,
    borderColor: colors.border.default,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: typography.size.base,
    fontFamily: typography.family.regular,
    color: colors.textPrimary,
    backgroundColor: colors.background.elevated,
  },
  fieldInputMulti: { minHeight: 80, textAlignVertical: 'top' },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  toggleLabel: {
    fontSize: typography.size.base,
    fontFamily: typography.family.semibold,
    color: colors.textPrimary,
  },
  toggleSub: {
    fontSize: typography.size.xs,
    fontFamily: typography.family.regular,
    color: colors.textMuted,
  },
  checkinNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary + '12',
    borderRadius: 10,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.primary + '30',
  },
  checkinNoticeText: {
    fontSize: typography.size.sm,
    color: colors.primary,
    fontWeight: '600',
    flex: 1,
  },
  visibilityRow: { gap: 6 },
  visibilityBtns: { flexDirection: 'row', gap: spacing.sm },
  visibilityBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.border.default,
    alignItems: 'center',
  },
  visibilityBtnActive: { borderColor: colors.primary, backgroundColor: 'rgba(79,195,224,0.08)' },
  visibilityBtnText: {
    fontSize: typography.size.sm,
    fontFamily: typography.family.medium,
    color: colors.textSecondary,
  },
  visibilityBtnTextActive: { color: colors.primary },
  prSummary: {
    backgroundColor: 'rgba(245,158,11,0.1)',
    borderRadius: 12,
    padding: spacing.md,
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.3)',
  },
  prSummaryTitle: {
    fontSize: typography.size.sm,
    fontFamily: typography.family.semibold,
    color: '#d97706',
  },
  prSummaryItem: {
    fontSize: typography.size.sm,
    fontFamily: typography.family.regular,
    color: colors.textPrimary,
  },
  confirmBtn: {
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: spacing.base,
    alignItems: 'center',
    ...Platform.select({
      ios: { shadowColor: 'rgba(79,195,224,0.4)', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 1, shadowRadius: 12 },
      android: { elevation: 4 },
    }),
  },
  confirmBtnDisabled: { opacity: 0.6 },
  confirmBtnText: {
    fontSize: typography.size.base,
    fontFamily: typography.family.bold,
    color: '#fff',
  },
});
