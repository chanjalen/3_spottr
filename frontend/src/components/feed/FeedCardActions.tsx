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
      withTiming(0.8, { duration: 80 }),
      withSpring(1, { stiffness: 400, damping: 10 }),
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
      <AnimatedPressable
        style={[styles.action, likeAnimatedStyle]}
        onPress={handleLike}
      >
        <Feather
          name="heart"
          size={18}
          color={userLiked ? colors.semantic.like : colors.text.muted}
          fill={userLiked ? colors.semantic.like : 'none'}
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

      <Pressable style={styles.action} onPress={onComment}>
        <Feather name="message-circle" size={18} color={colors.text.muted} />
        {commentCount > 0 && (
          <Text style={styles.count}>{commentCount}</Text>
        )}
      </Pressable>

      <Pressable style={styles.action} onPress={handleShare}>
        <Feather name="share" size={18} color={colors.text.muted} />
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
  },
  count: {
    fontSize: typography.size.sm,
    fontFamily: typography.family.medium,
    color: colors.text.muted,
  },
});
