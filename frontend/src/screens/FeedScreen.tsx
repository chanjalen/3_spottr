import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  TextInput,
  Pressable,
  Text,
  ScrollView,
  Platform,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { FeedItem } from '../types/feed';
import { UserSearchResult } from '../types/user';
import FeedCard from '../components/feed/FeedCard';
import FeedTabs from '../components/common/FeedTabs';
import EmptyState from '../components/common/EmptyState';
import AppHeader from '../components/navigation/AppHeader';
import CommentsSheet from '../components/comments/CommentsSheet';
import Avatar from '../components/common/Avatar';
import { useFeed } from '../hooks/useFeed';
import { useToggleLike } from '../hooks/useToggleLike';
import { usePollVote } from '../hooks/usePollVote';
import { colors, spacing, typography } from '../theme';
import { RootStackParamList } from '../navigation/types';

type RootNav = NativeStackNavigationProp<RootStackParamList>;

export default function FeedScreen() {
  const navigation = useNavigation<RootNav>();
  const {
    items,
    activeTab,
    isLoading,
    isRefreshing,
    isLoadingMore,
    hasMore,
    searchQuery,
    searchResults,
    isSearching,
    refresh,
    changeTab,
    updateItem,
    loadMore,
    handleSearchChange,
    clearSearch,
  } = useFeed();

  const handleLike = useToggleLike(updateItem);
  const handlePollVote = usePollVote(updateItem);
  const [commentItem, setCommentItem] = useState<FeedItem | null>(null);
  const searchInputRef = useRef<TextInput>(null);

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

  const handleEndReached = useCallback(() => {
    if (hasMore && !isLoadingMore) {
      loadMore();
    }
  }, [hasMore, isLoadingMore, loadMore]);

  const renderFooter = () => {
    if (!isLoadingMore) return null;
    return (
      <View style={styles.footerLoader}>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    );
  };

  const showDropdown = searchQuery.length > 0;
  const hasSearchResults =
    searchResults &&
    (searchResults.users.length > 0 || searchResults.posts.length > 0);

  return (
    <View style={styles.root}>
      {/* Gradient header */}
      <LinearGradient
        colors={['#4FC3E0', '#6DCFE8', '#A8E2F4', '#D6F2FB', '#FFFFFF']}
        locations={[0, 0.2, 0.5, 0.75, 1]}
      >
        <AppHeader />

        {/* Search bar */}
        <View style={styles.searchRow}>
          <View style={styles.searchInputWrap}>
            <Feather name="search" size={16} color="rgba(255,255,255,0.8)" />
            <TextInput
              ref={searchInputRef}
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={handleSearchChange}
              placeholder="Search users or #hashtags..."
              placeholderTextColor="rgba(255,255,255,0.6)"
              returnKeyType="search"
              autoCorrect={false}
              autoCapitalize="none"
            />
            {searchQuery.length > 0 && (
              <Pressable
                onPress={() => {
                  clearSearch();
                  searchInputRef.current?.blur();
                }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Feather name="x" size={16} color="rgba(255,255,255,0.9)" />
              </Pressable>
            )}
          </View>
        </View>

        <FeedTabs activeTab={activeTab} onTabChange={changeTab} />
      </LinearGradient>

      {/* Feed content — position: relative so dropdown can be absolute inside it */}
      <View style={styles.feedContainer}>
        {isLoading && items.length === 0 ? (
          <View style={styles.loader}>
            <ActivityIndicator size="large" color={colors.primary} />
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
            ListFooterComponent={renderFooter}
            onEndReached={handleEndReached}
            onEndReachedThreshold={0.3}
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={refresh}
                tintColor={colors.primary}
                colors={[colors.primary]}
                progressBackgroundColor={colors.background.surface}
              />
            }
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          />
        )}

        {/* Search dropdown — absolute inside feedContainer, covers feed below header */}
        {showDropdown && (
        <View style={styles.dropdownOverlay}>
          {isSearching && !hasSearchResults ? (
            <View style={styles.dropdownLoader}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.dropdownLoadingText}>Searching...</Text>
            </View>
          ) : !hasSearchResults && searchResults !== null ? (
            <View style={styles.dropdownEmpty}>
              <Text style={styles.dropdownEmptyText}>No results for "{searchQuery}"</Text>
            </View>
          ) : searchResults === null ? (
            <View style={styles.dropdownEmpty}>
              <Text style={styles.dropdownEmptyText}>Type to search...</Text>
            </View>
          ) : (
            <ScrollView
              style={styles.dropdownScroll}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {/* Users section */}
              {searchResults.users.length > 0 && (
                <View>
                  <Text style={styles.dropdownSectionLabel}>People</Text>
                  {searchResults.users.map((user) => (
                    <UserResultRow
                      key={user.id}
                      user={user}
                      onPress={() => {
                        clearSearch();
                        navigation.navigate('Profile', { username: user.username });
                      }}
                    />
                  ))}
                </View>
              )}

              {/* Posts section */}
              {searchResults.posts.length > 0 && (
                <View>
                  <Text style={styles.dropdownSectionLabel}>Posts</Text>
                  {searchResults.posts.map((item, index) => (
                    <FeedCard
                      key={`${item.type}-${item.id}`}
                      item={item}
                      index={index}
                      onLike={() => handleLike(item)}
                      onComment={() => {
                        clearSearch();
                        setCommentItem(item);
                      }}
                      onPollVote={(optionId) => handlePollVote(item, optionId)}
                    />
                  ))}
                </View>
              )}
            </ScrollView>
          )}
        </View>
        )}
      </View>

      <CommentsSheet
        item={commentItem}
        onClose={() => setCommentItem(null)}
      />
    </View>
  );
}

