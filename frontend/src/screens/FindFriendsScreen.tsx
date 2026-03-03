import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  Image,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Avatar from '../components/common/Avatar';
import { useAuth } from '../store/AuthContext';
import { fetchSuggestedUsers, searchUsers, toggleFollow } from '../api/accounts';
import { SuggestedUser, UserSearchResult } from '../types/user';
import { colors, spacing, typography } from '../theme';
import { RootStackParamList } from '../navigation/types';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'FindFriends'>;
};

export default function FindFriendsScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { user: me } = useAuth();
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<SuggestedUser[]>([]);
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searching, setSearching] = useState(false);
  const [followedIds, setFollowedIds] = useState<Set<string>>(new Set());

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchGen = useRef(0);

  const loadSuggestions = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const data = await fetchSuggestedUsers();
      setSuggestions(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadSuggestions(); }, [loadSuggestions]);

  const handleQueryChange = useCallback((text: string) => {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!text.trim()) {
      setSearchResults([]);
      setSearching(false);
      return;
    }

    searchGen.current += 1;
    const gen = searchGen.current;

    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const results = await searchUsers(text.trim());
        if (gen === searchGen.current) setSearchResults(results);
      } catch {
        // ignore
      } finally {
        if (gen === searchGen.current) setSearching(false);
      }
    }, 300);
  }, []);

  const handleFollow = useCallback(async (username: string, userId: string) => {
    setFollowedIds(prev => new Set(prev).add(userId));
    try {
      const res = await toggleFollow(username);
      if (!res.following) {
        setFollowedIds(prev => { const s = new Set(prev); s.delete(userId); return s; });
      }
    } catch {
      setFollowedIds(prev => { const s = new Set(prev); s.delete(userId); return s; });
    }
  }, []);

  const isSearchMode = query.trim().length > 0;

  const renderSuggestion = ({ item }: { item: SuggestedUser }) => {
    if (me?.username === item.username) return null;
    return (
      <SuggestionCard
        item={item}
        isFollowing={item.is_following || followedIds.has(item.id)}
        onFollow={() => handleFollow(item.username, item.id)}
        onPress={() => navigation.navigate('Profile', { username: item.username })}
      />
    );
  };

  const renderSearchResult = ({ item }: { item: UserSearchResult }) => {
    if (me?.username === item.username) return null;
    return (
      <SearchResultCard
        item={item}
        isFollowing={item.is_following || followedIds.has(item.id)}
        onFollow={() => handleFollow(item.username, item.id)}
        onPress={() => navigation.navigate('Profile', { username: item.username })}
      />
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background.base }}>
      <LinearGradient
        colors={['#4FC3E0', '#6DCFE8', '#A8E2F4', '#D6F2FB', '#FFFFFF']}
        locations={[0, 0.2, 0.5, 0.75, 1]}
        style={{ paddingBottom: spacing.lg }}
      >
        {/* Header row */}
        <View style={[styles.headerBar, { paddingTop: insets.top + 8 }]}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Feather name="arrow-left" size={22} color={colors.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>Find Friends</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Search bar inside gradient so it fades in nicely */}
        <View style={styles.searchRow}>
          <Feather name="search" size={16} color={colors.textMuted} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by username…"
            placeholderTextColor={colors.textMuted}
            value={query}
            onChangeText={handleQueryChange}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {query.length > 0 && (
            <Pressable onPress={() => handleQueryChange('')} hitSlop={8}>
              <Feather name="x-circle" size={16} color={colors.textMuted} />
            </Pressable>
          )}
        </View>
      </LinearGradient>

      {/* List */}
      {isSearchMode ? (
        searching ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          <FlatList
            data={searchResults}
            keyExtractor={(item) => item.id}
            renderItem={renderSearchResult}
            contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
            ListEmptyComponent={
              <View style={styles.center}>
                <Text style={styles.emptyText}>No users found</Text>
              </View>
            }
          />
        )
      ) : loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={suggestions}
          keyExtractor={(item) => item.id}
          renderItem={renderSuggestion}
          contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => loadSuggestions(true)}
              tintColor={colors.primary}
            />
          }
          ListHeaderComponent={
            suggestions.length > 0 ? (
              <Text style={styles.sectionLabel}>Suggested for you</Text>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Feather name="users" size={40} color={colors.textMuted} />
              <Text style={styles.emptyText}>No suggestions yet</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

// ─── Suggestion Card ──────────────────────────────────────────────────────────

function SuggestionCard({
  item,
  isFollowing,
  onFollow,
  onPress,
}: {
  item: SuggestedUser;
  isFollowing: boolean;
  onFollow: () => void;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={onPress}
    >
      <Avatar uri={item.avatar_url} name={item.display_name} size={44} />
      <View style={styles.cardInfo}>
        <Text style={styles.cardName} numberOfLines={1}>{item.display_name}</Text>
        <Text style={styles.cardUsername} numberOfLines={1}>@{item.username}</Text>
        {(item.mutual_count > 0 || item.mutual_previews.length > 0) && (
          <View style={styles.mutualRow}>
            {item.mutual_previews.slice(0, 3).map((m) => (
              <MiniAvatar key={m.id} uri={m.avatar_url} name={m.username} />
            ))}
            {item.mutual_count > 0 && (
              <Text style={styles.mutualText}>
                {item.mutual_count} mutual follower{item.mutual_count !== 1 ? 's' : ''}
              </Text>
            )}
          </View>
        )}
      </View>
      <FollowButton isFollowing={isFollowing} onPress={onFollow} />
    </Pressable>
  );
}

// ─── Search Result Card ───────────────────────────────────────────────────────

function SearchResultCard({
  item,
  isFollowing,
  onFollow,
  onPress,
}: {
  item: UserSearchResult;
  isFollowing: boolean;
  onFollow: () => void;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={onPress}
    >
      <Avatar uri={item.avatar_url} name={item.display_name} size={44} />
      <View style={styles.cardInfo}>
        <Text style={styles.cardName} numberOfLines={1}>{item.display_name}</Text>
        <Text style={styles.cardUsername} numberOfLines={1}>@{item.username}</Text>
      </View>
      <FollowButton isFollowing={isFollowing} onPress={onFollow} />
    </Pressable>
  );
}

// ─── Follow Button ────────────────────────────────────────────────────────────

function FollowButton({ isFollowing, onPress }: { isFollowing: boolean; onPress: () => void }) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.followBtn,
        isFollowing && styles.followBtnOutline,
        pressed && { opacity: 0.7 },
      ]}
      onPress={(e) => { e.stopPropagation?.(); onPress(); }}
    >
      <Text style={[styles.followBtnText, isFollowing && styles.followBtnTextOutline]}>
        {isFollowing ? 'Following' : 'Follow'}
      </Text>
    </Pressable>
  );
}

