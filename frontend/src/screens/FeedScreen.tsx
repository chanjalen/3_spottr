import React, { useCallback, useRef, useState, useEffect } from 'react';
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
  Animated,
  Alert,
  useWindowDimensions,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { FeedTab } from '../components/common/FeedTabs';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { FeedItem } from '../types/feed';
import { UserSearchResult } from '../types/user';
import FeedCard from '../components/feed/FeedCard';
import ImmersiveFeedList, { ImmersiveFeedListHandle } from '../components/feed/ImmersiveFeedList';
import FeedTabs from '../components/common/FeedTabs';
import EmptyState from '../components/common/EmptyState';
import AppHeader from '../components/navigation/AppHeader';
import CommentsSheet from '../components/comments/CommentsSheet';
import ShareSheet from '../components/feed/ShareSheet';
import Avatar from '../components/common/Avatar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFeed } from '../hooks/useFeed';
import { useToggleLike } from '../hooks/useToggleLike';
import { usePollVote } from '../hooks/usePollVote';
import { useAuth } from '../store/AuthContext';
import { deletePost, deleteCheckin } from '../api/feed';
import { colors, spacing, typography } from '../theme';
import { RootStackParamList } from '../navigation/types';

type RootNav = NativeStackNavigationProp<RootStackParamList>;

