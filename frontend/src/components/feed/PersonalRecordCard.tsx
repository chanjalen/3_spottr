import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { PersonalRecord } from '../../types/feed';
import { colors, spacing, typography } from '../../theme';

interface PersonalRecordCardProps {
  record: PersonalRecord;
}

export default function PersonalRecordCard({ record }: PersonalRecordCardProps) {
  return (
    <LinearGradient
      colors={['rgba(34,197,94,0.15)', 'rgba(34,197,94,0.05)']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.container}
    >
      <View style={styles.header}>
        <View style={styles.badge}>
          <Feather name="award" size={14} color={colors.semantic.prGreen} />
          <Text style={styles.badgeText}>New PR!</Text>
        </View>
      </View>
      <Text style={styles.exercise}>{record.exercise_name}</Text>
      <Text style={styles.value}>
        {record.value} <Text style={styles.unit}>{record.unit}</Text>
      </Text>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.2)',
    padding: spacing.base,
    marginBottom: spacing.md,
  },
  header: {
    flexDirection: 'row',
    marginBottom: spacing.sm,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(34,197,94,0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  badgeText: {
    fontSize: typography.size.xs,
    fontFamily: typography.family.semibold,
    color: colors.semantic.prGreen,
  },
  exercise: {
    fontSize: typography.size.base,
    fontFamily: typography.family.semibold,
    color: colors.text.primary,
    marginBottom: 4,
  },
  value: {
    fontSize: typography.size.xl,
    fontFamily: typography.family.bold,
    color: colors.semantic.prGreen,
  },
  unit: {
    fontSize: typography.size.base,
    fontFamily: typography.family.medium,
    color: colors.semantic.prGreen,
    opacity: 0.7,
  },
});
