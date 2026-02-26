import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CheckinItem } from '../../api/feed';
import { colors, spacing } from '../../theme';

const { width: SW, height: SH } = Dimensions.get('window');

const CARD_W = SW * 0.88;
const CARD_H = SH * 0.56;
const SWIPE_THRESHOLD = SW * 0.22;
const ROTATION_RANGE = 12;

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

  const currentIndexRef = useRef(0);
  const checkinsLenRef = useRef(checkins.length);

  useEffect(() => { currentIndexRef.current = currentIndex; }, [currentIndex]);
  useEffect(() => { checkinsLenRef.current = checkins.length; }, [checkins.length]);

  const position = useRef(new Animated.ValueXY()).current;
  const cardOpacity = useRef(new Animated.Value(1)).current;

  // null = "just opened / not yet swiped", number = last index we handled
  const prevIndexRef = useRef<number | null>(null);

  // ── Reset card when viewer opens ─────────────────────────────────────────────
  useEffect(() => {
    if (visible) {
      prevIndexRef.current = null;
      position.setValue({ x: 0, y: 0 });
      cardOpacity.setValue(1);
      setCurrentIndex(0);
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── After a swipe-driven index change, reset position & fade in ──────────────
  // This runs AFTER React has committed the new card content. By that point the
  // card is invisible (opacity=0) and off-screen (position=±1400), so resetting
  // position and starting the fade-in never shows the old content.
  useEffect(() => {
    if (!visible) return;

    if (prevIndexRef.current === null) {
      // First render after open — card is already fully visible, just record index.
      prevIndexRef.current = currentIndex;
      return;
    }

    if (prevIndexRef.current === currentIndex) return;
    prevIndexRef.current = currentIndex;

    // Card is off-screen + invisible here. Safe to snap to center.
    position.setValue({ x: 0, y: 0 });
    Animated.timing(cardOpacity, {
      toValue: 1,
      duration: 150,
      useNativeDriver: true,
    }).start();
  }, [currentIndex, visible]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load more when near the end ──────────────────────────────────────────────
  useEffect(() => {
    if (checkins.length > 0 && currentIndex >= checkins.length - 3 && hasMore) {
      onLoadMore();
    }
  }, [currentIndex, checkins.length, hasMore, onLoadMore]);

  // ── Fly-off animation — does NOT reset position/opacity ──────────────────────
  // Position and opacity are left in their end state (off-screen, transparent).
  // The useEffect above handles the reset after React commits the new content.
  const flyOff = useCallback((direction: 'left' | 'right') => {
    const toX = direction === 'left' ? -SW * 1.4 : SW * 1.4;
    Animated.parallel([
      Animated.timing(position, {
        toValue: { x: toX, y: 0 },
        duration: 240,
        useNativeDriver: true,
      }),
      Animated.timing(cardOpacity, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start(() => {
      const nextIndex = currentIndexRef.current + (direction === 'left' ? 1 : -1);
      const clamped = Math.max(0, Math.min(nextIndex, checkinsLenRef.current - 1));
      setCurrentIndex(clamped);
      // ← No position/opacity reset here. useEffect handles it after render.
    });
  }, [cardOpacity, position]);

  // ── Pan responder ────────────────────────────────────────────────────────────
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 6,
      onPanResponderMove: (_, g) => {
        position.setValue({ x: g.dx, y: 0 });
      },
      onPanResponderRelease: (_, g) => {
        if (g.dx < -SWIPE_THRESHOLD) {
          if (currentIndexRef.current < checkinsLenRef.current - 1) {
            flyOff('left');
          } else {
            Animated.spring(position, { toValue: { x: 0, y: 0 }, useNativeDriver: true }).start();
          }
        } else if (g.dx > SWIPE_THRESHOLD) {
          if (currentIndexRef.current > 0) {
            flyOff('right');
          } else {
            Animated.spring(position, { toValue: { x: 0, y: 0 }, useNativeDriver: true }).start();
          }
        } else {
          Animated.spring(position, { toValue: { x: 0, y: 0 }, useNativeDriver: true }).start();
        }
      },
    }),
  ).current;

  const rotation = position.x.interpolate({
    inputRange: [-SW / 2, 0, SW / 2],
    outputRange: [`-${ROTATION_RANGE}deg`, '0deg', `${ROTATION_RANGE}deg`],
    extrapolate: 'clamp',
  });

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
      <View style={[styles.backdrop, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>

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

          {/* Card behind */}
          {behindIndex !== null && (
            <View style={[styles.card, styles.cardBehind]} pointerEvents="none">
              <CheckinCard item={checkins[behindIndex]} />
            </View>
          )}

          {/* Top card — swipeable */}
          <Animated.View
            style={[
              styles.card,
              {
                transform: [{ translateX: position.x }, { rotate: rotation }],
                opacity: cardOpacity,
              },
            ]}
            {...panResponder.panHandlers}
          >
            <CheckinCard item={item} />
          </Animated.View>
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
            <Pressable style={styles.navHint} onPress={() => flyOff('right')}>
              <Feather name="chevron-left" size={18} color="rgba(255,255,255,0.5)" />
              <Text style={styles.navHintText}>Newer</Text>
            </Pressable>
          )}
          <View style={{ flex: 1 }} />
          {currentIndex < checkins.length - 1 && (
            <Pressable style={styles.navHint} onPress={() => flyOff('left')}>
              <Text style={styles.navHintText}>Older</Text>
              <Feather name="chevron-right" size={18} color="rgba(255,255,255,0.5)" />
            </Pressable>
          )}
        </View>

      </View>
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
  cardBehind: {
    transform: [{ scale: 0.94 }, { translateY: 12 }],
    opacity: 0.7,
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
