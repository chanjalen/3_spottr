import React, { useEffect, useState } from 'react';
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
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AuthStackParamList } from '../../navigation/types';
import { useAuth } from '../../store/AuthContext';
import { apiSignup, apiGoogleAuth } from '../../api/accounts';
import { useGoogleAuth } from '../../hooks/useGoogleAuth';
import { colors, spacing, typography } from '../../theme';

type Props = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'Signup'>;
};

type PasswordStrength = 'weak' | 'fair' | 'strong';

function getPasswordStrength(password: string): { level: PasswordStrength; hint: string } {
  if (!password) return { level: 'weak', hint: '' };
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasDigit = /[0-9]/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);
  const long = password.length >= 12;

  const score = [hasUpper, hasLower, hasDigit, hasSpecial, long].filter(Boolean).length;

  if (score <= 2 || password.length < 10) {
    const missing = [];
    if (!hasUpper) missing.push('uppercase letter');
    if (!hasLower) missing.push('lowercase letter');
    if (!hasDigit) missing.push('number');
    if (password.length < 10) missing.push('10+ characters');
    return { level: 'weak', hint: missing.length ? `Add a ${missing[0]}` : 'Too weak' };
  }
  if (score <= 3) {
    return { level: 'fair', hint: hasSpecial ? 'Getting there!' : 'Add a special character for stronger security' };
  }
  return { level: 'strong', hint: 'Strong password!' };
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDisplayDate(d: Date): string {
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

export default function SignupScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { signIn } = useAuth();
  const { request, response, promptAsync } = useGoogleAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [birthday, setBirthday] = useState<Date | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (response?.type === 'success') {
      const idToken = response.params?.id_token ?? (response as any).authentication?.idToken;
      if (idToken) {
        handleGoogleToken(idToken);
      } else {
        setError('Google sign-in failed. Please try again.');
        setGoogleLoading(false);
      }
    } else if (response?.type === 'error') {
      setError('Google sign-in was cancelled or failed.');
      setGoogleLoading(false);
    } else if (response?.type === 'dismiss') {
      setGoogleLoading(false);
    }
  }, [response]);

  const handleGoogleToken = async (idToken: string) => {
    setGoogleLoading(true);
    setError(null);
    try {
      const { token, user } = await apiGoogleAuth(idToken);
      await signIn(token, user);
    } catch (e: any) {
      const msg = e?.response?.data?.error ?? 'Google sign-in failed. Please try again.';
      setError(msg);
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleGoogleSignUp = async () => {
    setGoogleLoading(true);
    setError(null);
    await promptAsync();
  };

  const strength = getPasswordStrength(password);

  const strengthColor =
    strength.level === 'strong' ? colors.success :
    strength.level === 'fair' ? colors.warning :
    colors.error;

  const strengthBarWidth =
    strength.level === 'strong' ? '100%' :
    strength.level === 'fair' ? '66%' :
    password.length > 0 ? '33%' : '0%';

  const handleDateChange = (event: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === 'android') setShowPicker(false);
    if (event.type === 'dismissed') { setShowPicker(false); return; }
    if (selected) setBirthday(selected);
  };

  const handleSignup = async () => {
    if (!email.trim()) { setError('Email is required.'); return; }
    if (!password) { setError('Password is required.'); return; }
    if (strength.level === 'weak') { setError('Please choose a stronger password.'); return; }
    if (password !== confirmPassword) { setError('Passwords do not match.'); return; }
    if (!birthday) { setError('Birthday is required.'); return; }

    setLoading(true);
    setError(null);
    try {
      const { token, user } = await apiSignup({
        email: email.trim().toLowerCase(),
        password,
        birthday: formatDate(birthday),
      });
      // Do NOT call signIn yet — navigate to email verification with provisional token
      navigation.navigate('EmailVerification', {
        email: email.trim().toLowerCase(),
        token,
      });
    } catch (e: any) {
      const msg = e?.response?.data?.error ?? 'Signup failed. Please try again.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };


  const maxBirthday = new Date();
  maxBirthday.setFullYear(maxBirthday.getFullYear() - 13);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background.base }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.container,
          { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xl },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.logo}>Spottr</Text>
        <Text style={styles.heading}>Create your account</Text>

        <View style={styles.form}>
          {error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {/* Email */}
          <View style={styles.field}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="you@example.com"
              placeholderTextColor={colors.textMuted}
            />
          </View>

          {/* Password with strength meter */}
          <View style={styles.field}>
            <Text style={styles.label}>Password</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholder="Min 10 chars, upper, lower, number"
              placeholderTextColor={colors.textMuted}
            />
            {password.length > 0 && (
              <View style={styles.strengthContainer}>
                <View style={styles.strengthBarTrack}>
                  <View style={[styles.strengthBarFill, { width: strengthBarWidth as any, backgroundColor: strengthColor }]} />
                </View>
                <Text style={[styles.strengthLabel, { color: strengthColor }]}>
                  {strength.level.charAt(0).toUpperCase() + strength.level.slice(1)}
                  {strength.hint ? ` — ${strength.hint}` : ''}
                </Text>
              </View>
            )}
          </View>

          {/* Confirm Password */}
          <View style={styles.field}>
            <Text style={styles.label}>Confirm Password</Text>
            <TextInput
              style={[
                styles.input,
                confirmPassword.length > 0 && confirmPassword !== password && styles.inputError,
              ]}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              placeholder="Re-enter your password"
              placeholderTextColor={colors.textMuted}
            />
            {confirmPassword.length > 0 && confirmPassword !== password && (
              <Text style={styles.fieldError}>Passwords do not match</Text>
            )}
          </View>

          {/* Birthday */}
          <View style={styles.field}>
            <Text style={styles.label}>Birthday</Text>
            <Pressable
              style={styles.dateButton}
              onPress={() => setShowPicker(true)}
            >
              <Text style={birthday ? styles.dateText : styles.datePlaceholder}>
                {birthday ? formatDisplayDate(birthday) : 'Select your birthday'}
              </Text>
            </Pressable>
            {showPicker && (
              <DateTimePicker
                value={birthday ?? maxBirthday}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                maximumDate={maxBirthday}
                minimumDate={new Date(1900, 0, 1)}
                onChange={handleDateChange}
              />
            )}
            {showPicker && Platform.OS === 'ios' && (
              <Pressable
                style={styles.pickerDoneBtn}
                onPress={() => setShowPicker(false)}
              >
                <Text style={styles.pickerDoneText}>Done</Text>
              </Pressable>
            )}
          </View>

          <Pressable
            style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}
            onPress={handleSignup}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={colors.textOnPrimary} />
            ) : (
              <Text style={styles.btnText}>Continue</Text>
            )}
          </Pressable>

          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.googleBtn,
              pressed && styles.btnPressed,
              !request && styles.btnDisabled,
            ]}
            onPress={handleGoogleSignUp}
            disabled={!request || loading || googleLoading}
          >
            {googleLoading ? (
              <ActivityIndicator color={colors.textPrimary} />
            ) : (
              <Text style={styles.googleBtnText}>Continue with Google</Text>
            )}
          </Pressable>

          <Text style={styles.consent}>
            By continuing, you agree to our{' '}
            <Text style={styles.consentLink}>Terms of Service</Text>
            {' '}and{' '}
            <Text style={styles.consentLink}>Privacy Policy</Text>
          </Text>

          <Pressable onPress={() => navigation.navigate('Login')} style={styles.link}>
            <Text style={styles.linkText}>
              Already have an account?{' '}
              <Text style={styles.linkBold}>Log in</Text>
            </Text>
          </Pressable>
        </View>
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
    fontSize: 36,
    fontWeight: '700',
    color: colors.primary,
    letterSpacing: 1,
    marginBottom: spacing.xs,
  },
  heading: {
    fontSize: typography.size.lg,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: spacing.xl,
  },
  form: {
    width: '100%',
    gap: spacing.md,
  },
  errorBox: {
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderRadius: 10,
    padding: spacing.md,
  },
  errorText: {
    color: colors.error,
    fontSize: typography.size.sm,
    textAlign: 'center',
  },
  field: {
    gap: 4,
  },
  label: {
    fontSize: typography.size.sm,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  input: {
    borderWidth: 1.5,
    borderColor: colors.borderColor,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontSize: typography.size.base,
    color: colors.textPrimary,
    backgroundColor: colors.background.elevated,
  },
  strengthContainer: {
    gap: 4,
    marginTop: 4,
  },
  strengthBarTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderColor,
    overflow: 'hidden',
  },
  strengthBarFill: {
    height: 4,
    borderRadius: 2,
  },
  strengthLabel: {
    fontSize: typography.size.xs,
    fontWeight: '500',
  },
  inputError: {
    borderColor: colors.error,
  },
  fieldError: {
    fontSize: typography.size.xs,
    color: colors.error,
  },
  dateButton: {
    borderWidth: 1.5,
    borderColor: colors.borderColor,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    backgroundColor: colors.background.elevated,
  },
  dateText: {
    fontSize: typography.size.base,
    color: colors.textPrimary,
  },
  datePlaceholder: {
    fontSize: typography.size.base,
    color: colors.textMuted,
  },
  pickerDoneBtn: {
    alignSelf: 'flex-end',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  pickerDoneText: {
    color: colors.primary,
    fontWeight: '600',
    fontSize: typography.size.base,
  },
  btn: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.sm,
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
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.borderColor,
  },
  dividerText: {
    fontSize: typography.size.sm,
    color: colors.textMuted,
  },
  googleBtn: {
    borderWidth: 1.5,
    borderColor: colors.borderColor,
    borderRadius: 12,
    paddingVertical: spacing.md,
    alignItems: 'center',
    backgroundColor: colors.background.base,
  },
  googleBtnText: {
    color: colors.textPrimary,
    fontSize: typography.size.base,
    fontWeight: '600',
  },
  consent: {
    fontSize: typography.size.xs,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 18,
  },
  consentLink: {
    color: colors.primary,
  },
  link: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  linkText: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },
  linkBold: {
    color: colors.primary,
    fontWeight: '600',
  },
});
