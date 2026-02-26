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
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { FeedTab } from '../components/common/FeedTabs';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { FeedItem } from '../types/feed';
import { UserSearchResult } from '../types/user';
import FeedCard from '../components/feed/FeedCard';
import ImmersiveFeedList from '../components/feed/ImmersiveFeedList';
import FeedTabs from '../components/common/FeedTabs';
import EmptyState from '../components/common/EmptyState';
import AppHeader from '../components/navigation/AppHeader';
import CommentsSheet from '../components/comments/CommentsSheet';
import Avatar from '../components/common/Avatar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
  const [containerHeight, setContainerHeight] = useState(0);
  const [headerHeight, setHeaderHeight] = useState(0);
  const searchInputRef = useRef<TextInput>(null);
  const [filterDropdownOpen, setFilterDropdownOpen] = useState(false);
  const dropdownAnim = useRef(new Animated.Value(0)).current;

  const insets = useSafeAreaInsets();
  // Solid white nav bar: paddingTop(10) + FAB height(64) + bottom safe area
  const bottomNavHeight = 74 + Math.max(insets.bottom, 16);
  const isImmersive = activeTab !== 'main';

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

  const handleDropdownSelect = (tab: FeedTab) => {
    setFilterDropdownOpen(false);
    changeTab(tab);
  };

  const renderItem = useCallback(
    ({ item, index }: { item: FeedItem; index: number }) => (
      <FeedCard
        item={item}
        index={index}
        onLike={() => handleLike(item)}
        onComment={() => setCommentItem(item)}
        onPollVote={(optionId: number | string) => handlePollVote(item, optionId)}
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
          {(containerHeight === 0 || (isLoading && items.length === 0)) ? (
            <View style={styles.loader}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : (
            <ImmersiveFeedList
              items={items}
              itemHeight={containerHeight}
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
            />
          )}
        </View>

        {/* Header — transparent dark overlay so the post shows through (TikTok-style).
            Dark-to-transparent gradient keeps white icons readable on any post.
            pointerEvents="box-none" lets the gradient pass touches to the feed. */}
        <LinearGradient
          colors={['rgba(0,0,0,0.65)', 'rgba(0,0,0,0.25)', 'transparent']}
          locations={[0, 0.6, 1]}
          style={styles.floatingHeader}
          pointerEvents="box-none"
          onLayout={(e) => {
            const h = e.nativeEvent.layout.height;
            if (h > 0) setHeaderHeight(h);
          }}
        >
          <AppHeader />
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
          <FeedTabs
            activeTab={activeTab}
            onTabChange={(tab) => { setFilterDropdownOpen(false); changeTab(tab); }}
            onDropdownPress={() => setFilterDropdownOpen((o) => !o)}
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
                        onPollVote={(optionId: number | string) => handlePollVote(item, optionId)}
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
        />
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
                      onPollVote={(optionId: number | string) => handlePollVote(item, optionId)}
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
