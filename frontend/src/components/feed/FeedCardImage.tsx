import React, { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import { colors, spacing } from '../../theme';

interface FeedCardImageProps {
  uri: string;
  onPress?: () => void;
  onDoubleTap?: () => void;
}

export default function FeedCardImage({ uri, onPress, onDoubleTap }: FeedCardImageProps) {
  // Exclusive: double-tap fires the like and blocks single-tap from opening the viewer.
  // Single-tap only fires after the double-tap window (~250 ms) expires.
  const gesture = useMemo(() => {
    const doubleTap = Gesture.Tap()
      .numberOfTaps(2)
      .maxDuration(250)
      .runOnJS(true)
      .onEnd(() => onDoubleTap?.());

    const singleTap = Gesture.Tap()
      .numberOfTaps(1)
      .runOnJS(true)
      .onEnd(() => onPress?.());

    return Gesture.Exclusive(doubleTap, singleTap);
  }, [onPress, onDoubleTap]);

  if (!onPress && !onDoubleTap) {
    return (
      <Image
        source={{ uri }}
        style={styles.image}
        contentFit="cover"
        transition={300}
      />
    );
  }

  return (
    <GestureDetector gesture={gesture}>
      <Image
        source={{ uri }}
        style={styles.image}
        contentFit="cover"
        transition={300}
      />
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  image: {
    width: '100%',
    aspectRatio: 4 / 3,
    marginBottom: spacing.md,
    backgroundColor: colors.background.elevated,
  },
});
