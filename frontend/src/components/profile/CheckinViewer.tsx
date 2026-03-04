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
import { colors, spacing } from '../../theme';

const { width: SW, height: SH } = Dimensions.get('window');

const CARD_W = SW * 0.88;
const CARD_H = SH * 0.56;
const SWIPE_THRESHOLD = SW * 0.22;
const ROTATION_RANGE = 8;

function formatDateLabel(dateStr: string): string {
  const date = new Date(dateStr);
  const today = new Date();
  if (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  ) {
    return 'Today';
  }
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function dateKey(dateStr: string): string {
  return new Date(dateStr).toISOString().slice(0, 10);
}

interface Props {
  visible: boolean;
  checkins: CheckinItem[];
  onClose: () => void;
  onLoadMore: () => void;
  hasMore: boolean;
}

export default function CheckinViewer({ visible, checkins, onClose, onLoadMore, hasMore }: Props) {
  const insets = useSafeAreaInsets();
  const [currentIndex, setCurrentIndex] = useState(0);

  // Shared values for UI-thread-safe bounds checking in gesture worklets
  const currentIndexSV = useSharedValue(0);
  const maxIndexSV = useSharedValue(checkins.length - 1);
  const checkinsLenRef = useRef(checkins.length);

  useEffect(() => { currentIndexSV.value = currentIndex; }, [currentIndex]);
  useEffect(() => {
    maxIndexSV.value = checkins.length - 1;
    checkinsLenRef.current = checkins.length;
  }, [checkins.length]);

  // Card animation
  const translateX = useSharedValue(0);
  const cardOpacity = useSharedValue(1);

  // Backdrop animation (swipe-down-to-dismiss)
  const backdropTranslateY = useSharedValue(0);
  const backdropOpacity = useSharedValue(1);

  const prevIndexRef = useRef<number | null>(null);

  // ── Reset when viewer opens ───────────────────────────────────────────────────
  useEffect(() => {
    if (visible) {
      prevIndexRef.current = null;
      translateX.value = 0;
      cardOpacity.value = 1;
      backdropTranslateY.value = 0;
      backdropOpacity.value = 1;
      setCurrentIndex(0);
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── After index change: snap position back & fade in ─────────────────────────
  useEffect(() => {
    if (!visible) return;
    if (prevIndexRef.current === null) {
      prevIndexRef.current = currentIndex;
      return;
    }
    if (prevIndexRef.current === currentIndex) return;
    prevIndexRef.current = currentIndex;

    translateX.value = 0;
    cardOpacity.value = withTiming(1, { duration: 150 });
  }, [currentIndex, visible]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load more when near end ───────────────────────────────────────────────────
  useEffect(() => {
    if (checkins.length > 0 && currentIndex >= checkins.length - 3 && hasMore) {
      onLoadMore();
    }
  }, [currentIndex, checkins.length, hasMore, onLoadMore]);

  // ── JS callbacks (dispatched from UI thread via runOnJS) ─────────────────────
  const goNext = useCallback(() => {
    setCurrentIndex(i => Math.min(i + 1, checkinsLenRef.current - 1));
  }, []);

  const goPrev = useCallback(() => {
    setCurrentIndex(i => Math.max(i - 1, 0));
  }, []);

  const closeViewer = useCallback(() => { onClose(); }, [onClose]);

  // ── Nav-hint tap handlers (called from JS thread) ─────────────────────────────
  const triggerLeft = useCallback(() => {
    cardOpacity.value = withTiming(0, { duration: 160 });
    translateX.value = withTiming(-SW * 1.4, { duration: 220 }, (done) => {
      if (done) runOnJS(goNext)();
    });
  }, [goNext, cardOpacity, translateX]);

  const triggerRight = useCallback(() => {
    cardOpacity.value = withTiming(0, { duration: 160 });
    translateX.value = withTiming(SW * 1.4, { duration: 220 }, (done) => {
      if (done) runOnJS(goPrev)();
    });
  }, [goPrev, cardOpacity, translateX]);

  // ── Card swipe gesture (horizontal — UI thread) ───────────────────────────────
  const cardGesture = Gesture.Pan()
    .activeOffsetX([-6, 6])
    .failOffsetY([-12, 12])
    .onUpdate((e) => {
      translateX.value = e.translationX;
    })
    .onEnd((e) => {
      const shouldLeft = e.translationX < -SWIPE_THRESHOLD || e.velocityX < -800;
      const shouldRight = e.translationX > SWIPE_THRESHOLD || e.velocityX > 800;

      if (shouldLeft && currentIndexSV.value < maxIndexSV.value) {
        cardOpacity.value = withTiming(0, { duration: 160 });
        translateX.value = withTiming(-SW * 1.4, { duration: 220 }, (done) => {
          if (done) runOnJS(goNext)();
        });
      } else if (shouldRight && currentIndexSV.value > 0) {
        cardOpacity.value = withTiming(0, { duration: 160 });
        translateX.value = withTiming(SW * 1.4, { duration: 220 }, (done) => {
          if (done) runOnJS(goPrev)();
        });
      } else {
        translateX.value = withSpring(0, { damping: 18, stiffness: 220, mass: 0.8 });
      }
    });

  // ── Dismiss gesture (swipe down — UI thread) ──────────────────────────────────
  const dismissGesture = Gesture.Pan()
    .activeOffsetY([0, 12])
    .failOffsetX([-8, 8])
    .onUpdate((e) => {
      backdropTranslateY.value = Math.max(0, e.translationY);
      backdropOpacity.value = interpolate(
        e.translationY, [0, 300], [1, 0.3], Extrapolation.CLAMP,
      );
    })
    .onEnd((e) => {
      if (e.translationY > 120 || e.velocityY > 600) {
        backdropTranslateY.value = withTiming(SH, { duration: 280 }, (done) => {
          if (done) runOnJS(closeViewer)();
        });
        backdropOpacity.value = withTiming(0, { duration: 250 });
      } else {
        backdropTranslateY.value = withSpring(0, { damping: 20, stiffness: 200 });
        backdropOpacity.value = withSpring(1, { damping: 20, stiffness: 200 });
      }
    });

  // ── Animated styles ───────────────────────────────────────────────────────────
  const cardAnimStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      {
        rotate: `${interpolate(
          translateX.value,
          [-SW / 2, 0, SW / 2],
          [-ROTATION_RANGE, 0, ROTATION_RANGE],
          Extrapolation.CLAMP,
        )}deg`,
      },
    ],
    opacity: cardOpacity.value,
  }));

  const behindAnimStyle = useAnimatedStyle(() => ({
    transform: [
      {
        scale: interpolate(
          Math.abs(translateX.value),
          [0, SW * 0.5],
          [0.94, 1],
          Extrapolation.CLAMP,
        ),
      },
      {
        translateY: interpolate(
          Math.abs(translateX.value),
          [0, SW * 0.5],
          [12, 0],
          Extrapolation.CLAMP,
        ),
      },
    ],
    opacity: interpolate(
      Math.abs(translateX.value),
      [0, SW * 0.5],
      [0.7, 1],
      Extrapolation.CLAMP,
    ),
  }));

  const backdropAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: backdropTranslateY.value }],
    opacity: backdropOpacity.value,
  }));

  if (!visible || checkins.length === 0) return null;

  const item = checkins[currentIndex];
  if (!item) return null;

  const itemDayKey = dateKey(item.created_at);
  const sameDayItems = checkins.filter((c) => dateKey(c.created_at) === itemDayKey);
  const posInDay = sameDayItems.findIndex((c) => c.id === item.id) + 1;
  const sameDayCount = sameDayItems.length;
  const dateLabel = formatDateLabel(item.created_at);
  const behindIndex = currentIndex + 1 < checkins.length ? currentIndex + 1 : null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      {/* GestureHandlerRootView needed for RNGH to work inside Modal on Android */}
      <GestureHandlerRootView style={{ flex: 1 }}>
        <GestureDetector gesture={dismissGesture}>
          <Animated.View
            style={[
              styles.backdrop,
              backdropAnimStyle,
              { paddingTop: insets.top, paddingBottom: insets.bottom },
            ]}
          >
            {/* Header */}
            <View style={styles.headerRow}>
              <Text style={styles.headerTitle}>Check-ins</Text>
              <Pressable style={styles.closeBtn} onPress={onClose}>
                <Feather name="x" size={24} color="#fff" />
              </Pressable>
            </View>

            {/* Date label */}
            <Text style={styles.dateLabel}>{dateLabel}</Text>

            {/* Same-day indicator */}
            {sameDayCount > 1 && (
              <Text style={styles.sameDayIndicator}>{posInDay} of {sameDayCount} today</Text>
            )}

            {/* Card stack */}
            <View style={styles.stackArea} pointerEvents="box-none">

              {/* Behind card */}
              {behindIndex !== null && (
                <Animated.View style={[styles.card, behindAnimStyle]} pointerEvents="none">
                  <CheckinCard item={checkins[behindIndex]} />
                </Animated.View>
              )}

              {/* Top card — swipeable */}
              <GestureDetector gesture={cardGesture}>
                <Animated.View style={[styles.card, cardAnimStyle]}>
                  <CheckinCard item={item} />
                </Animated.View>
              </GestureDetector>
            </View>

            {/* Dots */}
            <View style={styles.dotsRow}>
              {checkins.slice(0, Math.min(checkins.length, 8)).map((_, i) => (
                <View key={i} style={[styles.dot, i === currentIndex && styles.dotActive]} />
              ))}
              {checkins.length > 8 && (
                <Text style={styles.moreDotsText}>+{checkins.length - 8}</Text>
              )}
            </View>

            {/* Nav hints */}
            <View style={styles.navHintRow}>
              {currentIndex > 0 && (
                <Pressable style={styles.navHint} onPress={triggerRight}>
                  <Feather name="chevron-left" size={18} color="rgba(255,255,255,0.5)" />
                  <Text style={styles.navHintText}>Newer</Text>
                </Pressable>
              )}
              <View style={{ flex: 1 }} />
              {currentIndex < checkins.length - 1 && (
                <Pressable style={styles.navHint} onPress={triggerLeft}>
                  <Text style={styles.navHintText}>Older</Text>
                  <Feather name="chevron-right" size={18} color="rgba(255,255,255,0.5)" />
                </Pressable>
              )}
            </View>

          </Animated.View>
        </GestureDetector>
      </GestureHandlerRootView>
    </Modal>
  );
}

