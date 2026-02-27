import React, { useRef, useState, useEffect } from 'react';
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
import { useAuth } from '../../store/AuthContext';
import { apiVerifyEmail, apiResendVerification } from '../../api/accounts';
import { colors, spacing, typography } from '../../theme';

type Props = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'EmailVerification'>;
  route: RouteProp<AuthStackParamList, 'EmailVerification'>;
};

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return email;
  const visible = local.charAt(0);
  return `${visible}***@${domain}`;
}

const CODE_LENGTH = 6;

export default function EmailVerificationScreen({ navigation, route }: Props) {
  const { email, token } = route.params;
  const insets = useSafeAreaInsets();
  const { signIn, signOut } = useAuth();
  const autoResend = route.params.autoResend ?? false;

  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(''));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  const inputRefs = useRef<(TextInput | null)[]>([]);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // If the code has likely expired (stuck-account flow), send a fresh one automatically.
    if (autoResend) {
      apiResendVerification(token).catch(() => {});
      startCooldown();
    }
    return () => {
      if (cooldownRef.current) clearInterval(cooldownRef.current);
    };
  }, []);

  const startCooldown = () => {
    setResendCooldown(60);
    cooldownRef.current = setInterval(() => {
      setResendCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(cooldownRef.current!);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleDigitChange = (text: string, index: number) => {
    const cleaned = text.replace(/\D/g, '');
    const newDigits = [...digits];

    if (cleaned.length > 1) {
      // Handle paste: fill from current index
      const pasted = cleaned.slice(0, CODE_LENGTH - index);
      for (let i = 0; i < pasted.length; i++) {
        newDigits[index + i] = pasted[i];
      }
      setDigits(newDigits);
      const nextFocus = Math.min(index + pasted.length, CODE_LENGTH - 1);
      inputRefs.current[nextFocus]?.focus();
      if (index + pasted.length >= CODE_LENGTH) {
        submitCode(newDigits.join(''));
      }
      return;
    }

    newDigits[index] = cleaned;
    setDigits(newDigits);
    if (cleaned && index < CODE_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
    if (index === CODE_LENGTH - 1 && cleaned) {
      submitCode(newDigits.join(''));
    }
  };

  const handleKeyPress = (key: string, index: number) => {
    if (key === 'Backspace' && !digits[index] && index > 0) {
      const newDigits = [...digits];
      newDigits[index - 1] = '';
      setDigits(newDigits);
      inputRefs.current[index - 1]?.focus();
    }
  };

  const submitCode = async (code: string) => {
    if (code.length < CODE_LENGTH) return;
    setLoading(true);
    setError(null);
    try {
      const { user } = await apiVerifyEmail(code, token);
      await signIn(token, user);
    } catch (e: any) {
      const msg = e?.response?.data?.error ?? 'Verification failed. Please try again.';
      setError(msg);
      setDigits(Array(CODE_LENGTH).fill(''));
      inputRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = () => {
    submitCode(digits.join(''));
  };

  const handleResend = async () => {
    if (resendCooldown > 0) return;
    try {
      await apiResendVerification(token);
      startCooldown();
      setError(null);
    } catch (e: any) {
      const msg = e?.response?.data?.detail ?? 'Could not resend. Please try again later.';
      setError(msg);
    }
  };

  const codeComplete = digits.every((d) => d !== '');

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

        <Pressable
          style={({ pressed }) => [
            styles.btn,
            !codeComplete && styles.btnDisabled,
            pressed && codeComplete && styles.btnPressed,
          ]}
          onPress={handleSubmit}
          disabled={!codeComplete || loading}
        >
          {loading ? (
            <ActivityIndicator color={colors.textOnPrimary} />
          ) : (
            <Text style={styles.btnText}>Verify</Text>
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

        <Pressable
          onPress={() => {
            if (navigation.canGoBack()) {
              navigation.goBack();
            } else {
              // Stuck-account flow: sign out to return to the login/signup screens.
              signOut();
            }
          }}
          style={styles.backLink}
        >
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
});
