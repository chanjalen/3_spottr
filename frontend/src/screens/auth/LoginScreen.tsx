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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AuthStackParamList } from '../../navigation/types';
import { useAuth } from '../../store/AuthContext';
import { apiLogin, apiGoogleAuth } from '../../api/accounts';
import { useGoogleAuth } from '../../hooks/useGoogleAuth';
import { colors, spacing, typography } from '../../theme';

type Props = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'Login'>;
};

export default function LoginScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { signIn } = useAuth();
  const { request, response, promptAsync } = useGoogleAuth();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Handle Google OAuth response
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

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) {
      setError('Please enter your username and password.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { token, user } = await apiLogin(username.trim(), password);
      await signIn(token, user);
    } catch (e: any) {
      const msg = e?.response?.data?.error ?? 'Login failed. Please try again.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    setError(null);
    await promptAsync();
  };

  const handleForgotPassword = () => {
    navigation.navigate('ForgotPassword');
  };

  const isLoading = loading || googleLoading;

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
        <Text style={styles.tagline}>Track. Share. Compete.</Text>

        <View style={styles.form}>
          {error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <View style={styles.field}>
            <Text style={styles.label}>Email or username</Text>
            <TextInput
              style={styles.input}
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              placeholder="you@example.com or your_username"
              placeholderTextColor={colors.textMuted}
              returnKeyType="next"
            />
          </View>

          <View style={styles.field}>
            <View style={styles.passwordHeader}>
              <Text style={styles.label}>Password</Text>
              <Pressable onPress={handleForgotPassword}>
                <Text style={styles.forgotText}>Forgot password?</Text>
              </Pressable>
            </View>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholder="••••••••"
              placeholderTextColor={colors.textMuted}
              returnKeyType="done"
              onSubmitEditing={handleLogin}
            />
          </View>

          <Pressable
            style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}
            onPress={handleLogin}
            disabled={isLoading}
          >
            {loading ? (
              <ActivityIndicator color={colors.textOnPrimary} />
            ) : (
              <Text style={styles.btnText}>Log In</Text>
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
            onPress={handleGoogleSignIn}
            disabled={!request || isLoading}
          >
            {googleLoading ? (
              <ActivityIndicator color={colors.textPrimary} />
            ) : (
              <Text style={styles.googleBtnText}>Continue with Google</Text>
            )}
          </Pressable>

          <Pressable onPress={() => navigation.navigate('Signup')} style={styles.link}>
            <Text style={styles.linkText}>
              Don't have an account?{' '}
              <Text style={styles.linkBold}>Sign up</Text>
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
    fontSize: 42,
    fontWeight: '700',
    color: colors.primary,
    letterSpacing: 1,
    marginBottom: spacing.xs,
  },
  tagline: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    marginBottom: spacing['3xl'],
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
    gap: spacing.xs,
  },
  passwordHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    fontSize: typography.size.sm,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  forgotText: {
    fontSize: typography.size.sm,
    color: colors.primary,
    fontWeight: '500',
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
