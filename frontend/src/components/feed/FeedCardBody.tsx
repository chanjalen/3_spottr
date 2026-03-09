import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { FeedItem } from '../../types/feed';
import FeedCardImage from './FeedCardImage';
import FeedCardVideo from './FeedCardVideo';
import FeedCardCarousel from './FeedCardCarousel';
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
  onMediaPress?: (uri: string, kind: 'image' | 'video', allUris?: string[], index?: number) => void;
  onDoubleTap?: () => void;
}

export default function FeedCardBody({ item, onPollVote, onWorkoutPress, onMediaPress, onDoubleTap }: FeedCardBodyProps) {
  const { user } = useAuth();
  const isOwner = !!user && user.username === item.user.username;

  const hasPaddedContent = !!(item.workout || item.personal_record || item.link_url || item.poll);

  return (
    <View>
      {item.description !== '' && (
        <Text style={styles.description}>{item.description}</Text>
      )}

      {item.video_url
        ? <FeedCardVideo uri={item.video_url} onExpand={onMediaPress ? () => onMediaPress(item.video_url!, 'video') : undefined} />
        : item.photo_urls.length > 1
          ? <FeedCardCarousel
              uris={item.photo_urls}
              onPress={(i) => onMediaPress?.(item.photo_urls[i], 'image', item.photo_urls, i)}
              onDoubleTap={onDoubleTap}
            />
          : item.photo_urls.length === 1
            ? <FeedCardImage uri={item.photo_urls[0]} frontCameraUri={item.front_camera_url} onPress={onMediaPress ? () => onMediaPress(item.photo_urls[0], 'image') : undefined} onDoubleTap={onDoubleTap} />
            : null}

      {hasPaddedContent && (
        <View style={styles.paddedContent}>
          {item.workout && (
            <WorkoutSummaryCard workout={item.workout} onPress={onWorkoutPress} />
          )}
          {item.personal_record && (
            <PersonalRecordCard record={item.personal_record} />
          )}
          {item.link_url && <LinkPreview url={item.link_url} />}
          {item.poll && (
            <PollCard poll={item.poll} onVote={onPollVote} isOwner={isOwner} />
          )}
        </View>
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
    paddingHorizontal: spacing.md,
  },
  paddedContent: {
    paddingHorizontal: spacing.md,
  },
});
