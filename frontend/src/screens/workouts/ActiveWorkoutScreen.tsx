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
  deleteExercise,
  addSet,
  updateSet,
  deleteSet,
  fetchExerciseCatalog,
} from '../../api/workouts';
import { Workout, WorkoutExercise, ExerciseSet, ExerciseCatalogItem } from '../../types/workout';
import { colors, spacing, typography } from '../../theme';
import { RootStackParamList } from '../../navigation/types';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'ActiveWorkout'>;
  route: RouteProp<RootStackParamList, 'ActiveWorkout'>;
};

export default function ActiveWorkoutScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { workoutId } = route.params;

  const [workout, setWorkout] = useState<Workout | null>(null);
  const [loading, setLoading] = useState(true);
  const [seconds, setSeconds] = useState(0);
  const [showCatalog, setShowCatalog] = useState(false);
  const [catalog, setCatalog] = useState<ExerciseCatalogItem[]>([]);
  const [catalogQuery, setCatalogQuery] = useState('');
  const [finishLoading, setFinishLoading] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    fetchWorkout(workoutId).then((w) => {
      setWorkout(w);
      if (w.started_at) {
        const elapsed = Math.floor((Date.now() - new Date(w.started_at).getTime()) / 1000);
        setSeconds(elapsed);
      }
    }).finally(() => setLoading(false));
  }, [workoutId]);

  useEffect(() => {
    timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  };

  const handleAddExercise = async (name: string) => {
    setShowCatalog(false);
    try {
      const ex = await addExercise(workoutId, name);
      setWorkout((w) => w ? { ...w, exercises: [...w.exercises, ex] } : w);
    } catch {
      Alert.alert('Error', 'Could not add exercise.');
    }
  };

  const handleDeleteExercise = async (exerciseId: string) => {
    try {
      await deleteExercise(exerciseId);
      setWorkout((w) => w ? { ...w, exercises: w.exercises.filter((e) => e.id !== exerciseId) } : w);
    } catch {
      Alert.alert('Error', 'Could not delete exercise.');
    }
  };

  const handleAddSet = async (exerciseId: string) => {
    try {
      const set = await addSet(exerciseId);
      setWorkout((w) => {
        if (!w) return w;
        return {
          ...w,
          exercises: w.exercises.map((e) =>
            e.id === exerciseId ? { ...e, sets: [...e.sets, { ...set, completed: false }] } : e,
          ),
        };
      });
    } catch {
      Alert.alert('Error', 'Could not add set.');
    }
  };

  const handleUpdateSet = async (exerciseId: string, setId: string, field: 'reps' | 'weight' | 'completed', value: any) => {
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
    try {
      await updateSet(setId, { [field]: value });
    } catch {
      // revert on error in real app
    }
  };

  const handleFinish = async () => {
    setFinishLoading(true);
    try {
      await finishWorkout(workoutId, { visibility: 'friends' });
      navigation.goBack();
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

  const openCatalog = async () => {
    setShowCatalog(true);
    if (catalog.length === 0) {
      const data = await fetchExerciseCatalog().catch(() => []);
      setCatalog(data);
    }
  };

  const filteredCatalog = catalogQuery
    ? catalog.filter((e) => e.name.toLowerCase().includes(catalogQuery.toLowerCase()))
    : catalog;

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
          style={[styles.finishBtn, finishLoading && styles.finishBtnDisabled]}
          onPress={handleFinish}
          disabled={finishLoading}
        >
          {finishLoading ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.finishText}>Finish</Text>}
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.base, gap: spacing.md, paddingBottom: insets.bottom + 120 }}>
        {workout?.exercises.map((exercise) => (
          <ExerciseCard
            key={exercise.id}
            exercise={exercise}
            onAddSet={() => handleAddSet(exercise.id)}
            onUpdateSet={(setId, field, value) => handleUpdateSet(exercise.id, setId, field, value)}
            onDeleteExercise={() => handleDeleteExercise(exercise.id)}
          />
        ))}

        <Pressable style={styles.addExerciseBtn} onPress={openCatalog}>
          <Feather name="plus" size={18} color={colors.primary} />
          <Text style={styles.addExerciseBtnText}>Add Exercise</Text>
        </Pressable>
      </ScrollView>

      {/* Catalog Modal */}
      <Modal visible={showCatalog} animationType="slide" presentationStyle="pageSheet">
        <View style={[styles.catalogWrap, { paddingTop: insets.top }]}>
          <View style={styles.catalogHeader}>
            <Text style={styles.catalogTitle}>Add Exercise</Text>
            <Pressable onPress={() => setShowCatalog(false)}>
              <Feather name="x" size={22} color={colors.textPrimary} />
            </Pressable>
          </View>
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
          </View>
          <FlatList
            data={filteredCatalog}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <Pressable
                style={({ pressed }) => [styles.catalogItem, pressed && styles.catalogItemPressed]}
                onPress={() => handleAddExercise(item.name)}
              >
                <Text style={styles.catalogItemName}>{item.name}</Text>
                <Text style={styles.catalogItemCategory}>{item.category}</Text>
              </Pressable>
            )}
            contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
            ListEmptyComponent={
              <View style={styles.center}>
                <Text style={styles.emptyText}>No exercises found</Text>
              </View>
            }
          />
        </View>
      </Modal>
    </View>
  );
}

