import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import Animated, {
  FadeIn,
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withSpring,
  withTiming,
  withDelay,
} from 'react-native-reanimated';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import { Feather } from '@expo/vector-icons';
import { FeedItem } from '../../types/feed';
import FeedCardHeader from './FeedCardHeader';
import FeedCardBody from './FeedCardBody';
import FeedCardActions from './FeedCardActions';
import WorkoutDetailModal from './WorkoutDetailModal';
import ShareSheet from './ShareSheet';
import { colors, spacing } from '../../theme';

interface FeedCardProps {
  item: FeedItem;
  index: number;
  onLike: () => void;
  onComment: () => void;
  onPollVote: (optionId: number | string) => void;
  onPressUser?: () => void;
  onDelete?: () => void;
}

export default function FeedCard({
  item,
  index,
  onLike,
  onComment,
  onPollVote,
  onPressUser,
  onDelete,
}: FeedCardProps) {
  const [workoutDetailId, setWorkoutDetailId] = useState<string | null>(null);
  const [shareItem, setShareItem] = useState<FeedItem | null>(null);

  // Heart overlay animation
  const heartScale = useSharedValue(0);
  const heartOpacity = useSharedValue(0);

  const heartAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: heartScale.value }],
    opacity: heartOpacity.value,
  }));

  // Ref so rapid double-taps never fire multiple API calls, even before re-render
  const hasLikedRef = useRef(item.user_liked);
  useEffect(() => { hasLikedRef.current = item.user_liked; }, [item.user_liked]);

  const triggerHeart = useCallback(() => {
    heartScale.value = 0;
    heartOpacity.value = 1;
    heartScale.value = withSequence(
      withSpring(1.15, { damping: 8, stiffness: 260 }),
      withTiming(1, { duration: 80 }),
      withDelay(480, withTiming(0, { duration: 220 })),
    );
    heartOpacity.value = withDelay(580, withTiming(0, { duration: 220 }));
  }, [heartScale, heartOpacity]);

  const doubleTap = useMemo(
    () =>
      Gesture.Tap()
        .numberOfTaps(2)
        .maxDuration(250)
        .runOnJS(true)
        .onEnd(() => {
          triggerHeart();
          if (!hasLikedRef.current) {
            hasLikedRef.current = true; // synchronous lock — prevents re-entry before re-render
            onLike();
          }
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        }),
    [onLike, triggerHeart],
  );

  const handleMore = onDelete
    ? () => {
        Alert.alert('Post Options', undefined, [
          { text: 'Delete Post', style: 'destructive', onPress: onDelete },
          { text: 'Cancel', style: 'cancel' },
        ]);
      }
    : undefined;

  return (
    <>
      <Animated.View
        entering={FadeIn.delay(index * 40).duration(300)}
        style={styles.card}
      >
        {/* Double-tap zone covers the header + body (not the action bar) */}
        <GestureDetector gesture={doubleTap}>
          <View>
            <FeedCardHeader
              user={item.user}
              createdAt={item.created_at}
              locationName={item.location_name}
              workoutType={item.workout_type}
              sharedContext={item.shared_context}
              onPressUser={onPressUser}
              onMore={handleMore}
            />
            <FeedCardBody
              item={item}
              onPollVote={onPollVote}
              onWorkoutPress={item.workout ? () => setWorkoutDetailId(item.workout!.id) : undefined}
            />
            {/* Heart overlay — centered, sits above content but passes touches through */}
            <Animated.View style={[styles.heartOverlay, heartAnimStyle]} pointerEvents="none">
              <Feather name="heart" size={90} color="#FF3B6B" />
            </Animated.View>
          </View>
        </GestureDetector>

        <FeedCardActions
          likeCount={item.like_count}
          commentCount={item.comment_count}
          userLiked={item.user_liked}
          onLike={onLike}
          onComment={onComment}
          onShare={() => setShareItem(item)}
        />
      </Animated.View>

      <WorkoutDetailModal
        workoutId={workoutDetailId}
        onClose={() => setWorkoutDetailId(null)}
      />
      <ShareSheet item={shareItem} onClose={() => setShareItem(null)} />
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
  heartOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 99,
  },
});
