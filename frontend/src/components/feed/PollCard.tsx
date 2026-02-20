import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Poll } from '../../types/feed';
import PollOption from './PollOption';
import { colors, spacing, typography } from '../../theme';

interface PollCardProps {
  poll: Poll;
  onVote: (optionId: number) => void;
}

export default function PollCard({ poll, onVote }: PollCardProps) {
  const sortedOptions = [...poll.options].sort((a, b) => a.order - b.order);
  const hasVoted = poll.user_vote_id !== null;

  return (
    <View style={styles.container}>
      <Text style={styles.question}>{poll.question}</Text>
      {sortedOptions.map((option) => (
        <PollOption
          key={option.id}
          text={option.text}
          votes={option.votes}
          totalVotes={poll.total_votes}
          isSelected={option.id === poll.user_vote_id}
          hasVoted={hasVoted}
          isActive={poll.is_active}
          onVote={() => onVote(option.id)}
        />
      ))}
      <View style={styles.footer}>
        <Text style={styles.footerText}>
          {poll.total_votes} vote{poll.total_votes !== 1 ? 's' : ''}
        </Text>
        {!poll.is_active && (
          <Text style={styles.endedText}>Poll ended</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.md,
  },
  question: {
    fontSize: typography.size.base,
    fontFamily: typography.family.semibold,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  footerText: {
    fontSize: typography.size.xs,
    fontFamily: typography.family.regular,
    color: colors.textMuted,
  },
  endedText: {
    fontSize: typography.size.xs,
    fontFamily: typography.family.medium,
    color: colors.warning,
  },
});
