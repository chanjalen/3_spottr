import React, { useCallback } from 'react';
import {
  FlatList,
  ActivityIndicator,
  View,
  RefreshControl,
} from 'react-native';
import { FeedItem } from '../../types/feed';
import { FeedTab } from '../common/FeedTabs';
import ImmersivePostCard from './ImmersivePostCard';
import EmptyState from '../common/EmptyState';
import { colors } from '../../theme';

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

export default function ImmersiveFeedList({
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
}: ImmersiveFeedListProps) {
  const renderItem = useCallback(
    ({ item }: { item: FeedItem }) => (
      <ImmersivePostCard
        item={item}
        itemHeight={itemHeight}
        topInset={topInset}
        bottomInset={bottomInset}
        onLike={() => onLike(item)}
        onComment={() => onComment(item)}
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

  const renderFooter = () => {
    if (!isLoadingMore) return null;
    return (
      <View style={{ height: itemHeight, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  };

  // Don't render until the container has been measured
  if (itemHeight === 0) return null;

  return (
    <FlatList
      data={items}
      keyExtractor={(item) => `immersive-${item.type}-${item.id}`}
      renderItem={renderItem}
      getItemLayout={getItemLayout}
      // Snap behavior — snapToInterval alone is more reliable than combining with pagingEnabled
      snapToInterval={itemHeight}
      snapToAlignment="start"
      decelerationRate="fast"
      showsVerticalScrollIndicator={false}
      // Content
      ListEmptyComponent={<EmptyState tab={activeTab} />}
      ListFooterComponent={renderFooter}
      // Infinite scroll
      onEndReached={onEndReached}
      onEndReachedThreshold={0.5}
      // Pull to refresh
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
      // Virtualization
      removeClippedSubviews
      maxToRenderPerBatch={3}
      windowSize={5}
      initialNumToRender={2}
    />
  );
}
