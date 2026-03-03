import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  Modal,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Alert,
  SafeAreaView,
} from 'react-native';
import { Poll } from '../../types/feed';
import PollOption from './PollOption';
import Avatar from '../common/Avatar';
import { colors, spacing, typography } from '../../theme';
import { fetchPollVoters, PollVotersResponse } from '../../api/polls';
import { Feather } from '@expo/vector-icons';

// ─── Countdown helpers ────────────────────────────────────────────────────────

function formatTimeRemaining(endsAt: string): string {
  const diff = new Date(endsAt).getTime() - Date.now();
  if (diff <= 0) return 'Final results';
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  if (days > 0) return `${days}d ${hours}h remaining`;
  if (hours > 0) return `${hours}h ${minutes}m remaining`;
  if (minutes > 0) return `${minutes}m remaining`;
  return 'Ending soon';
}

function useCountdown(endsAt: string, isActive: boolean) {
  const [label, setLabel] = useState(() => formatTimeRemaining(endsAt));
  useEffect(() => {
    if (!isActive) return;
    const id = setInterval(() => setLabel(formatTimeRemaining(endsAt)), 30_000);
    return () => clearInterval(id);
  }, [endsAt, isActive]);
  return label;
}

// ─── Component ────────────────────────────────────────────────────────────────

interface PollCardProps {
  poll: Poll;
  onVote: (optionId: number | string) => void;
  isOwner?: boolean;
}