// ── Individual card ────────────────────────────────────────────────────────────

function CheckinCard({ item }: { item: CheckinItem }) {
  return (
    <View style={styles.cardInner}>
      {item.photo_url ? (
        <Image source={{ uri: item.photo_url }} style={styles.cardPhoto} contentFit="cover" />
      ) : (
        <View style={styles.cardPhotoPlaceholder}>
          <Feather name="activity" size={40} color="rgba(255,255,255,0.3)" />
        </View>
      )}
      <View style={styles.cardBody}>
        {item.workout_type ? (
          <View style={styles.workoutTypePill}>
            <Text style={styles.workoutTypeText}>{item.workout_type}</Text>
          </View>
        ) : null}
        {item.location_name ? (
          <View style={styles.locationRow}>
            <Feather name="map-pin" size={13} color={colors.primary} />
            <Text style={styles.locationText} numberOfLines={1}>{item.location_name}</Text>
          </View>
        ) : null}
        {item.description ? (
          <Text style={styles.descriptionText} numberOfLines={4}>{item.description}</Text>
        ) : null}
      </View>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.88)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.lg,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.3,
  },
  closeBtn: {
    padding: spacing.sm,
  },
  dateLabel: {
    fontSize: 17,
    fontWeight: '600',
    color: '#fff',
    marginBottom: spacing.sm,
    letterSpacing: 0.3,
  },
  sameDayIndicator: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.55)',
    marginBottom: spacing.md,
  },
  stackArea: {
    width: CARD_W,
    height: CARD_H,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    position: 'absolute',
    width: CARD_W,
    height: CARD_H,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#1a1a1a',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 12,
  },
  cardInner: { flex: 1 },
  cardPhoto: { width: '100%', height: '55%' },
  cardPhotoPlaceholder: {
    width: '100%',
    height: '55%',
    backgroundColor: '#2a2a2a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: {
    flex: 1,
    padding: spacing.base,
    gap: spacing.sm,
  },
  workoutTypePill: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primary + '22',
    borderRadius: 12,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: colors.primary + '55',
  },
  workoutTypeText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primary,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  locationText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
    flex: 1,
  },
  descriptionText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.85)',
    lineHeight: 20,
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.lg,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  dotActive: {
    backgroundColor: '#fff',
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  moreDotsText: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
    marginLeft: 2,
  },
  navHintRow: {
    flexDirection: 'row',
    width: CARD_W,
    marginTop: spacing.md,
  },
  navHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    padding: spacing.sm,
  },
  navHintText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
  },
});