export default function FeedScreen() {
  const navigation = useNavigation<RootNav>();
  const { user: currentUser } = useAuth();
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
    removeItem,
    loadMore,
    handleSearchChange,
    clearSearch,
  } = useFeed();

  const handleLike = useToggleLike(updateItem);
  const handlePollVote = usePollVote(updateItem);

  const handleDelete = useCallback((item: FeedItem) => {
    Alert.alert(
      'Delete Post',
      'Are you sure you want to delete this post? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              if (item.type === 'checkin') {
                await deleteCheckin(item.id);
              } else {
                await deletePost(item.id);
              }
              removeItem(item.id);
            } catch {
              Alert.alert('Error', 'Could not delete the post. Please try again.');
            }
          },
        },
      ],
    );
  }, [removeItem]);
  // Refresh feed whenever this screen comes back into focus (e.g. after creating a post)
  const initialFocusHandled = useRef(false);
  useEffect(() => {
    const unsubscribeFocus = navigation.addListener('focus', () => {
      if (!initialFocusHandled.current) {
        initialFocusHandled.current = true;
        return; // Skip initial mount — useFeed already loads on mount
      }
      refresh();
      // Re-snap the immersive FlatList to the current item in case the scroll
      // position drifted while the screen was inactive.
      if (isImmersiveRef.current) {
        immersiveListRef.current?.snapToCurrentItem();
      }
    });
    const unsubscribeBlur = navigation.addListener('blur', () => {
      setIsSearchFocused(false);
      searchInputRef.current?.blur();
    });
    return () => { unsubscribeFocus(); unsubscribeBlur(); };
  }, [navigation, refresh]);

  const immersiveListRef = useRef<ImmersiveFeedListHandle>(null);
  const isImmersiveRef = useRef(false);

  const [commentItem, setCommentItem] = useState<FeedItem | null>(null);
  const [shareItem, setShareItem] = useState<FeedItem | null>(null);
  const [containerHeight, setContainerHeight] = useState(0);
  const [headerHeight, setHeaderHeight] = useState(0);
  const searchInputRef = useRef<TextInput>(null);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [filterDropdownOpen, setFilterDropdownOpen] = useState(false);
  const dropdownAnim = useRef(new Animated.Value(0)).current;

  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  // Floating pill sits at bottom:14, height:66 → clears at 80px. Add 10px breathing room.
  const bottomNavHeight = 90;
  const isImmersive = activeTab !== 'main';
  isImmersiveRef.current = isImmersive;

  // Reset measured heights when switching between immersive ↔ main layouts
  useEffect(() => {
    setContainerHeight(0);
    setHeaderHeight(0);
  }, [isImmersive]);

  useEffect(() => {
    Animated.timing(dropdownAnim, {
      toValue: filterDropdownOpen ? 1 : 0,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [filterDropdownOpen]);

  const handleCancelSearch = () => {
    clearSearch();
    setIsSearchFocused(false);
    searchInputRef.current?.blur();
  };

  const handleDropdownSelect = (tab: FeedTab) => {
    setFilterDropdownOpen(false);
    setIsSearchFocused(false);
    changeTab(tab);
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
        onPressUser={() => navigation.navigate('Profile', { username: item.user.username })}
        onDelete={currentUser?.username === item.user.username ? () => handleDelete(item) : undefined}
      />
    ),
    [handleLike, handlePollVote, handleDelete, navigation, currentUser],
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

  const isSearchActive = isSearchFocused || searchQuery.length > 0;
  const showDropdown = isSearchActive;
  const hasSearchResults =
    searchResults &&
    (searchResults.users.length > 0 || searchResults.posts.length > 0);

  // ─── Immersive layout (Friends / Gym / Org tabs) ───────────────────────────
  if (isImmersive) {
    return (
      <View style={styles.root}>
        {/* Feed fills the full screen — posts render behind header and nav bar.
            topInset/bottomInset tell the card where to place its interactive content. */}
        <View
          style={StyleSheet.absoluteFill}
          onLayout={(e) => {
            const h = e.nativeEvent.layout.height;
            if (h > 0) setContainerHeight(h);
          }}
        >
          {(isLoading && items.length === 0) ? (
            <View style={styles.loader}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : (
            <ImmersiveFeedList
              ref={immersiveListRef}
              items={items}
              itemHeight={containerHeight > 0 ? containerHeight : windowHeight}
              topInset={headerHeight}
              bottomInset={bottomNavHeight}
              activeTab={activeTab}
              onLike={handleLike}
              onComment={(item) => setCommentItem(item)}
              onPollVote={(item, optionId) => handlePollVote(item, optionId)}
              onRefresh={refresh}
              isRefreshing={isRefreshing}
              onEndReached={handleEndReached}
              isLoadingMore={isLoadingMore}
              onAddFriends={() => navigation.navigate('FindFriends')}
            />
          )}
        </View>

        {/* Header — switches between dark TikTok-style gradient and main-feed cyan
            gradient when search is active, so the search experience is identical. */}
        <LinearGradient
          colors={isSearchActive
            ? ['#4FC3E0', '#6DCFE8', '#A8E2F4', '#D6F2FB', '#FFFFFF']
            : ['rgba(0,0,0,0.65)', 'rgba(0,0,0,0.25)', 'transparent']}
          locations={isSearchActive ? [0, 0.2, 0.5, 0.75, 1] : [0, 0.6, 1]}
          style={styles.floatingHeader}
          pointerEvents="box-none"
          onLayout={(e) => {
            const h = e.nativeEvent.layout.height;
            if (h > 0) setHeaderHeight(h);
          }}
        >
          <AppHeader />
          <View style={styles.searchRow}>
            <View style={[styles.searchInputWrap, !isSearchActive && styles.searchInputWrapDark, { flex: 1 }]}>
              <Feather name="search" size={16} color={isSearchActive ? colors.textSecondary : 'rgba(255,255,255,0.8)'} />
              <TextInput
                ref={searchInputRef}
                style={[styles.searchInput, !isSearchActive && styles.searchInputDark]}
                value={searchQuery}
                onChangeText={handleSearchChange}
                onFocus={() => setIsSearchFocused(true)}
                placeholder="Search users or #hashtags..."
                placeholderTextColor={isSearchActive ? colors.textSecondary : 'rgba(255,255,255,0.6)'}
                returnKeyType="search"
                autoCorrect={false}
                autoCapitalize="none"
              />
              {searchQuery.length > 0 && (
                <Pressable
                  onPress={() => { clearSearch(); searchInputRef.current?.blur(); }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Feather name="x" size={16} color={isSearchActive ? colors.textSecondary : 'rgba(255,255,255,0.9)'} />
                </Pressable>
              )}
            </View>
            {isSearchActive && (
              <Pressable onPress={handleCancelSearch} style={styles.cancelBtn} hitSlop={8}>
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
            )}
          </View>
          <FeedTabs
            activeTab={activeTab}
            onTabChange={(tab) => { setFilterDropdownOpen(false); changeTab(tab); }}
            onDropdownPress={() => setFilterDropdownOpen((o) => !o)}
            dark={!isSearchActive}
          />
        </LinearGradient>

        {/* Search results — starts below the header */}
        {showDropdown && (
          <View style={[styles.dropdownOverlay, { top: headerHeight }]}>
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
                        onComment={() => {
                          clearSearch();
                          setCommentItem(item);
                        }}
                        onShare={() => { clearSearch(); setShareItem(item); }}
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

        {/* Filter dropdown — appears above header when left tab chevron is tapped */}
        {filterDropdownOpen && (
          <>
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={() => setFilterDropdownOpen(false)}
            />
            <Animated.View
              style={[
                styles.filterDropdown,
                { top: headerHeight + 8 },
                {
                  opacity: dropdownAnim,
                  transform: [{ translateY: dropdownAnim.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }) }],
                },
              ]}
            >
              {(
                [
                  { key: 'friends', label: 'Friends/Groups', icon: 'users' },
                  { key: 'gym', label: 'Gym', icon: 'map-pin' },
                  { key: 'org', label: 'Organizations', icon: 'flag' },
                ] as { key: FeedTab; label: string; icon: React.ComponentProps<typeof Feather>['name'] }[]
              ).map((option, i, arr) => (
                <Pressable
                  key={option.key}
                  style={({ pressed }) => [
                    styles.filterOption,
                    i < arr.length - 1 && styles.filterOptionBorder,
                    pressed && styles.filterOptionPressed,
                  ]}
                  onPress={() => handleDropdownSelect(option.key)}
                >
                  <Feather name={option.icon} size={16} color={activeTab === option.key ? colors.primary : colors.textSecondary} />
                  <Text style={[styles.filterOptionText, activeTab === option.key && styles.filterOptionTextActive]}>
                    {option.label}
                  </Text>
                  {activeTab === option.key && (
                    <Feather name="check" size={16} color={colors.primary} />
                  )}
                </Pressable>
              ))}
            </Animated.View>
          </>
        )}

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

  // ─── Main feed layout (unchanged) ──────────────────────────────────────────
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
              placeholder="Search users or #hashtags..."
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

        <FeedTabs
          activeTab={activeTab}
          onTabChange={(tab) => { setFilterDropdownOpen(false); changeTab(tab); }}
          onDropdownPress={() => setFilterDropdownOpen((o) => !o)}
        />
      </LinearGradient>

      {/* Feed content — position: relative so dropdown can be absolute inside it */}
      <View
        style={styles.feedContainer}
        onLayout={(e) => {
          const h = e.nativeEvent.layout.height;
          if (h > 0) setContainerHeight(h);
        }}
      >
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
            ListEmptyComponent={<EmptyState tab={activeTab} onAddFriends={activeTab === 'friends' ? () => navigation.navigate('FindFriends') : undefined} />}
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

        {/* Filter dropdown — appears when left tab chevron is tapped */}
        {filterDropdownOpen && (
          <>
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={() => setFilterDropdownOpen(false)}
            />
            <Animated.View
              style={[
                styles.filterDropdown,
                {
                  opacity: dropdownAnim,
                  transform: [{ translateY: dropdownAnim.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }) }],
                },
              ]}
            >
              {(
                [
                  { key: 'friends', label: 'Friends/Groups', icon: 'users' },
                  { key: 'gym', label: 'Gym', icon: 'map-pin' },
                  { key: 'org', label: 'Organizations', icon: 'flag' },
                ] as { key: FeedTab; label: string; icon: React.ComponentProps<typeof Feather>['name'] }[]
              ).map((option, i, arr) => (
                <Pressable
                  key={option.key}
                  style={({ pressed }) => [
                    styles.filterOption,
                    i < arr.length - 1 && styles.filterOptionBorder,
                    pressed && styles.filterOptionPressed,
                  ]}
                  onPress={() => handleDropdownSelect(option.key)}
                >
                  <Feather name={option.icon} size={16} color={activeTab === option.key ? colors.primary : colors.textSecondary} />
                  <Text style={[styles.filterOptionText, activeTab === option.key && styles.filterOptionTextActive]}>
                    {option.label}
                  </Text>
                  {activeTab === option.key && (
                    <Feather name="check" size={16} color={colors.primary} />
                  )}
                </Pressable>
              ))}
            </Animated.View>
          </>
        )}

        {/* Search overlay — absolute inside feedContainer, covers feed below header */}
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
  // Immersive layout — header floats over the feed
  floatingHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
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

  // Search bar
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
  searchInputDark: {
    color: '#FFFFFF',
  },
  searchInputWrapDark: {
    borderColor: 'rgba(255,255,255,0.3)',
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

  // Filter dropdown
  filterDropdown: {
    position: 'absolute',
    top: 8,
    left: spacing.xl,
    backgroundColor: colors.surface,
    borderRadius: 14,
    zIndex: 20,
    minWidth: 200,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.14, shadowRadius: 20 },
      android: { elevation: 8 },
    }),
  },
  filterOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.base,
    paddingVertical: 14,
  },
  filterOptionBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  filterOptionPressed: {
    backgroundColor: colors.background.elevated,
  },
  filterOptionText: {
    flex: 1,
    fontSize: typography.size.base,
    fontFamily: typography.family.medium,
    color: colors.textPrimary,
  },
  filterOptionTextActive: {
    color: colors.primary,
    fontFamily: typography.family.semibold,
  },
});
