import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Platform,
  Modal,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/types';
import { colors, spacing, typography } from '../../theme';
import { fetchStreakInfo, takeRestDay } from '../../api/workouts';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'CheckInSelection'>;
};

export default function CheckInSelectionScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [restDaysRemaining, setRestDaysRemaining] = useState<number | null>(null);
  const [hasActivityToday, setHasActivityToday] = useState(false);
  const [hasRestToday, setHasRestToday] = useState(false);
  const [showRestModal, setShowRestModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchStreakInfo()
      .then((info) => {
        setRestDaysRemaining(info.rest_info?.rest_days_remaining ?? 0);
        setHasActivityToday(info.has_activity_today ?? false);
        setHasRestToday(info.has_rest_today ?? false);
      })
      .catch(() => {});
  }, []);

  const handleCheckIn = () => {
    navigation.navigate('CameraCapture');
  };

  const handleRestDayPress = () => {
    if (hasRestToday) {
      Alert.alert('Already Rested', "You've already logged a rest day today.");
      return;
    }
    if (hasActivityToday) {
      Alert.alert('Already Active', "You already logged activity today — no rest day needed!");
      return;
    }
    setShowRestModal(true);
  };

  const handleConfirmRestDay = async () => {
    setSubmitting(true);
    try {
      const result = await takeRestDay();
      setShowRestModal(false);
      if (result.success) {
        if (!result.protected) {
          Alert.alert(
            'Rest Day Logged',
            "Rest day recorded, but you've used all your rest days this week — your streak won't be protected.",
            [{ text: 'OK', onPress: () => navigation.goBack() }],
          );
        } else {
          Alert.alert('Rest Day Logged', result.message ?? 'Your streak is protected.', [
            { text: 'OK', onPress: () => navigation.goBack() },
          ]);
        }
      } else {
        Alert.alert('Could Not Log Rest Day', result.error ?? 'Please try again.');
      }
    } catch {
      setShowRestModal(false);
      Alert.alert('Error', 'Could not log rest day. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const noRestDaysLeft = restDaysRemaining !== null && restDaysRemaining === 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.md }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.closeBtn} hitSlop={12}>
          <Feather name="x" size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>What are you doing?</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Options */}
      <View style={[styles.options, { paddingBottom: insets.bottom + spacing.xl }]}>
        {/* Check-In */}
        <Pressable
          style={({ pressed }) => [styles.optionCard, pressed && styles.optionCardPressed]}
          onPress={handleCheckIn}
        >
          <LinearGradient
            colors={['#4FC3E0', '#2FA4C7']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.optionIconWrap}
          >
            <Feather name="camera" size={32} color="#fff" />
          </LinearGradient>
          <View style={styles.optionText}>
            <Text style={styles.optionTitle}>Check-In</Text>
            <Text style={styles.optionDesc}>
              Snap a photo or video, log your workout, and share with friends.
            </Text>
          </View>
          <Feather name="chevron-right" size={20} color={colors.textMuted} />
        </Pressable>

        {/* Divider */}
        <View style={styles.divider} />

        {/* Rest Day */}
        <Pressable
          style={({ pressed }) => [
            styles.optionCard,
            pressed && styles.optionCardPressed,
            (hasRestToday || hasActivityToday) && styles.optionCardDisabled,
          ]}
          onPress={handleRestDayPress}
        >
          <View style={[styles.optionIconWrap, styles.restIcon]}>
            <Feather name="moon" size={32} color={noRestDaysLeft ? colors.textMuted : colors.primary} />
          </View>
          <View style={styles.optionText}>
            <Text style={[styles.optionTitle, (hasRestToday || hasActivityToday) && styles.textMuted]}>
              Rest Day
            </Text>
            <Text style={styles.optionDesc}>
              {hasRestToday
                ? "You've already rested today."
                : hasActivityToday
                ? "You already logged activity today."
                : restDaysRemaining === null
                ? 'Loading...'
                : noRestDaysLeft
                ? "No rest days left this week — your streak won't be protected."
                : `${restDaysRemaining} rest day${restDaysRemaining !== 1 ? 's' : ''} remaining this week.`}
            </Text>
          </View>
          {!hasRestToday && !hasActivityToday && (
            <Feather name="chevron-right" size={20} color={colors.textMuted} />
          )}
        </Pressable>
      </View>

      {/* Rest Day Confirmation Modal */}
      <Modal
        visible={showRestModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowRestModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Feather name="moon" size={36} color={colors.primary} style={{ marginBottom: spacing.md }} />
            <Text style={styles.modalTitle}>Take a rest day?</Text>

            {noRestDaysLeft ? (
              <Text style={styles.modalWarning}>
                You have no rest days left this week. This rest day won't protect your streak — consider
                checking in instead to keep it alive!
              </Text>
            ) : (
              <Text style={styles.modalBody}>
                You have{' '}
                <Text style={styles.modalHighlight}>{restDaysRemaining} rest day{restDaysRemaining !== 1 ? 's' : ''}</Text>{' '}
                remaining this week. Resting today will protect your streak.
                {restDaysRemaining === 1 && (
                  ' This is your last one — use it wisely!'
                )}
              </Text>
            )}

            <Text style={styles.modalNudge}>
              Even a quick 10-minute walk counts as a check-in.
            </Text>

            <View style={styles.modalActions}>
              <Pressable
                style={[styles.modalBtn, styles.modalBtnSecondary]}
                onPress={() => setShowRestModal(false)}
              >
                <Text style={styles.modalBtnSecondaryText}>Never mind</Text>
              </Pressable>
              <Pressable
                style={[styles.modalBtn, styles.modalBtnPrimary, submitting && { opacity: 0.6 }]}
                onPress={handleConfirmRestDay}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.modalBtnPrimaryText}>Yes, rest today</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.base,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  closeBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: typography.size.base,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  options: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: 0,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xl,
  },
  optionCardPressed: {
    opacity: 0.7,
  },
  optionCardDisabled: {
    opacity: 0.45,
  },
  optionIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  restIcon: {
    backgroundColor: colors.background.elevated,
    borderWidth: 1.5,
    borderColor: colors.border.default,
  },
  optionText: {
    flex: 1,
    gap: 4,
  },
  optionTitle: {
    fontSize: typography.size.lg,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  optionDesc: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  textMuted: {
    color: colors.textMuted,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border.subtle,
    marginVertical: spacing.sm,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: spacing.xl,
    width: '100%',
    alignItems: 'center',
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
  modalTitle: {
    fontSize: typography.size.xl,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  modalBody: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: spacing.sm,
  },
  modalHighlight: {
    color: colors.primary,
    fontWeight: '700',
  },
  modalWarning: {
    fontSize: typography.size.sm,
    color: '#EF4444',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: spacing.sm,
  },
  modalNudge: {
    fontSize: typography.size.xs,
    color: colors.textMuted,
    textAlign: 'center',
    fontStyle: 'italic',
    marginBottom: spacing.xl,
    lineHeight: 16,
  },
  modalActions: {
    flexDirection: 'row',
    gap: spacing.md,
    width: '100%',
  },
  modalBtn: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  modalBtnSecondary: {
    backgroundColor: colors.background.elevated,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  modalBtnSecondaryText: {
    fontSize: typography.size.sm,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  modalBtnPrimary: {
    backgroundColor: colors.primary,
  },
  modalBtnPrimaryText: {
    fontSize: typography.size.sm,
    fontWeight: '700',
    color: '#fff',
  },
});
