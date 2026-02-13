import React, { useEffect } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, typography } from '../../theme';

interface PollOptionProps {
  text: string;
  votes: number;
  totalVotes: number;
  isSelected: boolean;
  hasVoted: boolean;
  isActive: boolean;
  onVote: () => void;
}

export default function PollOption({
  text,
  votes,
  totalVotes,
  isSelected,
  hasVoted,
  isActive,
  onVote,
}: PollOptionProps) {
  const percentage = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0;
  const barWidth = useSharedValue(0);

  useEffect(() => {
    if (hasVoted) {
      barWidth.value = withTiming(percentage, {
        duration: 600,
        easing: Easing.out(Easing.cubic),
      });
    }
  }, [hasVoted, percentage]);

  const barStyle = useAnimatedStyle(() => ({
    width: `${barWidth.value}%`,
  }));

  return (
    <Pressable
      style={[
        styles.container,
        isSelected && styles.selected,
        !isActive && !hasVoted && styles.disabled,
      ]}
      onPress={isActive ? onVote : undefined}
      disabled={!isActive}
    >
      {hasVoted && (
        <Animated.View
          style={[
            styles.bar,
            isSelected && styles.barSelected,
            barStyle,
          ]}
        />
      )}
      <View style={styles.content}>
        <View style={styles.textRow}>
          {isSelected && (
            <Feather name="check-circle" size={14} color={colors.brand.primary} />
          )}
          <Text style={[styles.text, isSelected && styles.textSelected]}>
            {text}
          </Text>
        </View>
        {hasVoted && (
          <Text style={[styles.percent, isSelected && styles.percentSelected]}>
            {percentage}%
          </Text>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border.default,
    marginBottom: spacing.sm,
    overflow: 'hidden',
    position: 'relative',
  },
  selected: {
    borderColor: colors.brand.primary + '40',
  },
  disabled: {
    opacity: 0.6,
  },
  bar: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    backgroundColor: colors.brand.primary + '12',
    borderRadius: 9,
  },
  barSelected: {
    backgroundColor: colors.brand.primary + '20',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  textRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  text: {
    fontSize: typography.size.sm,
    fontFamily: typography.family.medium,
    color: colors.text.primary,
  },
  textSelected: {
    color: colors.brand.primary,
    fontFamily: typography.family.semibold,
  },
  percent: {
    fontSize: typography.size.sm,
    fontFamily: typography.family.medium,
    color: colors.text.secondary,
  },
  percentSelected: {
    color: colors.brand.primary,
    fontFamily: typography.family.semibold,
  },
});
