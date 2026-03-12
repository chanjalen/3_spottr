import React, { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Platform,
  Alert,
  Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  startWorkout,
  fetchActiveWorkout,
  fetchLogStats,
  fetchTemplates,
  startFromTemplate,
  deleteTemplate,
  fetchTemplateDetail,
} from '../../api/workouts';
import { Workout, WorkoutLogStats, WorkoutTemplate, TemplateDetail } from '../../types/workout';
import { colors, spacing, typography } from '../../theme';
import { RootStackParamList } from '../../navigation/types';
import { useActiveWorkout } from '../../store/ActiveWorkoutContext';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'WorkoutLog'>;
  route: { params?: { fromCheckin?: boolean } };
};

export default function WorkoutLogScreen({ navigation, route }: Props) {
  const fromCheckin = route.params?.fromCheckin ?? false;
  const checkinMediaUri = route.params?.checkinMediaUri;
  const checkinMediaType = route.params?.checkinMediaType;
  const { fromCheckin: contextFromCheckin, checkinMedia, staleWorkoutCleared, clearStaleNotice } = useActiveWorkout();
  const insets = useSafeAreaInsets();
  const [stats, setStats] = useState<WorkoutLogStats | null>(null);
  const [activeWorkout, setActiveWorkout] = useState<Workout | null>(null);
  const [templates, setTemplates] = useState<WorkoutTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [startLoading, setStartLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState<WorkoutTemplate | null>(null);
  const [previewDetail, setPreviewDetail] = useState<TemplateDetail | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      const [logStats, active, tmplList] = await Promise.all([
        fetchLogStats().catch(() => null),
        fetchActiveWorkout().catch(() => null),
        fetchTemplates().catch(() => []),
      ]);
      setStats(logStats);
      setActiveWorkout(active);
      setTemplates(tmplList);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Reload every time this screen comes into focus (handles navigate-back after discard)
  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Show notice if a stale workout was auto-cleared in the background
  useEffect(() => {
    if (staleWorkoutCleared) {
      Alert.alert(
        'Workout Cleared',
        'Your previous workout was automatically cleared after 2 hours of inactivity.',
        [{ text: 'OK', onPress: clearStaleNotice }],
      );
    }
  }, [staleWorkoutCleared, clearStaleNotice]);

  const handleStart = async () => {
    setStartLoading(true);
    try {
      const workout = await startWorkout();
      navigation.navigate('ActiveWorkout', { workoutId: workout.id, fromCheckin, checkinMediaUri, checkinMediaType });
    } catch {
      Alert.alert('Error', 'Could not start workout.');
    } finally {
      setStartLoading(false);
    }
  };

  const handleStartTemplate = async (template: WorkoutTemplate) => {
    setPreviewTemplate(null);
    setPreviewDetail(null);
    try {
      const workout = await startFromTemplate(template.id);
      navigation.navigate('ActiveWorkout', { workoutId: workout.id, fromCheckin, checkinMediaUri, checkinMediaType, templateId: template.id });
    } catch {
      Alert.alert('Error', 'Could not start workout from template.');
    }
  };

  const handlePreviewTemplate = async (template: WorkoutTemplate) => {
    setPreviewTemplate(template);
    setPreviewDetail(null);
    setPreviewLoading(true);
    try {
      const detail = await fetchTemplateDetail(template.id);
      setPreviewDetail(detail);
    } catch {
      // silently fail — modal still shows with basic info
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleDeleteTemplate = (template: WorkoutTemplate) => {
    Alert.alert(
      'Delete Template',
      `Delete "${template.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteTemplate(template.id).catch(() => {});
            setTemplates((prev) => prev.filter((t) => t.id !== template.id));
          },
        },
      ],
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background.base }}>
      {/* Header */}
      <View style={[styles.headerBar, { paddingTop: insets.top }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Feather name="x" size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Log Workout</Text>
        <Pressable onPress={() => navigation.navigate('StreakDetails')}>
          <Feather name="zap" size={22} color={colors.primary} />
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.base, gap: spacing.md, paddingBottom: insets.bottom + 100 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); load(); }}
              tintColor={colors.primary}
            />
          }
        >
          {/* Weekly stats tiles */}
          {stats && (
            <View style={styles.statsRow}>
              <StatTile label="Workouts" value={String(stats.workouts_count)} icon="activity" />
              <StatTile label="Total Time" value={stats.total_time} icon="clock" />
              <StatTile label="Total Sets" value={String(stats.total_sets)} icon="layers" />
            </View>
          )}

          {/* Resume active workout */}
          {activeWorkout && (
            <Pressable
              style={styles.resumeCard}
              onPress={() => navigation.navigate('ActiveWorkout', {
                workoutId: activeWorkout.id,
                fromCheckin: contextFromCheckin || fromCheckin,
                checkinMediaUri: checkinMedia?.uri ?? checkinMediaUri,
                checkinMediaType: checkinMedia?.type ?? checkinMediaType,
              })}
            >
              <View style={styles.resumeLeft}>
                <Feather name="activity" size={20} color={colors.primary} />
                <View>
                  <Text style={styles.resumeTitle}>Resume Workout</Text>
                  <Text style={styles.resumeSub}>
                    {activeWorkout.exercise_count} exercises · {activeWorkout.total_sets} sets
                  </Text>
                </View>
              </View>
              <Feather name="chevron-right" size={20} color={colors.textMuted} />
            </Pressable>
          )}

          {/* Start empty button */}
          <Pressable
            style={({ pressed }) => [styles.startBtn, pressed && styles.startBtnPressed]}
            onPress={handleStart}
            disabled={startLoading}
          >
            {startLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Feather name="plus" size={20} color="#fff" />
                <Text style={styles.startBtnText}>Start Empty Workout</Text>
              </>
            )}
          </Pressable>

          {/* Templates section */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>My Templates</Text>
          </View>

          {templates.length === 0 ? (
            <View style={styles.emptyTemplates}>
              <Text style={styles.emptyTemplatesText}>
                No templates yet. Finish a workout and save it as a template.
              </Text>
            </View>
          ) : (
            templates.map((tmpl) => (
              <TemplateCard
                key={tmpl.id}
                template={tmpl}
                onPreview={() => handlePreviewTemplate(tmpl)}
                onStart={() => handleStartTemplate(tmpl)}
                onDelete={() => handleDeleteTemplate(tmpl)}
              />
            ))
          )}

          {/* Recent workouts */}
          {stats && stats.recent_workouts.filter((w) => !w.is_active).length > 0 && (
            <>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Recent Workouts</Text>
              </View>
              {stats.recent_workouts
                .filter((w) => !w.is_active)
                .map((w) => (
                  <View key={w.id} style={styles.recentCard}>
                    <View style={styles.recentLeft}>
                      <Text style={styles.recentName}>{w.name}</Text>
                      <Text style={styles.recentMeta}>
                        {w.time_ago} · {w.duration} · {w.exercise_count} exercises
                      </Text>
                    </View>
                    <Text style={styles.recentSets}>{w.total_sets} sets</Text>
                  </View>
                ))}
            </>
          )}
        </ScrollView>
      )}

      {/* ── Template Preview Modal ───────────────────────────────────── */}
      <Modal
        visible={!!previewTemplate}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => { setPreviewTemplate(null); setPreviewDetail(null); }}
      >
        <View style={[styles.previewWrap, { paddingTop: insets.top }]}>
          {/* Header */}
          <View style={styles.previewHeader}>
            <Pressable onPress={() => { setPreviewTemplate(null); setPreviewDetail(null); }}>
              <Feather name="x" size={22} color={colors.textPrimary} />
            </Pressable>
            <Text style={styles.previewTitle} numberOfLines={1}>{previewTemplate?.name}</Text>
            <View style={{ width: 22 }} />
          </View>

          {/* Exercise list */}
          <ScrollView
            contentContainerStyle={{ padding: spacing.base, gap: spacing.md, paddingBottom: insets.bottom + 100 }}
          >
            {previewLoading ? (
              <View style={styles.previewCenter}>
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : previewDetail ? (
              previewDetail.exercises.map((ex, ei) => (
                <View key={ei} style={styles.previewExCard}>
                  <Text style={styles.previewExName}>{ex.name}</Text>
                  {ex.category ? <Text style={styles.previewExCategory}>{ex.category}</Text> : null}
                  <View style={styles.previewSetHeader}>
                    <Text style={[styles.previewSetHeaderText, { width: 32 }]}>Set</Text>
                    <Text style={[styles.previewSetHeaderText, { flex: 1 }]}>Reps</Text>
                    <Text style={[styles.previewSetHeaderText, { flex: 1 }]}>Weight (lbs)</Text>
                  </View>
                  {ex.sets.map((s, si) => (
                    <View key={si} style={styles.previewSetRow}>
                      <Text style={[styles.previewSetNum, { width: 32 }]}>{si + 1}</Text>
                      <Text style={[styles.previewSetVal, { flex: 1 }]}>{s.reps || '—'}</Text>
                      <Text style={[styles.previewSetVal, { flex: 1 }]}>{s.weight || '—'}</Text>
                    </View>
                  ))}
                </View>
              ))
            ) : (
              <View style={styles.previewCenter}>
                <Text style={styles.previewEmptyText}>Could not load details.</Text>
              </View>
            )}
          </ScrollView>

          {/* Start button */}
          <View style={[styles.previewFooter, { paddingBottom: insets.bottom + 16 }]}>
            <Pressable
              style={styles.previewStartBtn}
              onPress={() => previewTemplate && handleStartTemplate(previewTemplate)}
            >
              <Feather name="play" size={18} color="#fff" />
              <Text style={styles.previewStartText}>Start Workout</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Stat tile ────────────────────────────────────────────────────────────────

function StatTile({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: React.ComponentProps<typeof Feather>['name'];
}) {
  return (
    <View style={styles.statTile}>
      <Feather name={icon} size={16} color={colors.primary} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

// ─── Template card ────────────────────────────────────────────────────────────

function TemplateCard({
  template,
  onPreview,
  onStart,
  onDelete,
}: {
  template: WorkoutTemplate;
  onPreview: () => void;
  onStart: () => void;
  onDelete: () => void;
}) {
  return (
    <Pressable style={styles.templateCard} onPress={onPreview}>
      <View style={styles.templateLeft}>
        <Text style={styles.templateName}>{template.name}</Text>
        <Text style={styles.templateMeta}>
          {template.exercise_count} exercises
          {template.exercises.length > 0 &&
            ` · ${template.exercises
              .slice(0, 3)
              .map((e) => e.name)
              .join(', ')}${template.exercise_count > 3 ? ' +more' : ''}`}
        </Text>
      </View>
      <View style={styles.templateActions}>
        <Pressable onPress={onDelete} style={styles.templateDeleteBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Feather name="trash-2" size={14} color={colors.error} />
        </Pressable>
        <Pressable style={styles.templateStartBtn} onPress={onStart}>
          <Text style={styles.templateStartText}>Start</Text>
        </Pressable>
      </View>
    </Pressable>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
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
  headerTitle: {
    fontSize: typography.size.lg,
    fontFamily: typography.family.bold,
    color: colors.textPrimary,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Stats row
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  statTile: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: spacing.md,
    alignItems: 'center',
    gap: 4,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6 },
      android: { elevation: 2 },
    }),
  },
  statValue: {
    fontSize: typography.size.lg,
    fontFamily: typography.family.bold,
    color: colors.textPrimary,
  },
  statLabel: {
    fontSize: typography.size.xs,
    fontFamily: typography.family.regular,
    color: colors.textMuted,
  },

  // Resume card
  resumeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: spacing.base,
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  resumeLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  resumeTitle: {
    fontSize: typography.size.base,
    fontFamily: typography.family.semibold,
    color: colors.textPrimary,
  },
  resumeSub: {
    fontSize: typography.size.xs,
    fontFamily: typography.family.regular,
    color: colors.textSecondary,
  },

  // Start button
  startBtn: {
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: spacing.base,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    ...Platform.select({
      ios: { shadowColor: 'rgba(79,195,224,0.4)', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 1, shadowRadius: 12 },
      android: { elevation: 4 },
    }),
  },
  startBtnPressed: { opacity: 0.85 },
  startBtnText: {
    fontSize: typography.size.base,
    fontFamily: typography.family.bold,
    color: '#fff',
  },

  // Section
  sectionHeader: { marginTop: spacing.sm },
  sectionTitle: {
    fontSize: typography.size.base,
    fontFamily: typography.family.semibold,
    color: colors.textPrimary,
  },

  // Empty templates
  emptyTemplates: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: spacing.base,
    alignItems: 'center',
  },
  emptyTemplatesText: {
    fontSize: typography.size.sm,
    fontFamily: typography.family.regular,
    color: colors.textMuted,
    textAlign: 'center',
  },

  // Template card
  templateCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6 },
      android: { elevation: 2 },
    }),
  },
  templateLeft: { flex: 1 },
  templateName: {
    fontSize: typography.size.base,
    fontFamily: typography.family.semibold,
    color: colors.textPrimary,
  },
  templateMeta: {
    fontSize: typography.size.xs,
    fontFamily: typography.family.regular,
    color: colors.textMuted,
    marginTop: 2,
  },
  templateActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  templateDeleteBtn: { padding: spacing.xs },
  templateStartBtn: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  templateStartText: {
    fontSize: typography.size.sm,
    fontFamily: typography.family.semibold,
    color: '#fff',
  },

  // Template preview modal
  previewWrap: { flex: 1, backgroundColor: colors.background.base },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  previewTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: typography.size.lg,
    fontFamily: typography.family.bold,
    color: colors.textPrimary,
    marginHorizontal: spacing.sm,
  },
  previewCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 48 },
  previewEmptyText: {
    fontSize: typography.size.sm,
    fontFamily: typography.family.regular,
    color: colors.textMuted,
  },
  previewExCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: spacing.md,
    gap: spacing.xs,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6 },
      android: { elevation: 2 },
    }),
  },
  previewExName: {
    fontSize: typography.size.base,
    fontFamily: typography.family.bold,
    color: colors.textPrimary,
  },
  previewExCategory: {
    fontSize: typography.size.xs,
    fontFamily: typography.family.regular,
    color: colors.textMuted,
    textTransform: 'capitalize',
    marginBottom: 4,
  },
  previewSetHeader: { flexDirection: 'row', paddingHorizontal: 2, marginTop: 4 },
  previewSetHeaderText: {
    fontSize: typography.size.xs,
    fontFamily: typography.family.semibold,
    color: colors.textMuted,
    textAlign: 'center',
  },
  previewSetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 3,
    paddingHorizontal: 2,
  },
  previewSetNum: {
    fontSize: typography.size.sm,
    fontFamily: typography.family.semibold,
    color: colors.textMuted,
    textAlign: 'center',
  },
  previewSetVal: {
    fontSize: typography.size.sm,
    fontFamily: typography.family.regular,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  previewFooter: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border.subtle,
    backgroundColor: colors.background.base,
  },
  previewStartBtn: {
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: spacing.base,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    ...Platform.select({
      ios: { shadowColor: 'rgba(79,195,224,0.4)', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 1, shadowRadius: 12 },
      android: { elevation: 4 },
    }),
  },
  previewStartText: {
    fontSize: typography.size.base,
    fontFamily: typography.family.bold,
    color: '#fff',
  },

  // Recent workouts
  recentCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  recentLeft: { flex: 1 },
  recentName: {
    fontSize: typography.size.base,
    fontFamily: typography.family.semibold,
    color: colors.textPrimary,
  },
  recentMeta: {
    fontSize: typography.size.xs,
    fontFamily: typography.family.regular,
    color: colors.textMuted,
    marginTop: 2,
  },
  recentSets: {
    fontSize: typography.size.sm,
    fontFamily: typography.family.medium,
    color: colors.textSecondary,
  },
});
