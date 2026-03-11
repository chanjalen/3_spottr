import React, { useRef, useState, useEffect } from 'react';
import { ScrollView, View, StyleSheet, Pressable, useWindowDimensions, Text } from 'react-native';
import { Image, ImageLoadEventData } from 'expo-image';
import { VideoView, useVideoPlayer } from 'expo-video';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { Feather } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import { colors, spacing } from '../../theme';
import { getImageUrl } from '../../utils/imageUrl';
import { MediaItem } from '../../types/feed';

interface FeedCardCarouselProps {
  media: MediaItem[];
  onPress: (index: number) => void;
  onDoubleTap?: () => void;
}

export default function FeedCardCarousel({ media, onPress, onDoubleTap }: FeedCardCarouselProps) {
  const { width } = useWindowDimensions();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [aspectRatio, setAspectRatio] = useState(1);

  const handleFirstImageLoad = (e: ImageLoadEventData) => {
    const { width: w, height: h } = e.source;
    if (w && h) {
      setAspectRatio(Math.max(0.8, Math.min(1.91, w / h)));
    }
  };

  const handleScroll = (e: any) => {
    const offsetX = e.nativeEvent.contentOffset.x;
    const index = Math.round(offsetX / width);
    setCurrentIndex(Math.max(0, Math.min(index, media.length - 1)));
  };

  const imageHeight = width / aspectRatio;

  return (
    <View style={[styles.wrapper, { marginBottom: spacing.md }]}>
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={handleScroll}
        style={{ width, height: imageHeight }}
        contentContainerStyle={{ width: width * media.length }}
        scrollEnabled
      >
        {media.map((item, i) => (
          item.kind === 'video'
            ? <VideoSlide
                key={item.url + i}
                uri={item.url}
                width={width}
                height={imageHeight}
                isActive={currentIndex === i}
                onPress={() => onPress(i)}
              />
            : <Pressable
                key={item.url + i}
                onPress={() => onPress(i)}
                style={{ width, height: imageHeight }}
              >
                <Image
                  source={{ uri: getImageUrl(item.url, 'feed') ?? item.url }}
                  style={{ width, height: imageHeight, backgroundColor: '#F2F2F2' }}
                  contentFit="cover"
                  onLoad={i === 0 ? handleFirstImageLoad : undefined}
                  transition={i === 0 ? 300 : 0}
                />
              </Pressable>
        ))}
      </ScrollView>

      {/* Dot indicator */}
      {media.length > 1 && (
        <View style={styles.dots}>
          {media.map((item, i) => (
            <View key={i} style={styles.dotWrap}>
              <View style={[styles.dot, i === currentIndex && styles.dotActive]} />
              {item.kind === 'video' && (
                <Feather name="video" size={7} color={i === currentIndex ? colors.primary : colors.textMuted} style={styles.dotIcon} />
              )}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

// ─── Video slide ─────────────────────────────────────────────────────────────

function VideoSlide({ uri, width, height, isActive, onPress }: { uri: string; width: number; height: number; isActive: boolean; onPress: () => void }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [thumbUri, setThumbUri] = useState<string | null>(null);
  const isFocused = useIsFocused();
  const player = useVideoPlayer(uri, p => { p.loop = true; p.muted = false; });

  useEffect(() => {
    let cancelled = false;
    VideoThumbnails.getThumbnailAsync(uri, { time: 0 })
      .then(({ uri: u }) => { if (!cancelled) setThumbUri(u); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [uri]);

  useEffect(() => {
    if (!isActive || !isFocused) {
      player.pause();
      setIsPlaying(false);
    }
  }, [isActive, isFocused]);

  const togglePlay = () => {
    if (isPlaying) { player.pause(); setIsPlaying(false); }
    else { player.play(); setIsPlaying(true); }
  };

  return (
    <View style={{ width, height, backgroundColor: '#000' }}>
      <VideoView
        player={player}
        style={{ width, height }}
        contentFit="contain"
        nativeControls={false}
      />
      {!isPlaying && thumbUri && (
        <Image source={{ uri: thumbUri }} style={StyleSheet.absoluteFill} contentFit="cover" />
      )}
      <Pressable style={StyleSheet.absoluteFill} onPress={togglePlay}>
        {!isPlaying && (
          <View style={styles.playOverlay}>
            <View style={styles.playBtn}>
              <Feather name="play" size={24} color="#fff" style={{ marginLeft: 3 }} />
            </View>
          </View>
        )}
      </Pressable>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  wrapper: {
    position: 'relative',
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 6,
  },
  dotWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.border?.subtle ?? '#D0D0D0',
  },
  dotActive: {
    backgroundColor: colors.primary,
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  dotIcon: {
    position: 'absolute',
  },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
