import React from 'react';
import { View, Text, Pressable, Share, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
  withSpring,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, typography } from '../../theme';

interface FeedCardActionsProps {
  likeCount: number;
  commentCount: number;
  userLiked: boolean;
  onLike: () => void;
  onComment: () => void;
  shareUrl: string;
  shareTitle?: string;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export default function FeedCardActions({
  likeCount,
  commentCount,
  userLiked,
  onLike,
  onComment,
  shareUrl,
  shareTitle,
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
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await Share.share({
        message: shareTitle ? `${shareTitle} — ${shareUrl}` : shareUrl,
        url: shareUrl, // iOS only — opens share sheet with URL
        title: shareTitle ?? 'Check this out on Spottr',
      });
    } catch {
      // User cancelled — ignore
    }
  };

  return (
    <View style={styles.container}>
      {/* Like */}
      <AnimatedPressable
        style={[styles.action, likeAnimatedStyle]}
        onPress={handleLike}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Feather
          name="heart"
          size={18}
          color={userLiked ? colors.semantic.like : colors.textMuted}
        />
        {likeCount > 0 && (
          <Text style={[styles.count, userLiked && { color: colors.semantic.like }]}>
            {likeCount}
          </Text>
        )}
      </AnimatedPressable>

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
