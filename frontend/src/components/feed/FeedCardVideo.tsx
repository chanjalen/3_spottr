import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import { Image } from 'expo-image';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { Feather } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import { colors, spacing } from '../../theme';

interface FeedCardVideoProps {
  uri: string;
  onExpand?: () => void;
}

export default function FeedCardVideo({ uri, onExpand }: FeedCardVideoProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [thumbUri, setThumbUri] = useState<string | null>(null);
  const isFocused = useIsFocused();

  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = false;
  });

  useEffect(() => {
    let cancelled = false;
    VideoThumbnails.getThumbnailAsync(uri, { time: 0 })
      .then(({ uri: u }) => { if (!cancelled) setThumbUri(u); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [uri]);

  useEffect(() => {
    if (!isFocused && isPlaying) {
      player.pause();
      setIsPlaying(false);
    }
  }, [isFocused]);

  const togglePlay = () => {
    if (isPlaying) {
      player.pause();
      setIsPlaying(false);
    } else {
      player.play();
      setIsPlaying(true);
    }
  };

  return (
    <View style={styles.container}>
      <VideoView
        player={player}
        style={styles.video}
        contentFit="contain"
        nativeControls={false}
      />
      {!isPlaying && thumbUri && (
        <Image source={{ uri: thumbUri }} style={StyleSheet.absoluteFill} contentFit="cover" />
      )}
      <Pressable
        style={styles.overlay}
        onPress={togglePlay}
        accessibilityLabel={isPlaying ? 'Pause video' : 'Play video'}
      >
        {!isPlaying && (
          <View style={styles.playBtn}>
            <Feather name="play" size={26} color="#fff" style={{ marginLeft: 3 }} />
          </View>
        )}
      </Pressable>
      {onExpand && (
        <Pressable
          style={styles.expandBtn}
          onPress={() => {
            if (isPlaying) {
              player.pause();
              setIsPlaying(false);
            }
            onExpand();
          }}
          hitSlop={8}
        >
          <Feather name="maximize-2" size={16} color="#fff" />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: spacing.md,
    backgroundColor: '#000',
  },
  video: {
    width: '100%',
    height: '100%',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  expandBtn: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    width: 30,
    height: 30,
    borderRadius: 6,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
