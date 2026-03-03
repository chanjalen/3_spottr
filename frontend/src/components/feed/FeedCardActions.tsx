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
      withTiming(0.8, { duration: 80 }),
      withSpring(1, { stiffness: 400, damping: 10 }),
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
      <AnimatedPressable
        style={[styles.action, likeAnimatedStyle]}
        onPress={handleLike}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityLabel={`Like, ${likeCount} likes`}
        accessibilityRole="button"
      >
        <Feather
          name={userLiked ? 'heart' : 'heart'}
          size={18}
          color={userLiked ? colors.semantic.like : colors.textMuted}
        />
        {likeCount > 0 && (
          <Text
            style={[
              styles.count,
              userLiked && { color: colors.semantic.like },
            ]}
          >
            {likeCount}
          </Text>
        )}
      </AnimatedPressable>

      <Pressable
        style={styles.action}
        onPress={onComment}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityLabel={`Comment, ${commentCount} comments`}
        accessibilityRole="button"
      >
        <Feather name="message-circle" size={18} color={colors.textMuted} />
        {commentCount > 0 && (
          <Text style={styles.count}>{commentCount}</Text>
        )}
      </Pressable>

      <Pressable
        style={styles.action}
        onPress={handleShare}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityLabel="Share"
        accessibilityRole="button"
      >
        <Feather name="share" size={18} color={colors.textMuted} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xl,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border.subtle,
    marginTop: spacing.xs,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: spacing.xs,
    minHeight: 44,
  },
  count: {
    fontSize: typography.size.sm,
    fontFamily: typography.family.medium,
    color: colors.textMuted,
  },
});
