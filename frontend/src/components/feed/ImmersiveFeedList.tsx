import React, { useCallback, useRef, useMemo, useState, useImperativeHandle, forwardRef } from 'react';
import {
  FlatList,
  ActivityIndicator,
  View,
  RefreshControl,
  StyleSheet,
  ViewToken,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withSpring,
  withTiming,
  withDelay,
} from 'react-native-reanimated';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { FeedItem } from '../../types/feed';
import { FeedTab } from '../common/FeedTabs';
import ImmersivePostCard from './ImmersivePostCard';
import ShareSheet from './ShareSheet';
import EmptyState from '../common/EmptyState';
import { colors } from '../../theme';

export interface ImmersiveFeedListHandle {
  snapToCurrentItem: () => void;
}

interface ImmersiveFeedListProps {
  items: FeedItem[];
  /** Full height of the feed container (measures to full screen in immersive layout) */
  itemHeight: number;
  /** Height of the floating header — passed to each card */
  topInset: number;
  /** Height of the bottom nav bar — passed to each card */
  bottomInset: number;
  activeTab: FeedTab;
  onLike: (item: FeedItem) => void;
  onComment: (item: FeedItem) => void;
  onPollVote: (item: FeedItem, optionId: number | string) => void;
  onRefresh: () => void;
  isRefreshing: boolean;
  onEndReached: () => void;
  isLoadingMore: boolean;
}

const ImmersiveFeedList = forwardRef<ImmersiveFeedListHandle, ImmersiveFeedListProps>(function ImmersiveFeedList({
  items,
  itemHeight,
  topInset,
  bottomInset,
  activeTab,
  onLike,
  onComment,
  onPollVote,
  onRefresh,
  isRefreshing,
  onEndReached,
  isLoadingMore,
}, ref) {
  const [shareItem, setShareItem] = useState<FeedItem | null>(null);

  const flatListRef = useRef<FlatList<FeedItem>>(null);

  useImperativeHandle(ref, () => ({
    snapToCurrentItem: () => {
      const index = currentIndexRef.current;
      if (flatListRef.current && index >= 0) {
        flatListRef.current.scrollToIndex({ index, animated: false });
      }
    },
  }));

  // ─── Double-tap to like ─────────────────────────────────────────────────────
  // Gesture lives here (outside FlatList items) so it's unaffected by scroll
  // gesture state and removeClippedSubviews view detachment.

  const heartScale = useSharedValue(0);
  const heartOpacity = useSharedValue(0);
  const heartX = useSharedValue(0);
  const heartY = useSharedValue(0);

  const heartAnimStyle = useAnimatedStyle(() => ({
    position: 'absolute',
    left: heartX.value - 45,
    top: heartY.value - 45,
    transform: [{ scale: heartScale.value }],
    opacity: heartOpacity.value,
    zIndex: 50,
  }));

  // Stable ref to the latest items so the gesture closure never goes stale
  const itemsRef = useRef(items);
  itemsRef.current = items;

  // Index of the currently snapped card
  const currentIndexRef = useRef(0);

  // Per-item lock: prevents a rapid second double-tap from firing onLike again
  // before the optimistic state update has propagated back as a prop change.
  const pendingLikeIds = useRef<Set<string>>(new Set());

  const triggerHeart = useCallback((x: number, y: number) => {
    heartX.value = x;
    heartY.value = y;
    heartScale.value = 0;
    heartOpacity.value = 1;
    heartScale.value = withSequence(
      withSpring(1.15, { damping: 8, stiffness: 260 }),
      withTiming(1, { duration: 80 }),
      withDelay(480, withTiming(0, { duration: 220 })),
    );
    heartOpacity.value = withDelay(580, withTiming(0, { duration: 220 }));
  }, [heartScale, heartOpacity, heartX, heartY]);

  const doubleTap = useMemo(
    () =>
      Gesture.Tap()
        .numberOfTaps(2)
        .maxDuration(250)
        .runOnJS(true)
        .onEnd((e) => {
          const item = itemsRef.current[currentIndexRef.current];
          if (!item) return;

          // Always show the heart
          triggerHeart(e.x, e.y);
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

          // Only fire the like if not already liked and no in-flight request
          if (!item.user_liked && !pendingLikeIds.current.has(item.id)) {
            pendingLikeIds.current.add(item.id);
            onLike(item);
            // Release the lock after the optimistic update has had time to
            // propagate (item.user_liked will be true by the next render)
            setTimeout(() => pendingLikeIds.current.delete(item.id), 800);
          }
        }),
    [onLike, triggerHeart],
  );

  // ─── FlatList setup ─────────────────────────────────────────────────────────

  const renderItem = useCallback(
    ({ item }: { item: FeedItem }) => (
      <ImmersivePostCard
        item={item}
        itemHeight={itemHeight}
        topInset={topInset}
        bottomInset={bottomInset}
        onLike={() => onLike(item)}
        onComment={() => onComment(item)}
        onShare={() => setShareItem(item)}
        onPollVote={(optionId) => onPollVote(item, optionId)}
      />
    ),
    [itemHeight, topInset, bottomInset, onLike, onComment, onPollVote],
  );

  const getItemLayout = useCallback(
    (_: ArrayLike<FeedItem> | null | undefined, index: number) => ({
      length: itemHeight,
      offset: itemHeight * index,
      index,
    }),
    [itemHeight],
  );

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 50 });

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0) {
        currentIndexRef.current = viewableItems[0].index ?? 0;
      }
    },
  ).current;

  const renderFooter = () => {
    if (!isLoadingMore) return null;
    return (
      <View style={{ height: itemHeight, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  };

  if (itemHeight === 0) return null;

  return (
    <>
      <GestureDetector gesture={doubleTap}>
        <View style={styles.container}>
          <FlatList
            ref={flatListRef}
            data={items}
            keyExtractor={(item) => `immersive-${item.type}-${item.id}`}
            renderItem={renderItem}
            getItemLayout={getItemLayout}
            pagingEnabled
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={<EmptyState tab={activeTab} />}
            ListFooterComponent={renderFooter}
            onEndReached={onEndReached}
            onEndReachedThreshold={0.5}
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={onRefresh}
                tintColor={colors.primary}
                colors={[colors.primary]}
                progressBackgroundColor={colors.background.surface}
                progressViewOffset={topInset}
              />
            }
            keyboardShouldPersistTaps="handled"
            removeClippedSubviews
            maxToRenderPerBatch={3}
            windowSize={5}
            initialNumToRender={2}
            onViewableItemsChanged={onViewableItemsChanged}
            viewabilityConfig={viewabilityConfig.current}
          />

          {/* Heart overlay — sits above the FlatList, pointer events disabled */}
          <Animated.View style={heartAnimStyle} pointerEvents="none">
            <Feather name="heart" size={90} color="#FF3B6B" />
          </Animated.View>
        </View>
      </GestureDetector>
      <ShareSheet item={shareItem} onClose={() => setShareItem(null)} />
    </>
  );
});

export default ImmersiveFeedList;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
