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
  Modal,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, spacing, typography } from '../../theme';
import { RootStackParamList } from '../../navigation/types';
import { fetchStreakInfo, takeRestDay } from '../../api/workouts';

type RootNav = NativeStackNavigationProp<RootStackParamList>;

interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function CreateMenuSheet({ visible, onClose }: Props) {
  const navigation = useNavigation<RootNav>();
  const { width } = useWindowDimensions();
  const pagerRef = useRef<ScrollView>(null);
  const [page, setPage] = useState(0);
  const [restDaysRemaining, setRestDaysRemaining] = useState<number | null>(null);
  const [hasActivityToday, setHasActivityToday] = useState(false);
  const [hasRestToday, setHasRestToday] = useState(false);
  const [restLoading, setRestLoading] = useState(false);
  const [submittingRest, setSubmittingRest] = useState(false);

  const cardWidth = width - 48; // 24px margin each side
  const cardHeight = 320;

  const resetPages = useCallback(() => {
    setPage(0);
    pagerRef.current?.scrollTo({ x: 0, animated: false });
  }, []);

  const handleClose = useCallback(() => {
    onClose();
    resetPages();
  }, [onClose, resetPages]);

  const goToPage2 = useCallback(async () => {
    setPage(1);
    pagerRef.current?.scrollTo({ x: cardWidth, animated: true });
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
  }, [cardWidth]);

  const goToPage1 = useCallback(() => {
    setPage(0);
    pagerRef.current?.scrollTo({ x: 0, animated: true });
  }, []);

  const handlePost = () => {
    handleClose();
    navigation.navigate('CreatePost');
  };

  const handleGoToCamera = () => {
    handleClose();
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
      handleClose();
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
    if (restDaysRemaining === 0) return 'No rest days left this week';
    return `${restDaysRemaining} rest day${restDaysRemaining !== 1 ? 's' : ''} left this week`;
  })();

  const restDisabled = hasRestToday || hasActivityToday;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        {/* Tap outside to dismiss */}
        <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />

        <View style={[styles.card, { width: cardWidth, height: cardHeight }]}>
          {/* Horizontal pager — fills entire card */}
          <ScrollView
            ref={pagerRef}
            horizontal
            scrollEnabled={false}
            showsHorizontalScrollIndicator={false}
            pagingEnabled
            style={{ width: cardWidth, height: cardHeight }}
          >
            {/* ── Page 1: Post / Check-In ── */}
            <View style={[styles.page1, { width: cardWidth, height: cardHeight }]}>
              <View style={styles.panelRow}>
                {/* Post panel */}
                <Pressable
                  style={({ pressed }) => [styles.panel, pressed && styles.gridItemPressed]}
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
                  <Text style={styles.itemSublabel}>
                    Share to Main feed. Post PRs, achievements, questions, polls & show off your workouts to the world.
                  </Text>
                </Pressable>

                <View style={styles.panelDivider} />

                {/* Check-In panel */}
                <Pressable
                  style={({ pressed }) => [styles.panel, pressed && styles.gridItemPressed]}
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
                  <Text style={styles.itemSublabel}>
                    Update your streak here! Log workouts, rest days & more — everything that keeps your streak alive.
                  </Text>
                </Pressable>
              </View>
            </View>

            {/* ── Page 2: Check-In (big) / Rest Day (small) ── */}
            <View style={[styles.page, { width: cardWidth }]}>
              <View style={styles.page2Header}>
                <Pressable onPress={goToPage1} style={styles.backBtn} hitSlop={12}>
                  <Feather name="chevron-left" size={22} color={colors.textPrimary} />
                </Pressable>
                <Text style={styles.page2Title}>Check-In</Text>
                <View style={{ width: 36 }} />
              </View>

              {/* Big Check-In button */}
              <Pressable
                style={({ pressed }) => [styles.checkinBigBtn, pressed && styles.gridItemPressed]}
                onPress={handleGoToCamera}
              >
                <LinearGradient
                  colors={['#4FC3E0', '#2FA4C7']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.checkinBigGradient}
                >
                  <Feather name="camera" size={30} color="#fff" />
                  <Text style={styles.checkinBigLabel}>Check-In</Text>
                  <Text style={styles.checkinBigSublabel}>Snap a photo or video</Text>
                </LinearGradient>
              </Pressable>

              {/* Small Rest Day row */}
              <Pressable
                style={({ pressed }) => [
                  styles.restRow,
                  pressed && !restDisabled && styles.gridItemPressed,
                  restDisabled && styles.gridItemDisabled,
                ]}
                onPress={handleRestDay}
                disabled={submittingRest}
              >
                {submittingRest ? (
                  <ActivityIndicator size="small" color={colors.primary} style={styles.restRowIcon} />
                ) : (
                  <View style={styles.restRowIcon}>
                    <Feather
                      name="moon"
                      size={18}
                      color={restDisabled ? colors.textMuted : colors.primary}
                    />
                  </View>
                )}
                <View style={styles.restRowText}>
                  <Text style={[styles.restRowLabel, restDisabled && { color: colors.textMuted }]}>
                    Rest Day
                  </Text>
                  <Text style={styles.restRowSublabel}>{restSubLabel}</Text>
                </View>
                {!submittingRest && (
                  <Feather name="chevron-right" size={16} color={colors.textMuted} />
                )}
              </Pressable>
            </View>
          </ScrollView>

          {/* X button — floats over both pages */}
          <Pressable style={styles.xBtnOverlay} onPress={handleClose} hitSlop={12}>
            <Feather name="x" size={20} color={colors.textPrimary} />
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.2,
        shadowRadius: 24,
      },
      android: { elevation: 12 },
    }),
  },
  xBtnOverlay: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  page: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xl,
  },
  page1: {
    // panels go edge-to-edge, no extra padding
  },
  panelRow: {
    flexDirection: 'row',
    flex: 1,
  },
  panel: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    backgroundColor: colors.background.elevated,
    paddingVertical: spacing['2xl'],
    paddingHorizontal: spacing.md,
  },
  panelDivider: {
    width: 1,
    backgroundColor: colors.border.subtle,
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
    lineHeight: 16,
  },

  // Page 2
  page2Header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  page2Title: {
    fontSize: typography.size.lg,
    fontWeight: '700',
    color: colors.textPrimary,
    flex: 1,
    textAlign: 'center',
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Big check-in button
  checkinBigBtn: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: spacing.md,
  },
  checkinBigGradient: {
    paddingVertical: spacing['2xl'],
    alignItems: 'center',
    gap: spacing.sm,
  },
  checkinBigLabel: {
    fontSize: typography.size.xl,
    fontWeight: '800',
    color: '#fff',
  },
  checkinBigSublabel: {
    fontSize: typography.size.sm,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.8)',
  },

  // Small rest day row
  restRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  restRowIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background.elevated,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  restRowText: {
    flex: 1,
    gap: 2,
  },
  restRowLabel: {
    fontSize: typography.size.sm,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  restRowSublabel: {
    fontSize: typography.size.xs,
    color: colors.textMuted,
  },
});
