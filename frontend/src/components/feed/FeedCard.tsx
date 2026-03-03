import React, { useState } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { FeedItem } from '../../types/feed';
import FeedCardHeader from './FeedCardHeader';
import FeedCardBody from './FeedCardBody';
import FeedCardActions from './FeedCardActions';
import WorkoutDetailModal from './WorkoutDetailModal';
import Avatar from '../common/Avatar';
import { colors, spacing } from '../../theme';

interface FeedCardProps {
  item: FeedItem;
  index: number;
  onLike: () => void;
  onComment: () => void;
  onPollVote: (optionId: number | string) => void;
  onPressUser?: () => void;
}

export default function FeedCard({
  item,
  index,
  onLike,
  onComment,
  onPollVote,
  onPressUser,
}: FeedCardProps) {
  const shareUrl = `https://spottr.app/${item.type}/${item.id}`;
  const [workoutDetailId, setWorkoutDetailId] = useState<string | null>(null);

  return (
    <>
      <Animated.View
        entering={FadeIn.delay(index * 40).duration(300)}
        style={styles.card}
      >
        <FeedCardHeader
          user={item.user}
          createdAt={item.created_at}
          locationName={item.location_name}
          workoutType={item.workout_type}
          sharedContext={item.shared_context}
          onPressUser={onPressUser}
        />
        <FeedCardBody
          item={item}
          onPollVote={onPollVote}
          onWorkoutPress={item.workout ? () => setWorkoutDetailId(item.workout!.id) : undefined}
        />
        <FeedCardActions
          likeCount={item.like_count}
          commentCount={item.comment_count}
          userLiked={item.user_liked}
          onLike={onLike}
          onComment={onComment}
          shareUrl={shareUrl}
          shareTitle={item.description ? `${item.user.display_name}: ${item.description.slice(0, 60)}` : `${item.user.display_name}'s post`}
        />
      </Animated.View>

      <WorkoutDetailModal
        workoutId={workoutDetailId}
        onClose={() => setWorkoutDetailId(null)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderColor,
    paddingTop: spacing.base,
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.base,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  avatarCol: {
    // Fixed width for the avatar column
    width: 44,
    alignItems: 'center',
  },
  contentCol: {
    flex: 1,
    minWidth: 0,
  },
});
