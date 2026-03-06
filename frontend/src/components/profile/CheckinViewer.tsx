import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { VideoView, useVideoPlayer } from 'expo-video';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { CheckinItem } from '../../api/feed';

const { height: SH } = Dimensions.get('window');

interface Props {
  visible: boolean;
  /** Today's check-ins only */
  checkins: CheckinItem[];
  onClose: () => void;
}

export default function CheckinViewer({ visible, checkins, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const [currentIndex, setCurrentIndex] = useState(0);
  // Ref so goNext/goPrev always read the latest index without stale closure
  const indexRef = useRef(0);

  // Reset state when viewer opens
  useEffect(() => {
    if (visible) {
      setCurrentIndex(0);
      indexRef.current = 0;
      translateY.value = 0;
      backdropOpacity.value = 1;
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Swipe-down dismiss ─────────────────────────────────────────────────────
  const translateY = useSharedValue(0);
  const backdropOpacity = useSharedValue(1);

  const closeViewer = useCallback(() => onClose(), [onClose]);

  const dismissGesture = Gesture.Pan()
    .activeOffsetY([0, 12])
    .failOffsetX([-8, 8])
    .onUpdate((e) => {
      translateY.value = Math.max(0, e.translationY);
      backdropOpacity.value = interpolate(
        e.translationY, [0, 300], [1, 0.3], Extrapolation.CLAMP,
      );
    })
    .onEnd((e) => {
      if (e.translationY > 120 || e.velocityY > 600) {
        translateY.value = withTiming(SH, { duration: 280 }, (done) => {
          if (done) runOnJS(closeViewer)();
        });
        backdropOpacity.value = withTiming(0, { duration: 250 });
      } else {
        translateY.value = withSpring(0, { damping: 20, stiffness: 200 });
        backdropOpacity.value = withSpring(1, { damping: 20, stiffness: 200 });
      }
    });

  const wrapStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: backdropOpacity.value,
  }));

  // ── Story navigation ───────────────────────────────────────────────────────
  // Right tap = next; reaching end closes. Left tap = previous; at start closes.
  const goNext = useCallback(() => {
    if (indexRef.current >= checkins.length - 1) { onClose(); return; }
    indexRef.current += 1;
    setCurrentIndex(indexRef.current);
  }, [checkins.length, onClose]);

  const goPrev = useCallback(() => {
    if (indexRef.current <= 0) { onClose(); return; }
    indexRef.current -= 1;
    setCurrentIndex(indexRef.current);
  }, [onClose]);

  // ── Video playback ─────────────────────────────────────────────────────────
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
  const currentVideoUrl = checkins[currentIndex]?.video_url ?? null;

  const videoPlayer = useVideoPlayer(currentVideoUrl, (p) => {
    p.loop = true;
    p.muted = false;
  });

  // Auto-play when the viewer opens or the current item changes
  useEffect(() => {
    if (!visible || !currentVideoUrl) {
      videoPlayer.pause();
      setIsVideoPlaying(false);
      setUserPaused(false);
      return;
    }
    videoPlayer.replaceAsync(currentVideoUrl).then(() => videoPlayer.play()).catch(() => {});
    setIsVideoPlaying(true);
    setUserPaused(false);
  }, [visible, currentIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  const lastVideoTapRef = useRef(0);
  const videoTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleVideoTap = () => {
    const now = Date.now();
    if (now - lastVideoTapRef.current < 300) {
      if (videoTapTimerRef.current) { clearTimeout(videoTapTimerRef.current); videoTapTimerRef.current = null; }
      lastVideoTapRef.current = 0;
      return;
    }
    lastVideoTapRef.current = now;
    const playing = isVideoPlaying;
    videoTapTimerRef.current = setTimeout(() => {
      videoTapTimerRef.current = null;
      if (playing) {
        videoPlayer.pause();
        setIsVideoPlaying(false);
        setUserPaused(true);
      } else {
        videoPlayer.play();
        setIsVideoPlaying(true);
        setUserPaused(false);
      }
    }, 300);
  };

  if (!visible || checkins.length === 0) return null;
  const item = checkins[currentIndex];
  if (!item) return null;

  const hasVideo = !!item.video_url;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <GestureDetector gesture={dismissGesture}>
          <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#000' }, wrapStyle]}>

            {/* Full-screen media (video or photo or placeholder) */}
            {hasVideo ? (
              <View style={[StyleSheet.absoluteFill, { transform: [{ scaleX: -1 }] }]}>
                <VideoView
                  player={videoPlayer}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                  nativeControls={false}
                />
              </View>
            ) : item.photo_url ? (
              <Image source={{ uri: item.photo_url }} style={[StyleSheet.absoluteFill, item.is_front_camera && { transform: [{ scaleX: -1 }] }]} contentFit="cover" />
            ) : (
              <View style={[StyleSheet.absoluteFill, styles.noPhoto]}>
                <Feather name="activity" size={60} color="rgba(255,255,255,0.15)" />
              </View>
            )}

            {/* Pause indicator for video */}
            {hasVideo && userPaused && (
              <View style={styles.pauseIndicator} pointerEvents="none">
                <Feather name="pause" size={40} color="rgba(255,255,255,0.85)" />
              </View>
            )}

            {/* Top + bottom gradients (non-interactive) */}
            <View style={styles.topGrad} pointerEvents="none">
              <LinearGradient colors={['rgba(0,0,0,0.7)', 'transparent']} style={StyleSheet.absoluteFill} />
            </View>
            <View style={styles.bottomGrad} pointerEvents="none">
              <LinearGradient colors={['transparent', 'rgba(0,0,0,0.88)']} style={StyleSheet.absoluteFill} />
            </View>

            {/* ── Tap zones: left=prev, center=pause/play (video), right=next ── */}
            <View style={[StyleSheet.absoluteFill, { flexDirection: 'row' }]}>
              <Pressable style={{ flex: 1 }} onPress={goPrev} />
              {hasVideo ? (
                <Pressable style={{ flex: 1 }} onPress={handleVideoTap} />
              ) : (
                <Pressable style={{ flex: 1 }} onPress={goNext} />
              )}
              <Pressable style={{ flex: 1 }} onPress={goNext} />
            </View>

            {/* ── Top chrome: progress bars + date + close button ── */}
            <View style={[styles.topArea, { paddingTop: insets.top + 10 }]}>
              {/* Progress bars */}
              <View style={styles.progressRow}>
                {checkins.map((_, i) => (
                  <View
                    key={i}
                    style={[
                      styles.progressSeg,
                      i <= currentIndex && styles.progressSegFilled,
                    ]}
                  />
                ))}
              </View>

              {/* Date label + X */}
              <View style={styles.topRow}>
                <Text style={styles.dateLabel}>{formatDate(item.created_at)}</Text>
                <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={12}>
                  <Feather name="x" size={22} color="#fff" />
                </Pressable>
              </View>
            </View>

            {/* ── Bottom chrome: workout info ── */}
            <View style={[styles.infoWrap, { paddingBottom: insets.bottom + 20 }]}>
              {item.workout_type ? (
                <Text style={styles.workoutType}>{item.workout_type}</Text>
              ) : null}
              {item.location_name ? (
                <View style={styles.locRow}>
                  <Feather name="map-pin" size={13} color="rgba(255,255,255,0.7)" />
                  <Text style={styles.locText}>{item.location_name}</Text>
                </View>
              ) : null}
              {item.description ? (
                <Text style={styles.desc} numberOfLines={4}>{item.description}</Text>
              ) : null}
            </View>

          </Animated.View>
        </GestureDetector>
      </GestureHandlerRootView>
    </Modal>
  );
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  if (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  ) {
    return 'Today';
  }
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
}

const styles = StyleSheet.create({
  noPhoto: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pauseIndicator: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
  },
  topGrad: {
    position: 'absolute', top: 0, left: 0, right: 0, height: 240,
  },
  bottomGrad: {
    position: 'absolute', bottom: 0, left: 0, right: 0, height: 300,
  },
  topArea: {
    position: 'absolute', top: 0, left: 0, right: 0,
    paddingHorizontal: 14, gap: 8,
  },
  progressRow: {
    flexDirection: 'row', gap: 4,
  },
  progressSeg: {
    flex: 1, height: 3, borderRadius: 1.5,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  progressSegFilled: {
    backgroundColor: '#fff',
  },
  topRow: {
    flexDirection: 'row', alignItems: 'center',
  },
  dateLabel: {
    flex: 1, fontSize: 15, fontWeight: '600', color: '#fff', letterSpacing: 0.2,
  },
  closeBtn: {
    padding: 4,
  },
  infoWrap: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: 22, paddingTop: 60, gap: 7,
  },
  workoutType: {
    fontSize: 24, fontWeight: '700', color: '#fff',
  },
  locRow: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
  },
  locText: {
    fontSize: 14, color: 'rgba(255,255,255,0.8)',
  },
  desc: {
    fontSize: 14, color: 'rgba(255,255,255,0.75)', lineHeight: 21,
  },
});
