import React from 'react';
import { StyleSheet, Platform } from 'react-native';
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
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: spacing.base,
    marginBottom: spacing.base,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
      },
      android: { elevation: 4 },
    }),
  },
});
