import React, { useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { OnboardingStackParamList } from '../../navigation/types';
import { useAuth } from '../../store/AuthContext';
import { colors, spacing, typography } from '../../theme';

type Props = {
  navigation: NativeStackNavigationProp<OnboardingStackParamList, 'OnboardingComplete'>;
  route: RouteProp<OnboardingStackParamList, 'OnboardingComplete'>;
};

export default function OnboardingCompleteScreen({ route }: Props) {
  const { finalUser } = route.params;
  const { updateUser } = useAuth();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    const timer = setTimeout(() => {
      updateUser(finalUser);
    }, 1500);
    return () => clearTimeout(timer);
  }, []);

  const handleGetStarted = () => {
    updateUser(finalUser);
  };

  return (
    <View
      style={[
        styles.container,
        { paddingTop: insets.top + spacing['3xl'], paddingBottom: insets.bottom + spacing.xl },
      ]}
    >
      <Text style={styles.emoji}>🎉</Text>
      <Text style={styles.heading}>You're all set!</Text>
      <Text style={styles.username}>@{finalUser.username}</Text>
      <Text style={styles.subheading}>
        Welcome to Spottr.{'\n'}Track your workouts, compete with friends, and crush your goals.
      </Text>

      <Pressable
        style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}
        onPress={handleGetStarted}
      >
        <Text style={styles.btnText}>Let's Go</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.base,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: {
    fontSize: 64,
    marginBottom: spacing.xl,
  },
  heading: {
    fontSize: 32,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  username: {
    fontSize: typography.size.lg,
    fontWeight: '600',
    color: colors.primary,
    marginBottom: spacing.lg,
  },
  subheading: {
    fontSize: typography.size.base,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: spacing['3xl'],
  },
  btn: {
    width: '100%',
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: spacing.md,
    alignItems: 'center',
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
