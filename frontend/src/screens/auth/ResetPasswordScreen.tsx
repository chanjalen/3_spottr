import React, { useRef, useState } from 'react';
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
import { RouteProp } from '@react-navigation/native';
import { AuthStackParamList } from '../../navigation/types';
import { apiPasswordResetConfirm, apiPasswordResetRequest } from '../../api/accounts';
import { colors, spacing, typography } from '../../theme';

type Props = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'ResetPassword'>;
  route: RouteProp<AuthStackParamList, 'ResetPassword'>;
};

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return email;
  return `${local.charAt(0)}***@${domain}`;
}

function getPasswordStrength(password: string): { ok: boolean; hint: string } {
  if (password.length < 10) return { ok: false, hint: 'At least 10 characters required' };
  if (!/[A-Z]/.test(password)) return { ok: false, hint: 'Add an uppercase letter' };
  if (!/[a-z]/.test(password)) return { ok: false, hint: 'Add a lowercase letter' };
  if (!/[0-9]/.test(password)) return { ok: false, hint: 'Add a number' };
  return { ok: true, hint: 'Strong password' };
}

const CODE_LENGTH = 6;

export default function ResetPasswordScreen({ navigation, route }: Props) {
  const { email } = route.params;
  const insets = useSafeAreaInsets();

  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(''));
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const inputRefs = useRef<(TextInput | null)[]>([]);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const strength = getPasswordStrength(newPassword);
  const codeComplete = digits.every((d) => d !== '');

  const startCooldown = () => {
    setResendCooldown(60);
    cooldownRef.current = setInterval(() => {
      setResendCooldown((prev) => {
        if (prev <= 1) { clearInterval(cooldownRef.current!); return 0; }
        return prev - 1;
      });
    }, 1000);
  };

  const handleDigitChange = (text: string, index: number) => {
    const cleaned = text.replace(/\D/g, '');
    const newDigits = [...digits];
    if (cleaned.length > 1) {
      const pasted = cleaned.slice(0, CODE_LENGTH - index);
      for (let i = 0; i < pasted.length; i++) newDigits[index + i] = pasted[i];
      setDigits(newDigits);
      inputRefs.current[Math.min(index + pasted.length, CODE_LENGTH - 1)]?.focus();
      return;
    }
    newDigits[index] = cleaned;
    setDigits(newDigits);
    if (cleaned && index < CODE_LENGTH - 1) inputRefs.current[index + 1]?.focus();
  };

  const handleKeyPress = (key: string, index: number) => {
    if (key === 'Backspace' && !digits[index] && index > 0) {
      const newDigits = [...digits];
      newDigits[index - 1] = '';
      setDigits(newDigits);
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0) return;
    try {
      await apiPasswordResetRequest(email);
      startCooldown();
      setError(null);
    } catch {
      setError('Could not resend. Please try again.');
    }
  };

  const handleSubmit = async () => {
    const code = digits.join('');
    if (code.length < CODE_LENGTH) { setError('Enter the full 6-digit code.'); return; }
    if (!newPassword) { setError('Enter a new password.'); return; }
    if (!strength.ok) { setError(strength.hint); return; }
    if (newPassword !== confirmPassword) { setError('Passwords do not match.'); return; }

    setLoading(true);
    setError(null);
    try {
      await apiPasswordResetConfirm({ email, code, new_password: newPassword });
      setSuccess(true);
    } catch (e: any) {
      const msg = e?.response?.data?.error ?? 'Reset failed. Please try again.';
      setError(msg);
      setDigits(Array(CODE_LENGTH).fill(''));
      inputRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <View style={[styles.successContainer, { paddingTop: insets.top + spacing['2xl'] }]}>
        <Text style={styles.logo}>Spottr</Text>
        <Text style={styles.successIcon}>✓</Text>
        <Text style={styles.successHeading}>Password reset!</Text>
        <Text style={styles.successSub}>You can now log in with your new password.</Text>
        <Pressable
          style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}
          onPress={() => navigation.navigate('Login')}
        >
          <Text style={styles.btnText}>Back to Login</Text>
        </Pressable>
      </View>
    );
  }

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
        <Text style={styles.heading}>Check your email</Text>
        <Text style={styles.subheading}>
          We sent a 6-digit code to{'\n'}
          <Text style={styles.emailText}>{maskEmail(email)}</Text>
        </Text>

        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <View style={styles.codeRow}>
          {Array.from({ length: CODE_LENGTH }).map((_, i) => (
            <TextInput
              key={i}
              ref={(ref) => { inputRefs.current[i] = ref; }}
              style={[styles.digitBox, digits[i] ? styles.digitBoxFilled : null]}
              value={digits[i]}
              onChangeText={(text) => handleDigitChange(text, i)}
              onKeyPress={({ nativeEvent }) => handleKeyPress(nativeEvent.key, i)}
              keyboardType="number-pad"
              maxLength={CODE_LENGTH}
              selectTextOnFocus
              autoFocus={i === 0}
            />
          ))}
        </View>

        <View style={styles.passwordSection}>
          <View style={styles.field}>
            <Text style={styles.label}>New Password</Text>
            <TextInput
              style={styles.input}
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry
              placeholder="Min 10 chars, upper, lower, number"
              placeholderTextColor={colors.textMuted}
            />
            {newPassword.length > 0 && (
              <Text style={[styles.hintText, { color: strength.ok ? colors.success : colors.error }]}>
                {strength.hint}
              </Text>
            )}
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Confirm Password</Text>
            <TextInput
              style={[
                styles.input,
                confirmPassword.length > 0 && confirmPassword !== newPassword && styles.inputError,
              ]}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              placeholder="Re-enter your password"
              placeholderTextColor={colors.textMuted}
            />
            {confirmPassword.length > 0 && confirmPassword !== newPassword && (
              <Text style={styles.fieldError}>Passwords do not match</Text>
            )}
          </View>
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.btn,
            (!codeComplete || !strength.ok) && styles.btnDisabled,
            pressed && codeComplete && strength.ok && styles.btnPressed,
          ]}
          onPress={handleSubmit}
          disabled={!codeComplete || loading}
        >
          {loading ? (
            <ActivityIndicator color={colors.textOnPrimary} />
          ) : (
            <Text style={styles.btnText}>Reset Password</Text>
          )}
        </Pressable>

        <Pressable
          onPress={handleResend}
          disabled={resendCooldown > 0}
          style={styles.resendBtn}
        >
          <Text style={[styles.resendText, resendCooldown > 0 && styles.resendTextDisabled]}>
            {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : "Didn't get a code? Resend"}
          </Text>
        </Pressable>

        <Pressable onPress={() => navigation.goBack()} style={styles.backLink}>
          <Text style={styles.backLinkText}>← Back</Text>
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
  successContainer: {
    flex: 1,
    backgroundColor: colors.background.base,
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
    fontSize: typography.size.xl,
    fontWeight: '700',
    color: colors.textPrimary,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  subheading: {
    fontSize: typography.size.base,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: spacing['2xl'],
  },
  emailText: {
    color: colors.primary,
    fontWeight: '600',
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
  codeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing['2xl'],
  },
  digitBox: {
    width: 46,
    height: 56,
    borderWidth: 1.5,
    borderColor: colors.borderColor,
    borderRadius: 12,
    textAlign: 'center',
    fontSize: 22,
    fontWeight: '700',
    color: colors.textPrimary,
    backgroundColor: colors.background.elevated,
  },
  digitBoxFilled: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(79,195,224,0.06)',
  },
  passwordSection: {
    width: '100%',
    gap: spacing.md,
    marginBottom: spacing.md,
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
  inputError: {
    borderColor: colors.error,
  },
  hintText: {
    fontSize: typography.size.xs,
    fontWeight: '500',
    marginTop: 2,
  },
  fieldError: {
    fontSize: typography.size.xs,
    color: colors.error,
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
  resendBtn: {
    marginTop: spacing.lg,
    paddingVertical: spacing.sm,
  },
  resendText: {
    fontSize: typography.size.sm,
    color: colors.primary,
    fontWeight: '500',
  },
  resendTextDisabled: {
    color: colors.textMuted,
  },
  backLink: {
    marginTop: spacing.sm,
    paddingVertical: spacing.sm,
  },
  backLinkText: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },
  successIcon: {
    fontSize: 56,
    color: colors.success,
    marginTop: spacing['3xl'],
    marginBottom: spacing.md,
  },
  successHeading: {
    fontSize: typography.size.xl,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  successSub: {
    fontSize: typography.size.base,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing['2xl'],
  },
});
