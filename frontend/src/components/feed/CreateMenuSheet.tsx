import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Platform,
  ScrollView,
  useWindowDimensions,
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
import { fetchStreakInfo, takeRestDay } from '../../api/workouts';

type RootNav = NativeStackNavigationProp<RootStackParamList>;

interface Props {
  sheetRef: React.RefObject<BottomSheet>;
}

export default function CreateMenuSheet({ sheetRef }: Props) {
  const navigation = useNavigation<RootNav>();
  const { width } = useWindowDimensions();
  const pagerRef = useRef<ScrollView>(null);
  const [page, setPage] = useState(0);
  const [restDaysRemaining, setRestDaysRemaining] = useState<number | null>(null);
  const [hasActivityToday, setHasActivityToday] = useState(false);
  const [hasRestToday, setHasRestToday] = useState(false);
  const [restLoading, setRestLoading] = useState(false);
  const [submittingRest, setSubmittingRest] = useState(false);

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} opacity={0.4} />
    ),
    [],
  );

  const resetPages = useCallback(() => {
    setPage(0);
    pagerRef.current?.scrollTo({ x: 0, animated: false });
  }, []);

  const goToPage2 = useCallback(async () => {
    setPage(1);
    pagerRef.current?.scrollTo({ x: width, animated: true });
    // Fetch streak info so rest day display is accurate
    setRestLoading(true);
    try {
      const info = await fetchStreakInfo();
      setRestDaysRemaining(info.rest_info?.rest_days_remaining ?? 0);
      setHasActivityToday(info.has_activity_today ?? false);
      setHasRestToday(info.has_rest_today ?? false);
    } catch {
      setRestDaysRemaining(null);
    } finally {
      setRestLoading(false);
    }
  }, [width]);

  const goToPage1 = useCallback(() => {
    setPage(0);
    pagerRef.current?.scrollTo({ x: 0, animated: true });
  }, []);

  const handlePost = () => {
    sheetRef.current?.close();
    resetPages();
    navigation.navigate('CreatePost');
  };

  const handleGoToCamera = () => {
    sheetRef.current?.close();
    resetPages();
    navigation.navigate('CameraCapture');
  };

  const handleRestDay = () => {
    if (hasRestToday) {
      Alert.alert('Already Rested', "You've already logged a rest day today.");
      return;
    }
    if (hasActivityToday) {
      Alert.alert('Already Active', "You already logged activity today — no rest day needed!");
      return;
    }

    const remaining = restDaysRemaining ?? 0;
    const noProtection = remaining === 0;

    const message = noProtection
      ? "You have no rest days left this week. This won't protect your streak. Even a quick 10-minute walk counts as a check-in instead!"
      : `You have ${remaining} rest day${remaining !== 1 ? 's' : ''} remaining this week.${remaining === 1 ? ' This is your last one!' : ''}\n\nEven a quick 10-minute walk counts as a check-in.`;

    Alert.alert(
      'Rest today?',
      message,
      [
        { text: 'Never mind', style: 'cancel' },
        {
          text: 'Yes, rest today',
          style: noProtection ? 'destructive' : 'default',
          onPress: confirmRestDay,
        },
      ],
    );
  };

  const confirmRestDay = async () => {
    setSubmittingRest(true);
    try {
      const result = await takeRestDay();
      sheetRef.current?.close();
      resetPages();
      if (result.success) {
        Alert.alert(
          result.protected ? 'Rest Day Logged' : 'Rest Day Logged (Unprotected)',
          result.message ?? 'Done.',
        );
      } else {
        Alert.alert('Could Not Log Rest Day', result.error ?? 'Please try again.');
      }
    } catch {
      Alert.alert('Error', 'Could not log rest day. Please try again.');
    } finally {
      setSubmittingRest(false);
    }
  };

  const restSubLabel = (() => {
    if (restLoading) return 'Checking your streak...';
    if (hasRestToday) return 'Already rested today';
    if (hasActivityToday) return 'Already active today';
    if (restDaysRemaining === null) return 'Protect your streak';
    if (restDaysRemaining === 0) return "No rest days left this week";
    return `${restDaysRemaining} rest day${restDaysRemaining !== 1 ? 's' : ''} left this week`;
  })();

  const restDisabled = hasRestToday || hasActivityToday;

  return (
    <BottomSheet
      ref={sheetRef}
      index={-1}
      snapPoints={['46%']}
      enablePanDownToClose
      backdropComponent={renderBackdrop}
      handleIndicatorStyle={styles.handle}
      backgroundStyle={styles.sheetBg}
      onClose={resetPages}
    >
      <BottomSheetView style={{ overflow: 'hidden' }}>
        {/* Horizontal pager */}
        <ScrollView
          ref={pagerRef}
          horizontal
          scrollEnabled={false}
          showsHorizontalScrollIndicator={false}
          pagingEnabled
          style={{ width }}
        >
          {/* ── Page 1: Post / Check-In ── */}
          <View style={[styles.page, { width }]}>
            <Text style={styles.title}>Create</Text>
            <View style={styles.grid}>
              <Pressable
                style={({ pressed }) => [styles.gridItem, pressed && styles.gridItemPressed]}
                onPress={handlePost}
              >
                <LinearGradient
                  colors={['#4FC3E0', '#2FA4C7']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.iconCircle}
                >
                  <Feather name="edit-2" size={24} color="#fff" />
                </LinearGradient>
                <Text style={styles.itemLabel}>Post</Text>
                <Text style={styles.itemSublabel}>Share to Main feed</Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [styles.gridItem, pressed && styles.gridItemPressed]}
                onPress={goToPage2}
              >
                <LinearGradient
                  colors={['#4FC3E0', '#2FA4C7']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.iconCircle}
                >
                  <Feather name="map-pin" size={24} color="#fff" />
                </LinearGradient>
                <Text style={styles.itemLabel}>Check-In</Text>
                <Text style={styles.itemSublabel}>Share to Friends feed</Text>
              </Pressable>
            </View>
          </View>

          {/* ── Page 2: Check-In / Rest Day ── */}
          <View style={[styles.page, { width }]}>
            {/* Page 2 header with back button */}
            <View style={styles.page2Header}>
              <Pressable onPress={goToPage1} style={styles.backBtn} hitSlop={12}>
                <Feather name="chevron-left" size={22} color={colors.textPrimary} />
              </Pressable>
              <Text style={styles.title}>Check-In</Text>
              <View style={{ width: 36 }} />
            </View>

            <View style={styles.grid}>
              {/* Camera Check-In */}
              <Pressable
                style={({ pressed }) => [styles.gridItem, pressed && styles.gridItemPressed]}
                onPress={handleGoToCamera}
              >
                <LinearGradient
                  colors={['#4FC3E0', '#2FA4C7']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.iconCircle}
                >
                  <Feather name="camera" size={24} color="#fff" />
                </LinearGradient>
                <Text style={styles.itemLabel}>Check-In</Text>
                <Text style={styles.itemSublabel}>Snap a photo or video</Text>
              </Pressable>

              {/* Rest Day */}
              <Pressable
                style={({ pressed }) => [
                  styles.gridItem,
                  pressed && !restDisabled && styles.gridItemPressed,
                  restDisabled && styles.gridItemDisabled,
                ]}
                onPress={handleRestDay}
                disabled={submittingRest}
              >
                {submittingRest ? (
                  <ActivityIndicator size="large" color={colors.primary} style={{ height: 56 }} />
                ) : (
                  <View style={styles.restIconCircle}>
                    <Feather
                      name="moon"
                      size={24}
                      color={restDisabled ? colors.textMuted : colors.primary}
                    />
                  </View>
                )}
                <Text style={[styles.itemLabel, restDisabled && { color: colors.textMuted }]}>
                  Rest Day
                </Text>
                <Text style={styles.itemSublabel}>{restSubLabel}</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </BottomSheetView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  sheetBg: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.1,
        shadowRadius: 20,
      },
      android: { elevation: 10 },
    }),
  },
  handle: {
    backgroundColor: colors.borderColor,
    width: 36,
  },
  page: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing['2xl'],
  },
  page2Header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 0,
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: typography.size.lg,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.xl,
  },
  grid: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  gridItem: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.background.elevated,
    borderRadius: 16,
    paddingVertical: spacing.xl,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
      },
      android: { elevation: 2 },
    }),
  },
  gridItemPressed: {
    opacity: 0.75,
    transform: [{ scale: 0.97 }],
  },
  gridItemDisabled: {
    opacity: 0.45,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  restIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
    backgroundColor: colors.background.base,
    borderWidth: 1.5,
    borderColor: colors.border.default,
  },
  itemLabel: {
    fontSize: typography.size.base,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  itemSublabel: {
    fontSize: typography.size.xs,
    fontWeight: '500',
    color: colors.textMuted,
    textAlign: 'center',
    paddingHorizontal: spacing.sm,
  },
});
