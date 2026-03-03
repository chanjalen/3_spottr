import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { FeedItem } from '../../types/feed';
import FeedCardImage from './FeedCardImage';
import FeedCardVideo from './FeedCardVideo';
import WorkoutSummaryCard from './WorkoutSummaryCard';
import PersonalRecordCard from './PersonalRecordCard';
import LinkPreview from './LinkPreview';
import PollCard from './PollCard';
import { colors, spacing, typography } from '../../theme';
import { useAuth } from '../../store/AuthContext';

interface FeedCardBodyProps {
  item: FeedItem;
  onPollVote: (optionId: number | string) => void;
  onWorkoutPress?: () => void;
}

export default function FeedCardBody({ item, onPollVote, onWorkoutPress }: FeedCardBodyProps) {
  const { user } = useAuth();
  const isOwner = !!user && user.username === item.user.username;

  return (
    <View>
      {item.description !== '' && (
        <Text style={styles.description}>{item.description}</Text>
      )}

      {item.video_url
        ? <FeedCardVideo uri={item.video_url} />
        : item.photo_url
          ? <FeedCardImage uri={item.photo_url} />
          : null}

      {item.workout && (
        <WorkoutSummaryCard workout={item.workout} onPress={onWorkoutPress} />
      )}

      {item.personal_record && (
        <PersonalRecordCard record={item.personal_record} />
      )}

      {item.link_url && <LinkPreview url={item.link_url} />}

      {item.poll && (
        <PollCard
          poll={item.poll}
          onVote={onPollVote}
          isOwner={isOwner}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  description: {
    fontSize: typography.size.base,
    fontFamily: typography.family.regular,
    color: colors.textPrimary,
    lineHeight: 22,
    marginBottom: spacing.sm,
  },
});
