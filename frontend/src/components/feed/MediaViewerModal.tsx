import React from 'react';
import { Modal, View, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { VideoView, useVideoPlayer } from 'expo-video';

interface MediaViewerModalProps {
  uri: string | null;
  kind: 'image' | 'video';
  onClose: () => void;
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
        allowsFullscreen={false}
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

export default function MediaViewerModal({ uri, kind, onClose }: MediaViewerModalProps) {
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={!!uri}
      transparent={false}
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {uri && kind === 'image' && (
        <Pressable style={styles.container} onPress={onClose}>
          <Image
            source={{ uri }}
            style={StyleSheet.absoluteFill}
            contentFit="contain"
            transition={200}
          />
          <Pressable
            style={[styles.closeBtn, { top: insets.top + 8 }]}
            onPress={onClose}
            hitSlop={12}
          >
            <Feather name="x" size={22} color="#fff" />
          </Pressable>
        </Pressable>
      )}
      {uri && kind === 'video' && (
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
