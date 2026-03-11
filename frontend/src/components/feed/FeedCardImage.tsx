import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Image, ImageLoadEventData } from 'expo-image';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import { colors, spacing } from '../../theme';
import { getImageUrl } from '../../utils/imageUrl';

interface FeedCardImageProps {
  uri: string;
  frontCameraUri?: string | null;
  onPress?: () => void;
  onDoubleTap?: () => void;
}

export default function FeedCardImage({ uri, frontCameraUri, onPress, onDoubleTap }: FeedCardImageProps) {
  // Start with a neutral 1:1 ratio until we know the real dimensions.
  const [aspectRatio, setAspectRatio] = useState(1);

  const handleLoad = (e: ImageLoadEventData) => {
    const { width, height } = e.source;
    if (width && height) {
      // Cap portrait at 4:5 (0.8) and landscape at 1.91:1 — compact, LinkedIn/Instagram-style.
      setAspectRatio(Math.max(0.8, Math.min(1.91, width / height)));
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

  const pip = frontCameraUri ? (
    <View style={styles.pipContainer}>
      <Image
        source={{ uri: getImageUrl(frontCameraUri, 'feed') ?? frontCameraUri }}
        style={styles.pipImage}
        contentFit="cover"
      />
    </View>
  ) : null;

  if (!onPress && !onDoubleTap) {
    return (
      <View style={styles.imageWrapper}>
        <Image
          source={{ uri: getImageUrl(uri, 'feed') ?? uri }}
          style={[styles.image, { aspectRatio }]}
          contentFit="contain"
          onLoad={handleLoad}
          transition={300}
        />
        {pip}
      </View>
    );
  }

  return (
    <GestureDetector gesture={gesture}>
      <View style={styles.imageWrapper}>
        <Image
          source={{ uri: getImageUrl(uri, 'feed') ?? uri }}
          style={[styles.image, { aspectRatio }]}
          contentFit="contain"
          onLoad={handleLoad}
          transition={300}
        />
        {pip}
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  imageWrapper: {
    position: 'relative',
  },
  image: {
    width: '100%',
    marginBottom: spacing.md,
    backgroundColor: '#F2F2F2',
  },
  pipContainer: {
    position: 'absolute',
    top: 10,
    left: 10,
    width: 90,
    height: 120,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#fff',
    overflow: 'hidden',
    zIndex: 10,
  },
  pipImage: {
    width: '100%',
    height: '100%',
    transform: [{ scaleX: -1 }],
  },
});
