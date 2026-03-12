import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { OnboardingStackParamList } from '../../navigation/types';
import { fetchGyms, enrollGym, unenrollGym } from '../../api/gyms';
import { GymListItem } from '../../types/gym';
import { colors, spacing, typography } from '../../theme';

type Props = {
  navigation: NativeStackNavigationProp<OnboardingStackParamList, 'OnboardingStep5'>;
  route: RouteProp<OnboardingStackParamList, 'OnboardingStep5'>;
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

export default function OnboardingStep5Screen({ navigation, route }: Props) {
  const { finalUser } = route.params;
  const insets = useSafeAreaInsets();

  const [gyms, setGyms] = useState<GymListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetchGyms()
      .then(setGyms)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleToggleEnroll = async (gym: GymListItem) => {
    setEnrolling(prev => ({ ...prev, [gym.id]: true }));
    try {
      if (gym.is_enrolled) {
        await unenrollGym(gym.id);
        setGyms(prev =>
          prev.map(g => (g.id === gym.id ? { ...g, is_enrolled: false } : g))
        );
      } else {
        await enrollGym(gym.id);
        setGyms(prev =>
          prev.map(g => (g.id === gym.id ? { ...g, is_enrolled: true } : g))
        );
      }
    } catch {
      // silently ignore — user can enroll from the gyms tab later
    } finally {
      setEnrolling(prev => ({ ...prev, [gym.id]: false }));
    }
  };

  const handleContinue = () => {
    navigation.navigate('OnboardingComplete', { finalUser });
  };

  const renderGym = ({ item }: { item: GymListItem }) => {
    const busy = enrolling[item.id];
    return (
      <View style={styles.card}>
        <View style={styles.cardInfo}>
          <Text style={styles.gymName}>{item.name}</Text>
          {item.address ? (
            <Text style={styles.gymAddress}>{item.address}</Text>
          ) : null}
        </View>
        <Pressable
          style={({ pressed }) => [
            styles.enrollBtn,
            item.is_enrolled && styles.enrollBtnActive,
            pressed && styles.enrollBtnPressed,
          ]}
          onPress={() => handleToggleEnroll(item)}
          disabled={busy}
        >
          {busy ? (
            <ActivityIndicator size="small" color={colors.textOnPrimary} />
          ) : (
            <Text style={styles.enrollBtnText}>
              {item.is_enrolled ? 'Enrolled' : 'Enroll'}
            </Text>
          )}
        </Pressable>
      </View>
    );
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing['2xl'], paddingBottom: insets.bottom }]}>
      <View style={styles.header}>
        <Text style={styles.logo}>Spottr</Text>
        <ProgressDots current={5} total={5} />
        <Text style={styles.heading}>Would you like to join a gym?</Text>
        <Text style={styles.subheading}>
          Enroll in any gyms you're a member of, or skip this step — you can always join later.
        </Text>
      </View>

      {loading ? (
        <ActivityIndicator style={{ flex: 1 }} size="large" color={colors.primary} />
      ) : (
        <FlatList
          data={gyms}
          keyExtractor={item => item.id}
          renderItem={renderGym}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <Pressable
          style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}
          onPress={handleContinue}
        >
          <Text style={styles.btnText}>Continue</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background.base,
  },
  header: {
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    marginBottom: spacing.lg,
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
  },
  listContent: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  cardInfo: {
    flex: 1,
  },
  gymName: {
    fontSize: typography.size.base,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  gymAddress: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },
  enrollBtn: {
    backgroundColor: colors.primary,
    borderRadius: 20,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    minWidth: 88,
    alignItems: 'center',
    justifyContent: 'center',
  },
  enrollBtnActive: {
    backgroundColor: colors.primary,
    opacity: 1,
  },
  enrollBtnPressed: {
    opacity: 0.75,
  },
  enrollBtnText: {
    color: colors.textOnPrimary,
    fontSize: typography.size.sm,
    fontWeight: '600',
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.borderColor,
  },
  footer: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderColor,
    backgroundColor: colors.background.base,
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
