import React, { useState } from 'react';
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

  const openVoters = async () => {
    setShowVoters(true);
    if (votersData) return; // already loaded
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
      <Text style={styles.question}>{poll.question}</Text>
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
      <View style={styles.footer}>
        <Text style={styles.footerText}>
          {poll.total_votes} vote{poll.total_votes !== 1 ? 's' : ''}
        </Text>
        {!poll.is_active && (
          <Text style={styles.endedText}>Poll ended</Text>
        )}
        {isOwner && (
          <Pressable onPress={openVoters} style={styles.votersBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Feather name="users" size={13} color={colors.primary} />
            <Text style={styles.votersBtnText}>See voters</Text>
          </Pressable>
        )}
      </View>

      {/* Voters modal — only post owner sees this */}
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
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Feather name="x" size={22} color={colors.textPrimary} />
            </Pressable>
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
                    <Text style={styles.optionCount}>{opt.voters.length}</Text>
                  </View>
                  {opt.voters.length === 0 ? (
                    <Text style={styles.noVoters}>No votes yet</Text>
                  ) : (
                    opt.voters.map((voter) => (
                      <View key={voter.username} style={styles.voterRow}>
                        <Avatar uri={voter.avatar_url} name={voter.display_name} size={36} />
                        <View style={styles.voterInfo}>
                          <Text style={styles.voterName}>{voter.display_name}</Text>
                          <Text style={styles.voterUsername}>@{voter.username}</Text>
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
    flexWrap: 'wrap',
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
  votersBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginLeft: 'auto',
  },
  votersBtnText: {
    fontSize: typography.size.xs,
    fontFamily: typography.family.medium,
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
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderColor,
  },
  modalTitle: {
    fontSize: typography.size.lg,
    fontFamily: typography.family.semibold,
    color: colors.textPrimary,
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
  },
  optionText: {
    fontSize: typography.size.sm,
    fontFamily: typography.family.semibold,
    color: colors.textPrimary,
    flex: 1,
  },
  optionCount: {
    fontSize: typography.size.sm,
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
  voterUsername: {
    fontSize: typography.size.xs,
    fontFamily: typography.family.regular,
    color: colors.textMuted,
  },
});
