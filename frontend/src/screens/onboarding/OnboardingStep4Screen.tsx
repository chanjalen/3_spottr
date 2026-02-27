import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { OnboardingStackParamList } from '../../navigation/types';
import { apiUpdateOnboarding } from '../../api/accounts';
import { colors, spacing, typography } from '../../theme';

type Props = {
  navigation: NativeStackNavigationProp<OnboardingStackParamList, 'OnboardingStep4'>;
};

function ProgressDots({ current, total }: { current: number; total: number }) {
  return (
    <View style={dotStyles.row}>
      {Array.from({ length: total }).map((_, i) => (
        <View key={i} style={[dotStyles.dot, i < current && dotStyles.dotActive]} />
      ))}
    </View>
  );
}

const dotStyles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.borderColor },
  dotActive: { backgroundColor: colors.primary },
});

const FREQUENCY_LABELS = ['0', '1', '2', '3', '4', '5', '6', '7'];
const FREQUENCY_SUBTITLES: Record<number, string> = {
  0: 'Just getting started',
  1: 'Once a week',
  2: 'Twice a week',
  3: '3 days a week',
  4: '4 days a week',
  5: '5 days a week',
  6: '6 days a week',
  7: 'Every day',
};

export default function OnboardingStep4Screen({ navigation }: Props) {
  const insets = useSafeAreaInsets();

  const [frequency, setFrequency] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFinish = async () => {
    if (frequency === null) { setError('Please select how often you work out.'); return; }
    setLoading(true);
    setError(null);
    try {
      const { user } = await apiUpdateOnboarding({ workout_frequency: frequency });
      // Navigate to Complete screen WITHOUT calling updateUser yet — Complete handles the transition
      navigation.navigate('OnboardingComplete', { finalUser: user });
    } catch (e: any) {
      const msg = e?.response?.data?.error ?? 'Something went wrong. Please try again.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background.base }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.container,
          { paddingTop: insets.top + spacing['2xl'], paddingBottom: insets.bottom + spacing.xl },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.logo}>Spottr</Text>
        <ProgressDots current={4} total={4} />

        <Text style={styles.heading}>How often do you work out?</Text>
        <Text style={styles.subheading}>
          We'll use this to personalize your experience.
        </Text>

        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <View style={styles.grid}>
          {FREQUENCY_LABELS.map((label, i) => {
            const selected = frequency === i;
            return (
              <Pressable
                key={i}
                style={({ pressed }) => [
                  styles.freqBtn,
                  selected && styles.freqBtnSelected,
                  pressed && !selected && styles.freqBtnPressed,
                ]}
                onPress={() => setFrequency(i)}
              >
                <Text style={[styles.freqNumber, selected && styles.freqNumberSelected]}>
                  {label}
                </Text>
                <Text style={[styles.freqUnit, selected && styles.freqUnitSelected]}>
                  days
                </Text>
              </Pressable>
            );
          })}
        </View>

        {frequency !== null && (
          <Text style={styles.frequencySubtitle}>{FREQUENCY_SUBTITLES[frequency]}</Text>
        )}

        <Pressable
          style={({ pressed }) => [
            styles.btn,
            frequency === null && styles.btnDisabled,
            pressed && frequency !== null && styles.btnPressed,
          ]}
          onPress={handleFinish}
          disabled={loading || frequency === null}
        >
          {loading ? (
            <ActivityIndicator color={colors.textOnPrimary} />
          ) : (
            <Text style={styles.btnText}>Finish Setup</Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
  },
  logo: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.primary,
    letterSpacing: 1,
    marginBottom: spacing.lg,
  },
  heading: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
    marginTop: spacing['2xl'],
    marginBottom: spacing.sm,
  },
  subheading: {
    fontSize: typography.size.base,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: spacing['2xl'],
  },
  errorBox: {
    width: '100%',
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderRadius: 10,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  errorText: {
    color: colors.error,
    fontSize: typography.size.sm,
    textAlign: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    justifyContent: 'center',
    marginBottom: spacing.md,
    width: '100%',
  },
  freqBtn: {
    width: 72,
    height: 72,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: colors.borderColor,
    backgroundColor: colors.background.elevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  freqBtnSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  freqBtnPressed: {
    opacity: 0.7,
  },
  freqNumber: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  freqNumberSelected: {
    color: colors.textOnPrimary,
  },
  freqUnit: {
    fontSize: typography.size.xs,
    color: colors.textMuted,
    marginTop: 1,
  },
  freqUnitSelected: {
    color: 'rgba(255,255,255,0.8)',
  },
  frequencySubtitle: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xl,
    fontStyle: 'italic',
  },
  btn: {
    width: '100%',
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  btnDisabled: {
    opacity: 0.5,
  },
  btnPressed: {
    opacity: 0.85,
  },
  btnText: {
    color: colors.textOnPrimary,
    fontSize: typography.size.base,
    fontWeight: '700',
  },
});