// ─── Exercise Card ─────────────────────────────────────────────────────────────

interface ExerciseCardProps {
  exercise: WorkoutExercise;
  onAddSet: () => void;
  onUpdateSet: (setId: string, field: 'reps' | 'weight' | 'completed', value: any) => void;
  onDeleteExercise: () => void;
}

function ExerciseCard({ exercise, onAddSet, onUpdateSet, onDeleteExercise }: ExerciseCardProps) {
  return (
    <View style={styles.exCard}>
      <View style={styles.exHeader}>
        <Text style={styles.exName}>{exercise.name}</Text>
        <Pressable onPress={onDeleteExercise} style={styles.exDeleteBtn}>
          <Feather name="trash-2" size={16} color={colors.error} />
        </Pressable>
      </View>

      {/* Set headers */}
      <View style={styles.setHeader}>
        <Text style={[styles.setHeaderText, { width: 32 }]}>Set</Text>
        <Text style={[styles.setHeaderText, { flex: 1 }]}>Reps</Text>
        <Text style={[styles.setHeaderText, { flex: 1 }]}>Weight</Text>
        <View style={{ width: 32 }} />
      </View>

      {exercise.sets.map((set, i) => (
        <SetRow
          key={set.id}
          set={set}
          index={i}
          onUpdate={(field, value) => onUpdateSet(set.id, field, value)}
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
}

function SetRow({ set, index, onUpdate }: SetRowProps) {
  return (
    <View style={[styles.setRow, set.completed && styles.setRowCompleted]}>
      <Text style={[styles.setNum, { width: 32 }]}>{index + 1}</Text>
      <TextInput
        style={[styles.setInput, { flex: 1 }]}
        value={set.reps != null ? String(set.reps) : ''}
        onChangeText={(v) => onUpdate('reps', v ? parseInt(v, 10) : null)}
        keyboardType="numeric"
        placeholder="—"
        placeholderTextColor={colors.textMuted}
      />
      <TextInput
        style={[styles.setInput, { flex: 1 }]}
        value={set.weight != null ? String(set.weight) : ''}
        onChangeText={(v) => onUpdate('weight', v ? parseFloat(v) : null)}
        keyboardType="decimal-pad"
        placeholder="—"
        placeholderTextColor={colors.textMuted}
      />
      <Pressable
        style={[styles.checkBox, set.completed && styles.checkBoxDone]}
        onPress={() => onUpdate('completed', !set.completed)}
      >
        {set.completed && <Feather name="check" size={14} color="#fff" />}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
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
  discardText: { fontSize: typography.size.sm, color: colors.error, fontWeight: '600' },
  timerWrap: { alignItems: 'center' },
  timer: { fontSize: typography.size.xl, fontWeight: '700', color: colors.textPrimary, fontVariant: ['tabular-nums'] },
  finishBtn: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    minWidth: 70,
    alignItems: 'center',
  },
  finishBtnDisabled: { opacity: 0.6 },
  finishText: { fontSize: typography.size.sm, fontWeight: '700', color: '#fff' },
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
  addExerciseBtnText: { fontSize: typography.size.base, fontWeight: '600', color: colors.primary },
  emptyText: { fontSize: typography.size.sm, color: colors.textMuted },
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
  exHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  exName: { fontSize: typography.size.base, fontWeight: '700', color: colors.textPrimary },
  exDeleteBtn: { padding: spacing.xs },
  setHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  setHeaderText: { fontSize: typography.size.xs, fontWeight: '600', color: colors.textMuted, textAlign: 'center' },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 4,
    borderRadius: 8,
  },
  setRowCompleted: { backgroundColor: 'rgba(16,185,129,0.06)' },
  setNum: { fontSize: typography.size.sm, fontWeight: '600', color: colors.textMuted, textAlign: 'center' },
  setInput: {
    borderWidth: 1,
    borderColor: colors.borderColor,
    borderRadius: 8,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    fontSize: typography.size.sm,
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
  addSetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
  },
  addSetText: { fontSize: typography.size.sm, color: colors.primary, fontWeight: '600' },
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
  catalogTitle: { fontSize: typography.size.lg, fontWeight: '700', color: colors.textPrimary },
  catalogSearch: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    margin: spacing.base,
    backgroundColor: colors.background.elevated,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  catalogSearchInput: { flex: 1, fontSize: typography.size.sm, color: colors.textPrimary },
  catalogItem: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  catalogItemPressed: { backgroundColor: colors.background.elevated },
  catalogItemName: { fontSize: typography.size.base, fontWeight: '500', color: colors.textPrimary },
  catalogItemCategory: { fontSize: typography.size.xs, color: colors.textSecondary, marginTop: 2 },
});
