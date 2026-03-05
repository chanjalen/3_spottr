import React, { useMemo, useState } from 'react';
import { StyleSheet } from 'react-native';
import { Image, ImageLoadEventData } from 'expo-image';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import { colors, spacing } from '../../theme';

interface FeedCardImageProps {
  uri: string;
  onPress?: () => void;
  onDoubleTap?: () => void;
}

export default function FeedCardImage({ uri, onPress, onDoubleTap }: FeedCardImageProps) {
  // Start with a neutral 1:1 ratio until we know the real dimensions.
  const [aspectRatio, setAspectRatio] = useState(1);

  const handleLoad = (e: ImageLoadEventData) => {
    const { width, height } = e.source;
    if (width && height) {
      // Allow portrait down to ~9:16 and landscape up to ~1.91:1 (Instagram-style caps).
      setAspectRatio(Math.max(0.5, Math.min(1.91, width / height)));
    }
  };

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
        style={[styles.image, { aspectRatio }]}
        contentFit="contain"
        onLoad={handleLoad}
        transition={300}
      />
    );
  }

  return (
    <GestureDetector gesture={gesture}>
      <Image
        source={{ uri }}
        style={[styles.image, { aspectRatio }]}
        contentFit="contain"
        onLoad={handleLoad}
        transition={300}
      />
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  image: {
    width: '100%',
    marginBottom: spacing.md,
    backgroundColor: '#000',
  },
});
