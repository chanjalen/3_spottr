import React, { useEffect, useState } from 'react';
import { View, Image, StyleSheet, ViewStyle } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as VideoThumbnails from 'expo-video-thumbnails';

interface Props {
  /** The hosted or local video URI — used for lazy thumbnail generation if thumbnailUrl is absent. */
  videoUrl: string;
  /** Pre-generated thumbnail URL (from backend or pickMedia). If provided, skips generation. */
  thumbnailUrl?: string | null;
  style?: ViewStyle;
  /** Icon size for the play button overlay. Defaults to 28. */
  iconSize?: number;
}

export default function VideoThumbnail({ videoUrl, thumbnailUrl, style, iconSize = 28 }: Props) {
  const [generatedThumb, setGeneratedThumb] = useState<string | null>(null);

  useEffect(() => {
    // Only generate if there's no server-provided thumbnail and we haven't generated one yet.
    if (thumbnailUrl || generatedThumb) return;
    let cancelled = false;
    VideoThumbnails.getThumbnailAsync(videoUrl, { time: 0 })
      .then(({ uri }) => { if (!cancelled) setGeneratedThumb(uri); })
      .catch(() => {}); // black fallback is acceptable
    return () => { cancelled = true; };
  }, [videoUrl, thumbnailUrl]);

  const thumbUri = thumbnailUrl ?? generatedThumb;

  return (
    <View style={[styles.container, style]}>
      {thumbUri ? (
        <Image source={{ uri: thumbUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : null}
      <View style={styles.overlay}>
        <Feather name="play-circle" size={iconSize} color="#fff" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#111',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
});
