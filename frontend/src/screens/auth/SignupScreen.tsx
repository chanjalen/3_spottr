import React, { useState } from 'react';
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
import { apiSignup } from '../../api/accounts';
import { colors, spacing, typography } from '../../theme';

type Props = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'Signup'>;
};

interface FieldErrors {
  username?: string;
  email?: string;
  display_name?: string;
  phone_number?: string;
  birthday?: string;
  password?: string;
  password_confirm?: string;
}

export default function SignupScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { signIn } = useAuth();

  const [form, setForm] = useState({
    username: '',
    email: '',
    display_name: '',
    phone_number: '',
    birthday: '',
    password: '',
    password_confirm: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const setField = (key: keyof typeof form) => (val: string) => {
    setForm((f) => ({ ...f, [key]: val }));
    setFieldErrors((e) => ({ ...e, [key]: undefined }));
  };

  const validate = (): boolean => {
    const errs: FieldErrors = {};
    if (!form.username.trim()) errs.username = 'Required';
    if (!form.email.trim()) errs.email = 'Required';
    if (!form.display_name.trim()) errs.display_name = 'Required';
    if (!form.phone_number.trim()) errs.phone_number = 'Required';
    if (!form.birthday.trim()) errs.birthday = 'Required (YYYY-MM-DD)';
    if (!form.password) errs.password = 'Required';
    if (form.password !== form.password_confirm) errs.password_confirm = 'Passwords do not match';
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSignup = async () => {
    if (!validate()) return;
    setLoading(true);
    setError(null);
    try {
      const { token, user } = await apiSignup(form);
      await signIn(token, user);
    } catch (e: any) {
      const msg = e?.response?.data?.error ?? 'Signup failed. Please try again.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const renderField = (
    label: string,
    key: keyof typeof form,
    opts?: {
      placeholder?: string;
      secure?: boolean;
      keyboard?: 'default' | 'email-address' | 'phone-pad';
      autoCapitalize?: 'none' | 'words';
    },
  ) => (
    <View style={styles.field} key={key}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, fieldErrors[key] ? styles.inputError : null]}
        value={form[key]}
        onChangeText={setField(key)}
        secureTextEntry={opts?.secure}
        keyboardType={opts?.keyboard ?? 'default'}
        autoCapitalize={opts?.autoCapitalize ?? 'none'}
        autoCorrect={false}
        placeholder={opts?.placeholder}
        placeholderTextColor={colors.textMuted}
      />
      {fieldErrors[key] ? <Text style={styles.fieldError}>{fieldErrors[key]}</Text> : null}
    </View>
  );

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

          {renderField('Display Name', 'display_name', { placeholder: 'Jane Doe', autoCapitalize: 'words' })}
          {renderField('Username', 'username', { placeholder: 'jane_doe' })}
          {renderField('Email', 'email', { placeholder: 'jane@example.com', keyboard: 'email-address' })}
          {renderField('Phone Number', 'phone_number', { placeholder: '+1 555 000 0000', keyboard: 'phone-pad' })}
          {renderField('Birthday', 'birthday', { placeholder: 'YYYY-MM-DD' })}
          {renderField('Password', 'password', { placeholder: '••••••••', secure: true })}
          {renderField('Confirm Password', 'password_confirm', { placeholder: '••••••••', secure: true })}

          <Pressable
            style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}
            onPress={handleSignup}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={colors.textOnPrimary} />
            ) : (
              <Text style={styles.btnText}>Create Account</Text>
            )}
          </Pressable>

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
  btnPressed: {
    opacity: 0.85,
  },
  btnText: {
    color: colors.textOnPrimary,
    fontSize: typography.size.base,
    fontWeight: '700',
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
