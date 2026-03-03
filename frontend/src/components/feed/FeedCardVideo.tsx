import React, { useState } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import { Feather } from '@expo/vector-icons';
import { colors, spacing } from '../../theme';

interface FeedCardVideoProps {
  uri: string;
}

export default function FeedCardVideo({ uri }: FeedCardVideoProps) {
  const [isPlaying, setIsPlaying] = useState(false);

  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = false;
  });

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
        contentFit="cover"
        nativeControls={false}
        allowsFullscreen={false}
      />
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
});
