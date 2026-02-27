import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
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
import { useAuth } from '../../store/AuthContext';
import { apiUpdateOnboarding, apiCheckUsernameAvailable } from '../../api/accounts';
import { colors, spacing, typography } from '../../theme';

type Props = {
  navigation: NativeStackNavigationProp<OnboardingStackParamList, 'OnboardingStep2'>;
};

type AvailabilityState = 'idle' | 'checking' | 'available' | 'taken' | 'invalid';

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

export default function OnboardingStep2Screen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { updateUser } = useAuth();

  const [username, setUsername] = useState('');
  const [availability, setAvailability] = useState<AvailabilityState>('idle');
  const [availabilityError, setAvailabilityError] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const lower = username.toLowerCase();
    if (!lower) { setAvailability('idle'); return; }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    setAvailability('checking');

    debounceRef.current = setTimeout(async () => {
      try {
        const result = await apiCheckUsernameAvailable(lower);
        if (result.error) {
          setAvailability('invalid');
          setAvailabilityError(result.error);
        } else if (result.available) {
          setAvailability('available');
        } else {
          setAvailability('taken');
        }
      } catch {
        setAvailability('idle');
      }
    }, 500);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [username]);

  const handleContinue = async () => {
    if (!username.trim()) { setError('Please choose a username.'); return; }
    if (availability !== 'available') { setError('Please pick an available username.'); return; }

    setLoading(true);
    setError(null);
    try {
      const { user } = await apiUpdateOnboarding({ username: username.toLowerCase() });
      await updateUser(user);
      navigation.navigate('OnboardingStep3');
    } catch (e: any) {
      const msg = e?.response?.data?.error ?? 'Something went wrong. Please try again.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const availabilityColor =
    availability === 'available' ? colors.success :
    availability === 'taken' || availability === 'invalid' ? colors.error :
    colors.textMuted;

  const availabilityText =
    availability === 'checking' ? 'Checking...' :
    availability === 'available' ? '✓ Available' :
    availability === 'taken' ? '✗ Already taken' :
    availability === 'invalid' ? `✗ ${availabilityError}` :
    username ? 'Enter 3–30 chars: letters, numbers, _ or .' : '';

  const canContinue = availability === 'available' && !loading;

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
        <ProgressDots current={2} total={4} />

        <Text style={styles.heading}>Choose your username</Text>
        <Text style={styles.subheading}>
          This is your unique handle on Spottr.{'\n'}You can change it later.
        </Text>

        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <View style={styles.fieldContainer}>
          <View style={styles.inputRow}>
            <Text style={styles.atSign}>@</Text>
            <TextInput
              style={styles.input}
              value={username}
              onChangeText={(t) => setUsername(t.toLowerCase())}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="your_username"
              placeholderTextColor={colors.textMuted}
              maxLength={30}
              returnKeyType="done"
              onSubmitEditing={handleContinue}
              autoFocus
            />
            {availability === 'checking' && (
              <ActivityIndicator size="small" color={colors.textMuted} style={styles.inputIcon} />
            )}
          </View>
          {availabilityText ? (
            <Text style={[styles.availabilityText, { color: availabilityColor }]}>
              {availabilityText}
            </Text>
          ) : null}
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.btn,
            !canContinue && styles.btnDisabled,
            pressed && canContinue && styles.btnPressed,
          ]}
          onPress={handleContinue}
          disabled={!canContinue}
        >
          {loading ? (
            <ActivityIndicator color={colors.textOnPrimary} />
          ) : (
            <Text style={styles.btnText}>Continue</Text>
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
  fieldContainer: {
    width: '100%',
    marginBottom: spacing['2xl'],
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.borderColor,
    borderRadius: 12,
    backgroundColor: colors.background.elevated,
    paddingHorizontal: spacing.md,
  },
  atSign: {
    fontSize: typography.size.lg,
    color: colors.textMuted,
    fontWeight: '500',
    marginRight: 4,
  },
  input: {
    flex: 1,
    paddingVertical: spacing.sm + 2,
    fontSize: typography.size.lg,
    color: colors.textPrimary,
  },
  inputIcon: {
    marginLeft: spacing.sm,
  },
  availabilityText: {
    fontSize: typography.size.sm,
    marginTop: 6,
    fontWeight: '500',
  },
  btn: {
    width: '100%',
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: spacing.md,
    alignItems: 'center',
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
