import React, { useEffect, useRef, useState } from 'react';
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
  Linking,
} from 'react-native';
import { exchangeCodeAsync } from 'expo-auth-session';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AuthStackParamList } from '../../navigation/types';
import { useAuth } from '../../store/AuthContext';
import { apiSignup, apiGoogleAuth } from '../../api/accounts';
import { apiClient } from '../../api/client';
import { useGoogleAuth, googleRedirectUri } from '../../hooks/useGoogleAuth';
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

/** Parse "MM-DD-YYYY" text into a Date. Returns null if invalid. */
function parseBirthdayText(text: string): Date | null {
  const parts = text.split('-');
  if (parts.length !== 3) return null;
  const [m, d, y] = parts;
  if (m.length !== 2 || d.length !== 2 || y.length !== 4) return null;
  const month = parseInt(m, 10);
  const day = parseInt(d, 10);
  const year = parseInt(y, 10);
  if (isNaN(month) || isNaN(day) || isNaN(year)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900) return null;
  const date = new Date(year, month - 1, day);
  // Catch invalid dates like Feb 30
  if (date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

/** Format a Date as YYYY-MM-DD for the backend. */
function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function SignupScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { signIn } = useAuth();
  const { request, response, promptAsync } = useGoogleAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [birthdayText, setBirthdayText] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submittingRef = useRef(false);

  // Warm up Django when the screen mounts so the first real signup request
  // doesn't hit a cold server. The 401 response is expected and ignored.
  useEffect(() => {
    apiClient.get('/accounts/api/me/').catch(() => {});
  }, []);

  useEffect(() => {
    if (!response) return;

    if (response.type === 'success') {
      // Code flow (PKCE): exchange the auth code for tokens at Google's token endpoint.
      const code = response.params?.code;
      if (!code) {
        setError('Google sign-in failed. Please try again.');
        setGoogleLoading(false);
        return;
      }

      const clientId = Platform.OS === 'ios'
        ? (process.env.EXPO_PUBLIC_APP_VARIANT === 'development' ? (process.env.EXPO_PUBLIC_GOOGLE_IOS_DEV_CLIENT_ID ?? '') : (process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? ''))
        : (process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '');

      exchangeCodeAsync(
        {
          code,
          redirectUri: googleRedirectUri,
          clientId,
          extraParams: request?.codeVerifier ? { code_verifier: request.codeVerifier } : {},
        },
        { tokenEndpoint: 'https://oauth2.googleapis.com/token' },
      ).then((tokenResult) => {
        if (tokenResult.idToken) {
          handleGoogleToken(tokenResult.idToken);
        } else {
          setError('Google sign-in failed. Please try again.');
          setGoogleLoading(false);
        }
      }).catch(() => {
        setError('Google sign-in failed. Please try again.');
        setGoogleLoading(false);
      });
    } else if (response.type === 'error') {
      setError('Google sign-in was cancelled or failed.');
      setGoogleLoading(false);
    } else if (response.type === 'dismiss') {
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

  /** Auto-format birthday text as MM-DD-YYYY while typing. */
  const handleBirthdayChange = (text: string) => {
    // Strip everything that isn't a digit
    const digits = text.replace(/\D/g, '').slice(0, 8);
    let formatted = digits;
    if (digits.length > 4) {
      formatted = `${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4)}`;
    } else if (digits.length > 2) {
      formatted = `${digits.slice(0, 2)}-${digits.slice(2)}`;
    }
    setBirthdayText(formatted);
  };

  const handleSignup = async () => {
    if (submittingRef.current) return;

    if (!email.trim()) { setError('Email is required.'); return; }
    if (!password) { setError('Password is required.'); return; }
    if (strength.level === 'weak') { setError('Please choose a stronger password.'); return; }
    if (password !== confirmPassword) { setError('Passwords do not match.'); return; }

    const birthday = parseBirthdayText(birthdayText);
    if (!birthday) { setError('Please enter a valid birthday (MM-DD-YYYY).'); return; }

    const today = new Date();
    const age = today.getFullYear() - birthday.getFullYear() -
      (today < new Date(today.getFullYear(), birthday.getMonth(), birthday.getDate()) ? 1 : 0);
    if (age < 13) { setError('You must be at least 13 years old to sign up.'); return; }
    if (birthday > today) { setError('Birthday cannot be in the future.'); return; }

    submittingRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const payload = {
        email: email.trim().toLowerCase(),
        password,
        birthday: toISODate(birthday),
      };
      let result: { token: string; user: any };
      try {
        result = await apiSignup(payload);
      } catch (firstErr: any) {
        // Only retry on network/timeout errors (no response received).
        // If the server responded with a 4xx/5xx, surface that immediately.
        // Retry is safe because the backend is idempotent for unverified accounts:
        // if the first request reached the server, it returns the existing token
        // without sending another email.
        if (firstErr?.response) throw firstErr;
        // Small delay in case the server is still finishing the first request
        await new Promise((r) => setTimeout(r, 1500));
        result = await apiSignup(payload);
      }
      navigation.navigate('EmailVerification', {
        email: payload.email,
        token: result.token,
      });
    } catch (e: any) {
      const msg = e?.response?.data?.error ?? e?.response?.data?.detail ?? 'Signup failed. Please try again.';
      setError(msg);
    } finally {
      setLoading(false);
      submittingRef.current = false;
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

          {/* Birthday — plain text input, auto-formats MM-DD-YYYY */}
          <View style={styles.field}>
            <Text style={styles.label}>Birthday</Text>
            <TextInput
              style={styles.input}
              value={birthdayText}
              onChangeText={handleBirthdayChange}
              keyboardType="number-pad"
              placeholder="MM-DD-YYYY"
              placeholderTextColor={colors.textMuted}
              maxLength={10}
            />
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
            <Text
              style={styles.consentLink}
              onPress={() => Linking.openURL('https://api.spottrgym.app/terms/')}
            >
              Terms of Service
            </Text>
            {' '}and{' '}
            <Text
              style={styles.consentLink}
              onPress={() => Linking.openURL('https://api.spottrgym.app/privacy/')}
            >
              Privacy Policy
            </Text>
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
