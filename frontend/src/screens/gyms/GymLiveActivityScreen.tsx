import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Platform,
  ScrollView,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BarChart } from 'react-native-gifted-charts';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp, useFocusEffect } from '@react-navigation/native';
import { GymsStackParamList } from '../../navigation/types';
import { fetchHourlyBusyLevel } from '../../api/gyms';
import { HourlyBusyEntry } from '../../types/gym';
import { colors, spacing, typography } from '../../theme';

type Props = {
  navigation: NativeStackNavigationProp<GymsStackParamList, 'GymLiveActivity'>;
  route: RouteProp<GymsStackParamList, 'GymLiveActivity'>;
};

const BUSY_COLORS: Record<number, string> = {
  1: '#10B981',
  2: '#84CC16',
  3: '#F59E0B',
  4: '#F97316',
  5: '#EF4444',
};

const BUSY_LABELS: Record<number, string> = {
  1: 'Not crowded',
  2: 'Not too crowded',
  3: 'Moderately crowded',
  4: 'Crowded',
  5: 'Very crowded',
};

const SCREEN_WIDTH = Dimensions.get('window').width;
const CHART_HEIGHT = 180;
const Y_AXIS_WIDTH = 96;
// Minimal left pad so the chart sits near the left edge without clipping y-axis labels
const CHART_LEFT_PAD = 0;
const CHART_RIGHT_PAD = spacing.base;
// Width passed to BarChart (bars area only)
const CHART_BARS_WIDTH = SCREEN_WIDTH - CHART_LEFT_PAD - CHART_RIGHT_PAD - Y_AXIS_WIDTH;
const SECTION_HEIGHT = CHART_HEIGHT / 5;
const BAR_SLOT = Math.floor(CHART_BARS_WIDTH / 24);
const BAR_WIDTH = Math.max(5, BAR_SLOT - 3);
const BAR_SPACING = Math.max(2, BAR_SLOT - BAR_WIDTH);
const INITIAL_SPACING = 2;
const X_LABEL_W = 20;

