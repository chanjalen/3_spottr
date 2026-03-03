import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
  withSpring,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, typography } from '../../theme';

interface FeedCardActionsProps {
  likeCount: number;
  commentCount: number;
  userLiked: boolean;
  onLike: () => void;
  onComment: () => void;
  shareUrl: string;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export default function FeedCardActions({
  likeCount,
  commentCount,
  userLiked,
  onLike,
  onComment,
  shareUrl,
}: FeedCardActionsProps) {
  const likeScale = useSharedValue(1);

  const likeAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: likeScale.value }],
  }));

  const handleLike = () => {
    likeScale.value = withSequence(
      withTiming(0.75, { duration: 70 }),
      withSpring(1, { stiffness: 500, damping: 10 }),
    );
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onLike();
  };

  const handleShare = async () => {
    await Clipboard.setStringAsync(shareUrl);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  return (
    <View style={styles.container}>
      {/* Comment */}
      <Pressable
        style={styles.action}
        onPress={onComment}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Feather name="message-circle" size={17} color={colors.textMuted} />
        {commentCount > 0 && (
          <Text style={styles.count}>{commentCount}</Text>
        )}
      </Pressable>

      {/* Like */}
      <AnimatedPressable
        style={[styles.action, likeAnimatedStyle]}
        onPress={handleLike}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Feather
          name={userLiked ? 'heart' : 'heart'}
          size={17}
          color={userLiked ? colors.semantic.like : colors.textMuted}
        />
        {likeCount > 0 && (
          <Text style={[styles.count, userLiked && { color: colors.semantic.like }]}>
            {likeCount}
          </Text>
        )}
      </AnimatedPressable>

      {/* Share */}
      <Pressable
        style={styles.action}
        onPress={handleShare}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Feather name="share" size={17} color={colors.textMuted} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xl,
    paddingTop: spacing.sm,
    marginTop: spacing.xs,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  count: {
    fontSize: typography.size.xs,
    fontFamily: typography.family.medium,
    color: colors.textMuted,
  },
});
