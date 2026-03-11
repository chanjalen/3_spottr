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
import EmptyState from '../components/common/EmptyState';
import AppHeader from '../components/navigation/AppHeader';
import CommentsSheet from '../components/comments/CommentsSheet';
import ShareSheet from '../components/feed/ShareSheet';
import Avatar from '../components/common/Avatar';
import { useFeed } from '../hooks/useFeed';
import { useToggleLike } from '../hooks/useToggleLike';
import { usePollVote } from '../hooks/usePollVote';
import { useAuth } from '../store/AuthContext';
import { colors, spacing, typography } from '../theme';
import { RootStackParamList } from '../navigation/types';

type RootNav = NativeStackNavigationProp<RootStackParamList>;

export default function PostsScreen() {
  const navigation = useNavigation<RootNav>();
  const { user } = useAuth();

  const {
    items,
    isLoading,
    isRefreshing,
    isLoadingMore,
    hasMore,
    searchQuery,
    searchResults,
    isSearching,
    refresh,
    updateItem,
    removeItem,
    loadMore,
    handleSearchChange,
    clearSearch,
  } = useFeed('main');

  const handleLike = useToggleLike(updateItem);
  const handlePollVote = usePollVote(updateItem);

  const searchInputRef = useRef<TextInput>(null);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [commentItem, setCommentItem] = useState<FeedItem | null>(null);
  const [shareItem, setShareItem] = useState<FeedItem | null>(null);

  const bottomNavHeight = 90;
  const isSearchActive = isSearchFocused || searchQuery.length > 0;
  const hasSearchResults =
    searchResults !== null &&
    (searchResults.users.length > 0 || searchResults.posts.length > 0);
  const showDropdown = isSearchActive && (isSearching || searchResults !== null);

  const handleCancelSearch = () => {
    clearSearch();
    setIsSearchFocused(false);
    searchInputRef.current?.blur();
  };

  const renderItem = useCallback(
    ({ item, index }: { item: FeedItem; index: number }) => (
      <FeedCard
        item={item}
        index={index}
        onLike={() => handleLike(item)}
        onComment={() => setCommentItem(item)}
        onShare={() => setShareItem(item)}
        onPollVote={(optionId: number | string) => handlePollVote(item, optionId)}
        onDelete={() => removeItem(item.id)}
        onPressUser={() => navigation.navigate('Profile', { username: item.user.username })}
      />
    ),
    [handleLike, handlePollVote, removeItem, navigation],
  );

  const renderFooter = () => {
    if (!isLoadingMore) return null;
    return (
      <View style={styles.footerLoader}>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    );
  };

  const handleEndReached = useCallback(() => {
    if (hasMore && !isLoadingMore && !isLoading) loadMore();
  }, [hasMore, isLoadingMore, isLoading, loadMore]);

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
          <View style={[styles.searchInputWrap, { flex: 1 }]}>
            <Feather name="search" size={16} color={colors.textSecondary} />
            <TextInput
              ref={searchInputRef}
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={handleSearchChange}
              onFocus={() => setIsSearchFocused(true)}
              placeholder="Search posts or #hashtags..."
              placeholderTextColor={colors.textSecondary}
              returnKeyType="search"
              autoCorrect={false}
              autoCapitalize="none"
            />
            {searchQuery.length > 0 && (
              <Pressable
                onPress={() => { clearSearch(); searchInputRef.current?.blur(); }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Feather name="x" size={16} color={colors.textSecondary} />
              </Pressable>
            )}
          </View>
          {isSearchActive && (
            <Pressable onPress={handleCancelSearch} style={styles.cancelBtn} hitSlop={8}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
          )}
        </View>
      </LinearGradient>

      {/* Feed content */}
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
              { paddingBottom: bottomNavHeight + 16 },
              items.length === 0 && styles.emptyList,
            ]}
            ListHeaderComponent={
              <StartPostBar
                user={user}
                onPress={() => navigation.navigate('CreatePost')}
              />
            }
            ListEmptyComponent={<EmptyState tab="main" />}
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

        {/* Search overlay */}
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
            ) : searchResults === null ? null : (
              <ScrollView
                style={styles.dropdownScroll}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
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
                {searchResults.posts.length > 0 && (
                  <View>
                    <Text style={styles.dropdownSectionLabel}>Posts</Text>
                    {searchResults.posts.map((item, index) => (
                      <FeedCard
                        key={`${item.type}-${item.id}`}
                        item={item}
                        index={index}
                        onLike={() => handleLike(item)}
                        onComment={() => { clearSearch(); setCommentItem(item); }}
                        onPollVote={(optionId: number | string) => handlePollVote(item, optionId)}
                        onPressUser={() => navigation.navigate('Profile', { username: item.user.username })}
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
        onCommentCountChange={(delta) => {
          if (commentItem) {
            updateItem(commentItem.id, {
              comment_count: Math.max(0, (commentItem.comment_count ?? 0) + delta),
            });
          }
        }}
      />
      <ShareSheet item={shareItem} onClose={() => setShareItem(null)} />
    </View>
  );
}

// ─── Start Post Bar ───────────────────────────────────────────────────────────

interface StartPostBarProps {
  user: { avatar_url?: string | null; display_name?: string } | null;
  onPress: () => void;
}

function StartPostBar({ user: authUser, onPress }: StartPostBarProps) {
  return (
    <Pressable
      style={({ pressed }) => [styles.startPostCard, pressed && { opacity: 0.85 }]}
      onPress={onPress}
    >
      <View style={styles.startPostTop}>
        <Avatar
          uri={authUser?.avatar_url ?? null}
          name={authUser?.display_name ?? 'Me'}
          size={40}
        />
        <View style={styles.startPostPill}>
          <Text style={styles.startPostPlaceholder}>Start a post...</Text>
        </View>
      </View>
      <View style={styles.startPostDivider} />
      <View style={styles.startPostActions}>
        <View style={styles.startPostAction}>
          <Feather name="image" size={18} color={colors.primary} />
          <Text style={styles.startPostActionText}>Media</Text>
        </View>
        <View style={styles.startPostActionSep} />
        <View style={styles.startPostAction}>
          <Feather name="bar-chart-2" size={18} color="#8B5CF6" />
          <Text style={styles.startPostActionText}>Poll</Text>
        </View>
        <View style={styles.startPostActionSep} />
        <View style={styles.startPostAction}>
          <Feather name="award" size={18} color="#F59E0B" />
          <Text style={styles.startPostActionText}>PR</Text>
        </View>
      </View>
    </Pressable>
  );
}

function UserResultRow({ user, onPress }: { user: UserSearchResult; onPress: () => void }) {
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
    paddingTop: spacing.md,
  },
  emptyList: {
    flex: 1,
  },
  footerLoader: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
  },
  searchRow: {
    paddingHorizontal: spacing.xl,
    paddingBottom: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  searchInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.primary,
    borderRadius: 24,
    paddingHorizontal: spacing.md,
    paddingVertical: Platform.OS === 'ios' ? 6 : 4,
    gap: spacing.sm,
  },
  cancelBtn: {
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
  },
  cancelText: {
    fontSize: typography.size.sm,
    fontFamily: typography.family.medium,
    color: colors.primary,
  },
  searchInput: {
    flex: 1,
    fontSize: typography.size.sm,
    fontFamily: typography.family.regular,
    color: colors.textSecondary,
    paddingVertical: 0,
  },
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
  // Start post bar
  startPostCard: {
    backgroundColor: colors.surface,
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
      },
      android: { elevation: 2 },
    }),
  },
  startPostTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
  },
  startPostPill: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: colors.border.default,
    borderRadius: 9999,
    paddingHorizontal: spacing.md,
    paddingVertical: Platform.OS === 'ios' ? 8 : 6,
  },
  startPostPlaceholder: {
    fontSize: typography.size.sm,
    color: colors.textMuted,
  },
  startPostDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border.subtle,
    marginHorizontal: spacing.md,
  },
  startPostActions: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  startPostAction: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  startPostActionText: {
    fontSize: typography.size.xs,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  startPostActionSep: {
    width: 1,
    height: 16,
    backgroundColor: colors.border.subtle,
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