function formatDateLabel(date: Date): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const diffDays = Math.round((today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

function toDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatHourLabel(hour: number): string {
  if (hour === 0) return '12a';
  if (hour < 12) return `${hour}a`;
  if (hour === 12) return '12p';
  return `${hour - 12}p`;
}

function formatHourRange(hour: number): string {
  const fmt = (h: number) => {
    if (h === 0) return '12:00 AM';
    if (h < 12) return `${h}:00 AM`;
    if (h === 12) return '12:00 PM';
    return `${h - 12}:00 PM`;
  };
  return `${fmt(hour)} – ${fmt((hour + 1) % 24)}`;
}

function barCenterX(hour: number): number {
  return INITIAL_SPACING + hour * (BAR_WIDTH + BAR_SPACING) + BAR_WIDTH / 2;
}

export default function GymLiveActivityScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { gymId, gymName } = route.params;

  const [selectedDate, setSelectedDate] = useState(new Date());
  const [data, setData] = useState<HourlyBusyEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEntry, setSelectedEntry] = useState<HourlyBusyEntry | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isToday = formatDateLabel(selectedDate) === 'Today';

  const load = useCallback(async (date: Date, showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      const result = await fetchHourlyBusyLevel(gymId, toDateString(date));
      setData(result);
    } catch {
      // silently ignore
    } finally {
      setLoading(false);
    }
  }, [gymId]);

  useEffect(() => { load(selectedDate, true); }, [selectedDate, load]);

  useFocusEffect(
    useCallback(() => {
      if (!isToday) return;
      load(selectedDate);
      intervalRef.current = setInterval(() => load(selectedDate), 60_000);
      return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
    }, [isToday, selectedDate, load]),
  );

  const goBack = () => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() - 1);
    setSelectedDate(d);
    setSelectedEntry(null);
  };

  const goForward = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    const next = new Date(selectedDate);
    next.setDate(next.getDate() + 1);
    if (next < tomorrow) {
      setSelectedDate(next);
      setSelectedEntry(null);
    }
  };

  const canGoForward = !isToday;
  const hasAnyData = data.some(e => e.total_responses > 0);

  const barData = data.map(entry => ({
    value: entry.rounded_level ?? 0,
    label: '',
    frontColor: entry.rounded_level ? BUSY_COLORS[entry.rounded_level] : colors.border.default,
    onPress: () => {
      if (entry.total_responses > 0) {
        setSelectedEntry(prev => prev?.hour === entry.hour ? null : entry);
      }
    },
  }));

  const xLabels = data.filter(e => e.hour % 2 === 0);

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#4FC3E0', '#6DCFE8', '#A8E2F4', '#D6F2FB', '#FFFFFF']}
        locations={[0, 0.2, 0.5, 0.75, 1]}
      >
        {/* Header */}
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Feather name="arrow-left" size={22} color={colors.textPrimary} />
          </Pressable>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle} numberOfLines={1}>{gymName}</Text>
            <Text style={styles.headerSub}>Live Activity</Text>
          </View>
          <View style={{ width: 40 }} />
        </View>

        {/* Date navigation */}
        <View style={styles.dateRow}>
          <Pressable onPress={goBack} style={styles.dateNavBtn}>
            <Feather name="chevron-left" size={22} color={colors.textPrimary} />
          </Pressable>
          <Text style={styles.dateLabel}>{formatDateLabel(selectedDate)}</Text>
          <Pressable
            onPress={goForward}
            style={[styles.dateNavBtn, !canGoForward && styles.dateNavBtnDisabled]}
            disabled={!canGoForward}
          >
            <Feather name="chevron-right" size={22} color={canGoForward ? colors.textPrimary : colors.textMuted} />
          </Pressable>
        </View>
      </LinearGradient>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          <>
            {/* Chart row: minimal left pad so chart hugs the left edge */}
            <View style={styles.chartRow}>

              {/* Custom y-axis */}
              <View style={[styles.customYAxis, { height: CHART_HEIGHT }]}>
                {([5, 4, 3, 2, 1] as const).map(lvl => (
                  <Text
                    key={lvl}
                    style={[
                      styles.yAxisLabel,
                      { top: (5 - lvl) * SECTION_HEIGHT - 5, color: BUSY_COLORS[lvl] },
                    ]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                  >
                    {BUSY_LABELS[lvl]}
                  </Text>
                ))}
              </View>

              {/* Bar chart */}
              <BarChart
                data={barData}
                barWidth={BAR_WIDTH}
                spacing={BAR_SPACING}
                maxValue={5}
                noOfSections={5}
                isAnimated
                roundedTop
                xAxisThickness={1}
                xAxisColor={colors.border.subtle}
                xAxisLabelsHeight={0}
                yAxisThickness={0}
                hideYAxisText
                yAxisExtraHeight={0}
                rulesColor={colors.border.subtle}
                barBorderRadius={2}
                height={CHART_HEIGHT}
                width={CHART_BARS_WIDTH}
                noOfSectionsBelowXAxis={0}
                initialSpacing={INITIAL_SPACING}
              />
            </View>

            {/* Custom x-axis labels — each label has a full X_LABEL_W container so "12a" never clips */}
            <View style={styles.xAxisRow}>
              {xLabels.map(entry => {
                const cx = barCenterX(entry.hour);
                const left = Math.max(0, cx - X_LABEL_W / 2);
                return (
                  <Text key={entry.hour} style={[styles.xAxisLabel, { left }]}>
                    {formatHourLabel(entry.hour)}
                  </Text>
                );
              })}
            </View>
          </>
        )}

        {/* Legend — compact 2-column grid */}
        {!loading && (
          <View style={styles.legendContainer}>
            {([1, 2, 3, 4, 5] as const).map(lvl => (
              <View key={lvl} style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: BUSY_COLORS[lvl] }]} />
                <Text style={[styles.legendLabel, { color: BUSY_COLORS[lvl] }]}>
                  {BUSY_LABELS[lvl]}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Tap hint / no-data message */}
        {!loading && !hasAnyData && (
          <Text style={styles.noDataText}>No reports logged for this day yet</Text>
        )}
        {!loading && hasAnyData && !selectedEntry && (
          <Text style={styles.tapHint}>Tap a bar to see the breakdown</Text>
        )}

        {/* Inline breakdown card — replaces the modal */}
        {selectedEntry && (
          <View style={styles.breakdownCard}>
            {/* Card header */}
            <View style={styles.breakdownCardHeader}>
              <View>
                <Text style={styles.breakdownCardTime}>{formatHourRange(selectedEntry.hour)}</Text>
                <View style={styles.breakdownCardBadgeRow}>
                  {selectedEntry.rounded_level ? (
                    <View style={[styles.breakdownCardBadge, { backgroundColor: BUSY_COLORS[selectedEntry.rounded_level] + '22' }]}>
                      <Text style={[styles.breakdownCardBadgeText, { color: BUSY_COLORS[selectedEntry.rounded_level] }]}>
                        {selectedEntry.label}
                      </Text>
                    </View>
                  ) : null}
                  <Text style={styles.breakdownCardTotal}>
                    {selectedEntry.total_responses} report{selectedEntry.total_responses !== 1 ? 's' : ''}
                  </Text>
                </View>
              </View>
              <Pressable onPress={() => setSelectedEntry(null)} style={styles.breakdownCloseBtn}>
                <Feather name="x" size={18} color={colors.textMuted} />
              </Pressable>
            </View>

            {/* Per-level breakdown rows */}
            <View style={styles.breakdownList}>
              {([1, 2, 3, 4, 5] as const).map(lvl => {
                const count = selectedEntry.breakdown[String(lvl) as keyof typeof selectedEntry.breakdown];
                const pct = selectedEntry.total_responses > 0
                  ? (count / selectedEntry.total_responses) * 100
                  : 0;
                return (
                  <View key={lvl} style={styles.breakdownRow}>
                    <View style={[styles.breakdownDot, { backgroundColor: BUSY_COLORS[lvl] }]} />
                    <Text style={styles.breakdownLabel} numberOfLines={1}>{BUSY_LABELS[lvl]}</Text>
                    <View style={styles.breakdownBarOuter}>
                      <View
                        style={[
                          styles.breakdownBarFill,
                          { width: `${pct}%` as any, backgroundColor: BUSY_COLORS[lvl] },
                        ]}
                      />
                    </View>
                    <Text style={styles.breakdownCount}>{count}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background.base },
  scrollContent: { paddingBottom: 40 },
  center: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xl },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.sm,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: {
    fontSize: typography.size.base,
    fontFamily: typography.family.bold,
    color: colors.textPrimary,
  },
  headerSub: {
    fontSize: typography.size.xs,
    fontFamily: typography.family.regular,
    color: colors.textMuted,
  },

  // Date nav
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    gap: spacing.lg,
  },
  dateNavBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  dateNavBtnDisabled: { opacity: 0.3 },
  dateLabel: {
    fontSize: typography.size.base,
    fontFamily: typography.family.semibold,
    color: colors.textPrimary,
    minWidth: 130,
    textAlign: 'center',
  },

  // Chart row — CHART_LEFT_PAD on left so chart hugs the edge
  chartRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingLeft: CHART_LEFT_PAD,
    paddingRight: CHART_RIGHT_PAD,
    paddingTop: spacing.sm,
  },

  // Custom y-axis
  customYAxis: {
    width: Y_AXIS_WIDTH,
    position: 'relative',
    overflow: 'visible',
  },
  yAxisLabel: {
    position: 'absolute',
    right: 6,
    width: Y_AXIS_WIDTH - 6,
    fontSize: 6,
    fontFamily: typography.family.regular,
    textAlign: 'right',
  },

  // Custom x-axis labels row — same left offset as chartRow
  xAxisRow: {
    position: 'relative',
    width: CHART_BARS_WIDTH,
    height: 16,
    marginLeft: Y_AXIS_WIDTH + CHART_LEFT_PAD,
    overflow: 'visible',
  },
  xAxisLabel: {
    position: 'absolute',
    width: X_LABEL_W,
    fontSize: 7,
    color: colors.textMuted,
    textAlign: 'center',
  },

  // Legend
  legendContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
    rowGap: 5,
    columnGap: spacing.sm,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    width: '47%',
  },
  legendDot: { width: 7, height: 7, borderRadius: 3.5, flexShrink: 0 },
  legendLabel: {
    fontSize: 10,
    fontFamily: typography.family.regular,
    flexShrink: 1,
  },

  tapHint: {
    textAlign: 'center',
    fontSize: typography.size.xs,
    color: colors.textMuted,
    paddingTop: spacing.md,
  },
  noDataText: {
    textAlign: 'center',
    fontSize: typography.size.sm,
    color: colors.textMuted,
    paddingTop: spacing.xl,
    paddingHorizontal: spacing.xl,
  },

  // Inline breakdown card
  breakdownCard: {
    marginHorizontal: spacing.base,
    marginTop: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.base,
    gap: spacing.sm,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8 },
      android: { elevation: 3 },
    }),
  },
  breakdownCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  breakdownCardTime: {
    fontSize: typography.size.base,
    fontFamily: typography.family.bold,
    color: colors.textPrimary,
  },
  breakdownCardBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: 4,
  },
  breakdownCardBadge: {
    borderRadius: 20,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  breakdownCardBadgeText: {
    fontSize: typography.size.xs,
    fontFamily: typography.family.semibold,
  },
  breakdownCardTotal: {
    fontSize: typography.size.xs,
    color: colors.textMuted,
  },
  breakdownCloseBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -4,
  },

  // Breakdown rows (shared between card and old modal style)
  breakdownList: { gap: 8 },
  breakdownRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  breakdownDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  breakdownLabel: {
    fontSize: typography.size.xs,
    color: colors.textSecondary,
    width: 120,
    flexShrink: 0,
  },
  breakdownBarOuter: {
    flex: 1,
    height: 6,
    backgroundColor: colors.background.elevated,
    borderRadius: 3,
    overflow: 'hidden',
  },
  breakdownBarFill: { height: '100%', borderRadius: 3 },
  breakdownCount: {
    width: 20,
    textAlign: 'right',
    fontSize: typography.size.xs,
    fontFamily: typography.family.semibold,
    color: colors.textPrimary,
  },
});
