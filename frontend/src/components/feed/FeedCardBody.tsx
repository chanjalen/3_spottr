import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { FeedItem, MediaItem } from '../../types/feed';
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

      {(() => {
        // Use unified media_items if present (new posts), fall back to legacy fields
        const media: MediaItem[] = item.media_items?.length
          ? item.media_items
          : item.video_url
            ? [{ url: item.video_url, kind: 'video' }]
            : item.photo_urls.map(u => ({ url: u, kind: 'photo' as const }));

        if (media.length === 0) return null;
        if (media.length === 1) {
          const m = media[0];
          return m.kind === 'video'
            ? <FeedCardVideo uri={m.url} onExpand={onMediaPress ? () => onMediaPress(m.url, 'video') : undefined} />
            : <FeedCardImage uri={m.url} frontCameraUri={item.front_camera_url} onPress={onMediaPress ? () => onMediaPress(m.url, 'image') : undefined} onDoubleTap={onDoubleTap} />;
        }
        return (
          <FeedCardCarousel
            media={media}
            onPress={(i) => {
              const m = media[i];
              onMediaPress?.(m.url, m.kind === 'video' ? 'video' : 'image', media.filter(x => x.kind === 'photo').map(x => x.url), i);
            }}
            onDoubleTap={onDoubleTap}
          />
        );
      })()}

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
