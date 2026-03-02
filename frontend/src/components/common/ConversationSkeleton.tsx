import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet } from 'react-native';
import { colors, spacing } from '../../theme';

interface RowProps {
  opacity: Animated.Value;
}

function SkeletonRow({ opacity }: RowProps) {
  return (
    <View style={styles.row}>
      <Animated.View style={[styles.avatar, { opacity }]} />
      <View style={styles.info}>
        <Animated.View style={[styles.nameLine, { opacity }]} />
        <Animated.View style={[styles.previewLine, { opacity }]} />
      </View>
      <Animated.View style={[styles.timeLine, { opacity }]} />
    </View>
  );
}

export default function ConversationSkeleton({ count = 8 }: { count?: number }) {
  const opacity = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.85, duration: 850, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.35, duration: 850, useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [opacity]);

  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonRow key={i} opacity={opacity} />
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.background.elevated,
  },
  info: {
    flex: 1,
    gap: 8,
  },
  nameLine: {
    height: 14,
    width: '52%',
    borderRadius: 6,
    backgroundColor: colors.background.elevated,
  },
  previewLine: {
    height: 12,
    width: '78%',
    borderRadius: 6,
    backgroundColor: colors.background.elevated,
  },
  timeLine: {
    height: 10,
    width: 34,
    borderRadius: 6,
    backgroundColor: colors.background.elevated,
  },
});
