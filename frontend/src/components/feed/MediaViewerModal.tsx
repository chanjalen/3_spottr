import React, { useRef } from 'react';
import { Modal, View, Pressable, StyleSheet, ScrollView, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { VideoView, useVideoPlayer } from 'expo-video';
import { colors } from '../../theme';
import { getImageUrl } from '../../utils/imageUrl';

interface MediaViewerModalProps {
  uri: string | null;
  kind: 'image' | 'video';
  onClose: () => void;
  /** When viewing a carousel, pass all URIs and start index */
  uris?: string[];
  initialIndex?: number;
}

function FullScreenVideo({ uri, onClose }: { uri: string; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.play();
  });

  return (
    <View style={styles.container}>
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit="contain"
        nativeControls
      />
      <Pressable
        style={[styles.closeBtn, { top: insets.top + 8 }]}
        onPress={onClose}
        hitSlop={12}
      >
        <Feather name="x" size={22} color="#fff" />
      </Pressable>
    </View>
  );
}

function FullScreenImages({
  uris,
  initialIndex,
  onClose,
}: {
  uris: string[];
  initialIndex: number;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);

  // Scroll to initialIndex on mount
  const handleLayout = () => {
    if (initialIndex > 0) {
      scrollRef.current?.scrollTo({ x: width * initialIndex, animated: false });
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onLayout={handleLayout}
        style={{ width, height }}
        contentContainerStyle={{ width: width * uris.length, height }}
      >
        {uris.map((uri, i) => (
          <Pressable key={uri + i} style={{ width, height }} onPress={onClose}>
            <Image
              source={{ uri: getImageUrl(uri, 'detail') ?? uri }}
              style={{ width, height }}
              contentFit="contain"
              transition={i === 0 ? 200 : 0}
            />
          </Pressable>
        ))}
      </ScrollView>
      <Pressable
        style={[styles.closeBtn, { top: insets.top + 8 }]}
        onPress={onClose}
        hitSlop={12}
      >
        <Feather name="x" size={22} color="#fff" />
      </Pressable>
    </View>
  );
}

export default function MediaViewerModal({ uri, kind, onClose, uris, initialIndex = 0 }: MediaViewerModalProps) {
  const insets = useSafeAreaInsets();
  const isVisible = !!uri;

  // Determine whether to use multi-image or single-image viewer
  const imageUris = uris && uris.length > 0 ? uris : uri ? [uri] : [];

  return (
    <Modal
      visible={isVisible}
      transparent={false}
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {isVisible && kind === 'image' && imageUris.length > 0 && (
        <FullScreenImages uris={imageUris} initialIndex={initialIndex} onClose={onClose} />
      )}
      {isVisible && kind === 'video' && uri && (
        <FullScreenVideo uri={uri} onClose={onClose} />
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  closeBtn: {
    position: 'absolute',
    right: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