export default function PollCard({ poll, onVote, isOwner = false }: PollCardProps) {
  const sortedOptions = [...poll.options].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const hasVoted = poll.user_vote_id !== null;
  const [showVoters, setShowVoters] = useState(false);
  const [votersData, setVotersData] = useState<PollVotersResponse | null>(null);
  const [loadingVoters, setLoadingVoters] = useState(false);
  const timeLabel = useCountdown(poll.ends_at, poll.is_active);

  const openVoters = async () => {
    setShowVoters(true);
    if (votersData) return;
    setLoadingVoters(true);
    try {
      const data = await fetchPollVoters(poll.id);
      setVotersData(data);
    } catch {
      Alert.alert('Error', 'Could not load voter data.');
      setShowVoters(false);
    } finally {
      setLoadingVoters(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Poll title */}
      <Text style={styles.question}>{poll.question}</Text>

      {/* Options */}
      {sortedOptions.map((option) => (
        <PollOption
          key={option.id}
          text={option.text}
          votes={option.votes}
          totalVotes={poll.total_votes}
          isSelected={String(option.id) === String(poll.user_vote_id)}
          hasVoted={hasVoted}
          isActive={poll.is_active}
          onVote={() => onVote(option.id)}
        />
      ))}

      {/* Footer: votes · timer · see voters */}
      <View style={styles.footer}>
        <Text style={styles.footerVotes}>
          {poll.total_votes} {poll.total_votes === 1 ? 'vote' : 'votes'}
        </Text>
        <Text style={styles.footerDot}>·</Text>
        <View style={styles.timerRow}>
          <Feather
            name={poll.is_active ? 'clock' : 'check-circle'}
            size={11}
            color={poll.is_active ? colors.textMuted : colors.primary}
          />
          <Text style={[styles.footerTimer, !poll.is_active && styles.footerTimerDone]}>
            {timeLabel}
          </Text>
        </View>
        {isOwner && (
          <Pressable
            onPress={openVoters}
            style={styles.votersBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Feather name="users" size={12} color={colors.primary} />
            <Text style={styles.votersBtnText}>See voters</Text>
          </Pressable>
        )}
      </View>

      {/* ── Voters modal (owner only) ──────────────────── */}
      <Modal
        visible={showVoters}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowVoters(false)}
      >
        <SafeAreaView style={styles.modalRoot}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Poll Voters</Text>
            <Pressable
              onPress={() => setShowVoters(false)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Feather name="x" size={22} color={colors.textPrimary} />
            </Pressable>
          </View>

          {/* Poll question recap */}
          <View style={styles.modalQuestion}>
            <Text style={styles.modalQuestionText}>{poll.question}</Text>
            <Text style={styles.modalVoteCount}>
              {poll.total_votes} {poll.total_votes === 1 ? 'vote' : 'votes'} total
            </Text>
          </View>

          {loadingVoters ? (
            <View style={styles.modalLoader}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : votersData ? (
            <FlatList
              data={votersData.options}
              keyExtractor={(opt) => opt.id}
              contentContainerStyle={styles.modalList}
              renderItem={({ item: opt }) => (
                <View style={styles.optionSection}>
                  <View style={styles.optionHeader}>
                    <Text style={styles.optionText}>{opt.text}</Text>
                    <Text style={styles.optionCount}>
                      {opt.voters.length} {opt.voters.length === 1 ? 'vote' : 'votes'}
                    </Text>
                  </View>
                  {opt.voters.length === 0 ? (
                    <Text style={styles.noVoters}>No votes yet</Text>
                  ) : (
                    opt.voters.map((voter) => (
                      <View key={voter.username} style={styles.voterRow}>
                        <Avatar uri={voter.avatar_url} name={voter.display_name} size={36} />
                        <View style={styles.voterInfo}>
                          <Text style={styles.voterName}>{voter.display_name}</Text>
                          <Text style={styles.voterHandle}>@{voter.username}</Text>
                        </View>
                      </View>
                    ))
                  )}
                </View>
              )}
            />
          ) : null}
        </SafeAreaView>
      </Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    marginTop: spacing.xs,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.borderColor,
    overflow: 'hidden',
    marginBottom: spacing.xs,
  },

  question: {
    fontSize: typography.size.sm,
    fontFamily: typography.family.semibold,
    color: colors.textPrimary,
    lineHeight: 20,
    paddingHorizontal: spacing.base,
    paddingTop: spacing.base,
    paddingBottom: spacing.sm,
  },

  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.xs,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderColor,
  },
  footerVotes: {
    fontSize: typography.size.xs,
    fontFamily: typography.family.regular,
    color: colors.textMuted,
  },
  footerDot: {
    fontSize: typography.size.xs,
    color: colors.textMuted,
  },
  timerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    flex: 1,
  },
  footerTimer: {
    fontSize: typography.size.xs,
    fontFamily: typography.family.medium,
    color: colors.textMuted,
  },
  footerTimerDone: {
    color: colors.primary,
    fontFamily: typography.family.semibold,
  },
  votersBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  votersBtnText: {
    fontSize: typography.size.xs,
    fontFamily: typography.family.semibold,
    color: colors.primary,
  },

  // Modal
  modalRoot: {
    flex: 1,
    backgroundColor: colors.background.base,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.base,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderColor,
  },
  modalTitle: {
    fontSize: typography.size.lg,
    fontFamily: typography.family.semibold,
    color: colors.textPrimary,
  },
  modalQuestion: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.base,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderColor,
    backgroundColor: colors.background.elevated,
  },
  modalQuestionText: {
    fontSize: typography.size.base,
    fontFamily: typography.family.semibold,
    color: colors.textPrimary,
    marginBottom: 4,
  },
  modalVoteCount: {
    fontSize: typography.size.xs,
    fontFamily: typography.family.regular,
    color: colors.textMuted,
  },
  modalLoader: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalList: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing['2xl'],
  },
  optionSection: {
    marginTop: spacing.lg,
  },
  optionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderColor,
  },
  optionText: {
    fontSize: typography.size.sm,
    fontFamily: typography.family.semibold,
    color: colors.textPrimary,
    flex: 1,
  },
  optionCount: {
    fontSize: typography.size.xs,
    fontFamily: typography.family.medium,
    color: colors.textMuted,
  },
  noVoters: {
    fontSize: typography.size.sm,
    fontFamily: typography.family.regular,
    color: colors.textMuted,
    fontStyle: 'italic',
    paddingVertical: spacing.sm,
  },
  voterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  voterInfo: {
    flex: 1,
  },
  voterName: {
    fontSize: typography.size.sm,
    fontFamily: typography.family.semibold,
    color: colors.textPrimary,
  },
  voterHandle: {
    fontSize: typography.size.xs,
    fontFamily: typography.family.regular,
    color: colors.textMuted,
  },
});
