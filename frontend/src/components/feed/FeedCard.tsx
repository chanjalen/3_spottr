import React from 'react';
import { StyleSheet } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { FeedItem } from '../../types/feed';
import FeedCardHeader from './FeedCardHeader';
import FeedCardBody from './FeedCardBody';
import FeedCardActions from './FeedCardActions';
import { colors, spacing } from '../../theme';

interface FeedCardProps {
  item: FeedItem;
  index: number;
  onLike: () => void;
  onComment: () => void;
  onPollVote: (optionId: number) => void;
}

export default function FeedCard({
  item,
  index,
  onLike,
  onComment,
  onPollVote,
}: FeedCardProps) {
  const shareUrl = `https://spottr.app/${item.type}/${item.id}`;

  return (
    <Animated.View
      entering={FadeInDown.delay(index * 80).duration(400)}
      style={styles.card}
    >
      <FeedCardHeader
        user={item.user}
        createdAt={item.created_at}
        locationName={item.location_name}
        workoutType={item.workout_type}
      />
      <FeedCardBody item={item} onPollVote={onPollVote} />
      <FeedCardActions
        likeCount={item.like_count}
        commentCount={item.comment_count}
        userLiked={item.user_liked}
        onLike={onLike}
        onComment={onComment}
        shareUrl={shareUrl}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.background.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    padding: spacing.base + 4,
    marginBottom: spacing.base,
  },
});
