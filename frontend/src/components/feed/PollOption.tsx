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
  // Show results once user has voted OR poll has ended
  const showResults = hasVoted || !isActive;

  useEffect(() => {
    barWidth.value = showResults
      ? withTiming(percentage, { duration: 700, easing: Easing.out(Easing.cubic) })
      : withTiming(0, { duration: 200 });
  }, [showResults, percentage]);

  const barStyle = useAnimatedStyle(() => ({
    width: `${barWidth.value}%`,
  }));

  const isLeading = showResults && totalVotes > 0 && votes === Math.max(...[votes]);

  return (
    <Pressable
      onPress={isActive && !hasVoted ? onVote : undefined}
      disabled={!isActive || hasVoted}
      accessibilityRole="button"
      accessibilityLabel={`${text}${showResults ? `, ${percentage}%` : ''}`}
      accessibilityState={{ selected: isSelected }}
    >
      <View style={[styles.row, isSelected && styles.rowSelected]}>
        {/* Animated fill bar behind content */}
        {showResults && (
          <Animated.View
            style={[
              styles.bar,
              isSelected ? styles.barSelected : styles.barDefault,
              barStyle,
            ]}
          />
        )}

        {/* Option text */}
        <View style={styles.content}>
          <View style={styles.left}>
            {isSelected && (
              <Feather name="check-circle" size={13} color={colors.primary} />
            )}
            <Text
              style={[styles.text, isSelected && styles.textSelected]}
              numberOfLines={2}
            >
              {text}
            </Text>
          </View>

          {showResults && (
            <Text style={[styles.percent, isSelected && styles.percentSelected]}>
              {percentage}%
            </Text>
          )}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    position: 'relative',
    overflow: 'hidden',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderColor,
    minHeight: 44,
    justifyContent: 'center',
  },
  rowSelected: {
    // slightly brighter tint for selected row background is provided by the bar
  },
  bar: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
  },
  barDefault: {
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  barSelected: {
    backgroundColor: 'rgba(79,195,224,0.18)',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm + 2,
    gap: spacing.sm,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flex: 1,
  },
  text: {
    fontSize: typography.size.sm,
    fontFamily: typography.family.medium,
    color: colors.textPrimary,
    flex: 1,
  },
  textSelected: {
    fontFamily: typography.family.semibold,
    color: colors.primary,
  },
  percent: {
    fontSize: typography.size.sm,
    fontFamily: typography.family.medium,
    color: colors.textMuted,
    minWidth: 32,
    textAlign: 'right',
  },
  percentSelected: {
    color: colors.primary,
    fontFamily: typography.family.semibold,
  },
});
