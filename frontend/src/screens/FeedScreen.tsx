import React, { useCallback, useState } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { FeedItem } from '../types/feed';
import FeedCard from '../components/feed/FeedCard';
import FeedTabs from '../components/common/FeedTabs';
import EmptyState from '../components/common/EmptyState';
import CommentsSheet from '../components/comments/CommentsSheet';
import { useFeed } from '../hooks/useFeed';
import { useToggleLike } from '../hooks/useToggleLike';
import { usePollVote } from '../hooks/usePollVote';
import { colors, spacing } from '../theme';

export default function FeedScreen() {
  const insets = useSafeAreaInsets();
  const { items, activeTab, isLoading, isRefreshing, refresh, changeTab, updateItem } =
    useFeed();
  const handleLike = useToggleLike(updateItem);
  const handlePollVote = usePollVote(updateItem);
  const [commentItem, setCommentItem] = useState<FeedItem | null>(null);

  const renderItem = useCallback(
    ({ item, index }: { item: FeedItem; index: number }) => (
      <FeedCard
        item={item}
        index={index}
        onLike={() => handleLike(item)}
        onComment={() => setCommentItem(item)}
        onPollVote={(optionId) => handlePollVote(item, optionId)}
      />
    ),
    [handleLike, handlePollVote],
  );

  return (
    <GestureHandlerRootView style={styles.root}>
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <FeedTabs activeTab={activeTab} onTabChange={changeTab} />

        {isLoading && items.length === 0 ? (
          <View style={styles.loader}>
            <ActivityIndicator size="large" color={colors.brand.primary} />
          </View>
        ) : (
          <FlatList
            data={items}
            keyExtractor={(item) => `${item.type}-${item.id}`}
            renderItem={renderItem}
            contentContainerStyle={[
              styles.list,
              items.length === 0 && styles.emptyList,
            ]}
            ListEmptyComponent={<EmptyState tab={activeTab} />}
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={refresh}
                tintColor={colors.brand.primary}
                colors={[colors.brand.primary]}
                progressBackgroundColor={colors.background.elevated}
              />
            }
            showsVerticalScrollIndicator={false}
          />
        )}

        <CommentsSheet
          item={commentItem}
          onClose={() => setCommentItem(null)}
        />
      </View>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: colors.background.base,
  },
  loader: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.base,
    paddingBottom: spacing['3xl'],
  },
  emptyList: {
    flex: 1,
  },
});
