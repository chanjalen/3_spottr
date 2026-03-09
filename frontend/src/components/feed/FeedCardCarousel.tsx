import React, { useRef, useState } from 'react';
import { ScrollView, View, StyleSheet, Pressable, useWindowDimensions } from 'react-native';
import { Image, ImageLoadEventData } from 'expo-image';
import { colors, spacing } from '../../theme';
import { getImageUrl } from '../../utils/imageUrl';

interface FeedCardCarouselProps {
  uris: string[];
  onPress: (index: number) => void;
  onDoubleTap?: () => void;
}

export default function FeedCardCarousel({ uris, onPress }: FeedCardCarouselProps) {
  const { width } = useWindowDimensions();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [aspectRatio, setAspectRatio] = useState(1);

  const handleFirstLoad = (e: ImageLoadEventData) => {
    const { width: w, height: h } = e.source;
    if (w && h) {
      setAspectRatio(Math.max(0.5, Math.min(1.91, w / h)));
    }
  };

  const handleScroll = (e: any) => {
    const offsetX = e.nativeEvent.contentOffset.x;
    const index = Math.round(offsetX / width);
    setCurrentIndex(Math.max(0, Math.min(index, uris.length - 1)));
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
        contentContainerStyle={{ width: width * uris.length }}
        // Allow scroll to work alongside parent gesture handlers
        scrollEnabled
      >
        {uris.map((uri, i) => (
          <Pressable
            key={uri + i}
            onPress={() => onPress(i)}
            style={{ width, height: imageHeight }}
          >
            <Image
              source={{ uri: getImageUrl(uri, 'feed') ?? uri }}
              style={{ width, height: imageHeight, backgroundColor: '#000' }}
              contentFit="cover"
              onLoad={i === 0 ? handleFirstLoad : undefined}
              transition={i === 0 ? 300 : 0}
            />
          </Pressable>
        ))}
      </ScrollView>

      {/* Dot indicator */}
      {uris.length > 1 && (
        <View style={styles.dots}>
          {uris.map((_, i) => (
            <View
              key={i}
              style={[styles.dot, i === currentIndex && styles.dotActive]}
            />
          ))}
        </View>
      )}
    </View>
  );
}

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
});