// ─── User result row ──────────────────────────────────────────────────────────

function UserResultRow({
  user,
  onPress,
}: {
  user: UserSearchResult;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.userRow, pressed && styles.userRowPressed]}
      onPress={onPress}
    >
      <Avatar uri={user.avatar_url} name={user.display_name} size={40} />
      <View style={styles.userRowInfo}>
        <Text style={styles.userRowName}>{user.display_name}</Text>
        <Text style={styles.userRowUsername}>@{user.username}</Text>
      </View>
      {user.is_following && (
        <View style={styles.followingBadge}>
          <Text style={styles.followingBadgeText}>Following</Text>
        </View>
      )}
    </Pressable>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background.base,
  },
  feedContainer: {
    flex: 1,
    backgroundColor: colors.background.base,
  },
  loader: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: 120,
  },
  emptyList: {
    flex: 1,
  },
  footerLoader: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
  },

  // Search bar
  searchRow: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.sm,
  },
  searchInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderRadius: 24,
    paddingHorizontal: spacing.md,
    paddingVertical: Platform.OS === 'ios' ? 9 : 6,
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: typography.size.sm,
    fontFamily: typography.family.regular,
    color: colors.textOnPrimary,
    paddingVertical: 0,
  },

  // Dropdown overlay — absolute inside feedContainer, fills it completely
  dropdownOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.background.base,
    zIndex: 10,
  },
  dropdownScroll: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
  },
  dropdownLoader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing['2xl'],
  },
  dropdownLoadingText: {
    fontSize: typography.size.sm,
    fontFamily: typography.family.regular,
    color: colors.textMuted,
  },
  dropdownEmpty: {
    alignItems: 'center',
    paddingVertical: spacing['2xl'],
  },
  dropdownEmptyText: {
    fontSize: typography.size.sm,
    fontFamily: typography.family.regular,
    color: colors.textMuted,
  },
  dropdownSectionLabel: {
    fontSize: typography.size.xs,
    fontFamily: typography.family.semibold,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: spacing.sm,
    marginTop: spacing.base,
  },

  // User result
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  userRowPressed: {
    opacity: 0.7,
  },
  userRowInfo: {
    flex: 1,
  },
  userRowName: {
    fontSize: typography.size.base,
    fontFamily: typography.family.semibold,
    color: colors.textPrimary,
  },
  userRowUsername: {
    fontSize: typography.size.sm,
    fontFamily: typography.family.regular,
    color: colors.textMuted,
  },
  followingBadge: {
    backgroundColor: colors.background.elevated,
    borderRadius: 8,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  followingBadgeText: {
    fontSize: typography.size.xs,
    fontFamily: typography.family.medium,
    color: colors.textSecondary,
  },
});