// ─── Mini Avatar (16px) ───────────────────────────────────────────────────────

function MiniAvatar({ uri, name }: { uri: string | null; name: string }) {
  const [failed, setFailed] = useState(false);
  if (uri && !failed) {
    return (
      <Image
        source={{ uri }}
        style={styles.miniAvatar}
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <View style={[styles.miniAvatar, styles.miniAvatarFallback]}>
      <Text style={styles.miniAvatarText}>{(name[0] ?? '?').toUpperCase()}</Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.base,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: typography.size.xl, fontWeight: '700', color: colors.textPrimary },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.base,
    paddingHorizontal: spacing.md,
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border.default,
    height: 42,
  },
  searchIcon: { marginRight: spacing.sm },
  searchInput: {
    flex: 1,
    fontSize: typography.size.base,
    color: colors.textPrimary,
    ...Platform.select({ android: { paddingVertical: 0 } }),
  },
  sectionLabel: {
    fontSize: typography.size.sm,
    fontWeight: '600',
    color: colors.textMuted,
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingTop: spacing['2xl'],
  },
  emptyText: { fontSize: typography.size.base, color: colors.textMuted },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  cardPressed: { opacity: 0.7 },
  cardInfo: { flex: 1 },
  cardName: { fontSize: typography.size.base, fontWeight: '600', color: colors.textPrimary },
  cardUsername: { fontSize: typography.size.sm, color: colors.textMuted, marginTop: 1 },
  mutualRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  mutualText: { fontSize: typography.size.xs, color: colors.textSecondary },
  followBtn: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    minWidth: 84,
    alignItems: 'center',
    justifyContent: 'center',
  },
  followBtnOutline: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: colors.borderColor,
  },
  followBtnText: { fontSize: typography.size.sm, fontWeight: '600', color: colors.textOnPrimary },
  followBtnTextOutline: { color: colors.textPrimary },
  miniAvatar: { width: 16, height: 16, borderRadius: 8 },
  miniAvatarFallback: { backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  miniAvatarText: { fontSize: 8, fontWeight: '700', color: '#fff' },
});
