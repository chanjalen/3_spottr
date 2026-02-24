import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import BottomSheet, { BottomSheetBackdrop, BottomSheetView } from '@gorhom/bottom-sheet';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, spacing, typography } from '../../theme';
import { RootStackParamList } from '../../navigation/types';
import { takeRestDay, fetchStreakInfo } from '../../api/workouts';
import { StreakDetails } from '../../types/workout';

type RootNav = NativeStackNavigationProp<RootStackParamList>;
type Level = 'root' | 'checkin';

interface Props {
  sheetRef: React.RefObject<BottomSheet>;
  onCheckIn: () => void;
  onCreatePost: () => void;
}

export default function CreateMenuSheet({ sheetRef }: Props) {
  const navigation = useNavigation<RootNav>();
  const [level, setLevel] = useState<Level>('root');
  const [streakInfo, setStreakInfo] = useState<StreakDetails | null>(null);
  const [restLoading, setRestLoading] = useState(false);

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} opacity={0.4} />
    ),
    [],
  );

  const close = () => sheetRef.current?.close();

  const handlePost = () => {
    close();
    navigation.navigate('CreatePost');
  };

  const handleCheckinLevel = async () => {
    setLevel('checkin');
    fetchStreakInfo()
      .then(setStreakInfo)
      .catch(() => setStreakInfo(null));
  };

  const handleQuickCheckin = () => {
    close();
    navigation.navigate('QuickCheckin');
  };

  const handleLogWorkout = () => {
    close();
    navigation.navigate('WorkoutLog');
  };

  const handleRestDay = async () => {
    // Use cached streak info; fall back to a fetch if somehow missing
    let info = streakInfo;
    if (!info) {
      try {
        info = await fetchStreakInfo();
        setStreakInfo(info);
      } catch {
        // proceed with generic message
      }
    }

    let restMessage = 'This will log a rest day for today and protect your streak.';
    if (info) {
      const { rest_days_used, rest_days_allowed, rest_days_remaining } = info.rest_info;
      restMessage =
        `Used: ${rest_days_used} of ${rest_days_allowed} rest days this week\n` +
        `Remaining: ${rest_days_remaining} rest day${rest_days_remaining !== 1 ? 's' : ''} left`;
    }

    Alert.alert(
      'Take Rest Day?',
      restMessage,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            close();
            setRestLoading(true);
            try {
              await takeRestDay();
              Alert.alert('Rest Day Logged ✓', 'Your streak is protected for today!');
            } catch (err: any) {
              const msg = err?.response?.data?.error ?? 'Could not log rest day.';
              Alert.alert('Error', msg);
            } finally {
              setRestLoading(false);
            }
          },
        },
      ],
    );
  };

  const handleSheetChange = (index: number) => {
    if (index === -1) {
      setLevel('root');
      setStreakInfo(null);
    }
  };

  const hasActivityToday = streakInfo?.has_activity_today ?? false;
  const hasRestToday = streakInfo?.has_rest_today ?? false;

  return (
    <BottomSheet
      ref={sheetRef}
      index={-1}
      snapPoints={['50%']}
      enablePanDownToClose
      backdropComponent={renderBackdrop}
      handleIndicatorStyle={styles.handle}
      backgroundStyle={styles.sheetBg}
      onChange={handleSheetChange}
    >
      <BottomSheetView style={styles.content}>
        {level === 'root' ? (
          <RootLevel onPost={handlePost} onCheckin={handleCheckinLevel} />
        ) : (
          <CheckinLevel
            onBack={() => setLevel('root')}
            onQuickCheckin={handleQuickCheckin}
            onLogWorkout={handleLogWorkout}
            onRestDay={handleRestDay}
            restLoading={restLoading}
            hasActivityToday={hasActivityToday}
            hasRestToday={hasRestToday}
          />
        )}
      </BottomSheetView>
    </BottomSheet>
  );
}

// ─── Root Level ───────────────────────────────────────────────────────────────

function RootLevel({ onPost, onCheckin }: { onPost: () => void; onCheckin: () => void }) {
  return (
    <>
      <Text style={styles.title}>Create</Text>
      <View style={styles.cardRow}>
        <BigCard
          emoji="💪"
          label="Check-In"
          sublabel="Activity & streaks"
          onPress={onCheckin}
          hasChevron
        />
        <BigCard
          emoji="✍️"
          label="Post"
          sublabel="Share to feed"
          onPress={onPost}
        />
      </View>
    </>
  );
}

// ─── Check-In Level ───────────────────────────────────────────────────────────

function CheckinLevel({
  onBack,
  onQuickCheckin,
  onLogWorkout,
  onRestDay,
  restLoading,
  streakLoading,
  hasActivityToday,
  hasRestToday,
}: {
  onBack: () => void;
  onQuickCheckin: () => void;
  onLogWorkout: () => void;
  onRestDay: () => void;
  restLoading: boolean;
  hasActivityToday: boolean;
  hasRestToday: boolean;
}) {
  const activityDisabled = hasRestToday;   // rested today → can't check-in
  const restDisabled = hasActivityToday;   // worked out today → can't rest

  return (
    <>
      <View style={styles.subHeader}>
        <Pressable onPress={onBack} style={styles.backBtn} hitSlop={10}>
          <Feather name="arrow-left" size={20} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.title}>Check-In</Text>
        <View style={{ width: 36 }} />
      </View>

      <ListRow
        icon="zap"
        label="Quick Check-In"
        sublabel={activityDisabled ? 'You already rested today' : 'Log activity & protect streak'}
        onPress={onQuickCheckin}
        disabled={activityDisabled}
      />
      <View style={styles.rowDivider} />
      <ListRow
        icon="activity"
        label="Log Workout"
        sublabel={activityDisabled ? 'You already rested today' : 'Start a full workout session'}
        onPress={onLogWorkout}
        disabled={activityDisabled}
      />
      <View style={styles.rowDivider} />
      {restLoading ? (
        <View style={[styles.listRow, { justifyContent: 'center' }]}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      ) : (
        <ListRow
          icon="moon"
          label="Rest Day"
          sublabel={restDisabled ? 'You already logged activity today' : 'Protect streak without working out'}
          onPress={onRestDay}
          iconColor={colors.textMuted}
          disabled={restDisabled}
        />
      )}
    </>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function BigCard({
  emoji,
  label,
  sublabel,
  onPress,
  hasChevron,
}: {
  emoji: string;
  label: string;
  sublabel: string;
  onPress: () => void;
  hasChevron?: boolean;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.bigCard, pressed && styles.pressed]}
      onPress={onPress}
    >
      <LinearGradient
        colors={['#4FC3E0', '#2FA4C7']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.bigCardIcon}
      >
        <Text style={styles.bigCardEmoji}>{emoji}</Text>
      </LinearGradient>
      <Text style={styles.bigCardLabel}>{label}</Text>
      <Text style={styles.bigCardSub}>{sublabel}</Text>
      {hasChevron && (
        <Feather name="chevron-right" size={14} color={colors.textMuted} style={{ marginTop: 2 }} />
      )}
    </Pressable>
  );
}

function ListRow({
  icon,
  label,
  sublabel,
  onPress,
  iconColor,
  disabled,
}: {
  icon: React.ComponentProps<typeof Feather>['name'];
  label: string;
  sublabel: string;
  onPress: () => void;
  iconColor?: string;
  disabled?: boolean;
}) {
  return (
    <Pressable
      style={[styles.listRow, disabled && styles.listRowDisabled]}
      onPress={disabled ? undefined : onPress}
    >
      <LinearGradient
        colors={
          disabled
            ? [colors.border.default + 'aa', colors.border.default + '66']
            : iconColor
            ? [iconColor + '33', iconColor + '22']
            : ['#4FC3E0', '#2FA4C7']
        }
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.listRowIcon}
      >
        <Feather name={icon} size={18} color={disabled ? colors.textMuted : (iconColor ?? '#fff')} />
      </LinearGradient>
      <View style={{ flex: 1 }}>
        <Text style={[styles.listRowLabel, disabled && styles.listRowLabelDisabled]}>{label}</Text>
        <Text style={styles.listRowSub}>{sublabel}</Text>
      </View>
      {!disabled && <Feather name="chevron-right" size={18} color={colors.textMuted} />}
    </Pressable>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

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
    paddingTop: spacing.sm,
    paddingBottom: spacing['2xl'],
  },
  title: {
    fontSize: typography.size.lg,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.lg,
  },
  subHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.background.elevated,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Root level cards
  cardRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  bigCard: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.background.elevated,
    borderRadius: 16,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.sm,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 },
      android: { elevation: 2 },
    }),
  },
  bigCardIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  bigCardEmoji: { fontSize: 24 },
  bigCardLabel: { fontSize: typography.size.base, fontWeight: '700', color: colors.textPrimary },
  bigCardSub: { fontSize: typography.size.xs, color: colors.textMuted, textAlign: 'center' },

  // Checkin level rows
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  listRowDisabled: { opacity: 0.4 },
  listRowIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listRowLabel: { fontSize: typography.size.base, fontWeight: '600', color: colors.textPrimary },
  listRowLabelDisabled: { color: colors.textMuted },
  listRowSub: { fontSize: typography.size.xs, color: colors.textMuted, marginTop: 1 },
  rowDivider: { height: 1, backgroundColor: colors.border.subtle },

  pressed: { opacity: 0.75 },
});
