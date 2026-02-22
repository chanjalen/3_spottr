import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  FlatList,
  SectionList,
  ActivityIndicator,
  RefreshControl,
  Modal,
  Dimensions,
  Platform,
  Alert,
  TextInput,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { VideoView, useVideoPlayer } from 'expo-video';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { RouteProp } from '@react-navigation/native';
import Avatar from '../../components/common/Avatar';
import FeedCard from '../../components/feed/FeedCard';
import CommentsSheet from '../../components/comments/CommentsSheet';
import { useAuth } from '../../store/AuthContext';
import { fetchProfile, toggleFollow, fetchUserPRs, savePR, deletePR } from '../../api/accounts';
import { fetchExerciseCatalog } from '../../api/workouts';
import { fetchUserPosts } from '../../api/feed';
import { useToggleLike } from '../../hooks/useToggleLike';
import { usePollVote } from '../../hooks/usePollVote';
import { UserProfile, PersonalRecord } from '../../types/user';
import { ExerciseCatalogItem } from '../../types/workout';
import { FeedItem } from '../../types/feed';
import { colors, spacing, typography } from '../../theme';

type Props = {
  // Uses `any` so this screen can live in any tab stack while still calling
  // root-stack screens (EditProfile, Chat, etc.) via navigator traversal at runtime.
  navigation: any;
  route: RouteProp<{ Profile: { username: string } }, 'Profile'>;
};

type ProfileTab = 'Posts' | 'Calendar' | 'Records';

const SCREEN_WIDTH = Dimensions.get('window').width;
const SCREEN_HEIGHT = Dimensions.get('window').height;
const GRID_PADDING = spacing.xl * 2;
const THUMB_GAP = 2;
const THUMB_SIZE = (SCREEN_WIDTH - GRID_PADDING - THUMB_GAP * 2) / 3;

export default function ProfileScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { user: me } = useAuth();
  const { username } = route.params;
  const isOwn = me?.username === username;

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<ProfileTab>('Posts');
  const [followLoading, setFollowLoading] = useState(false);

  // Posts tab
  const [posts, setPosts] = useState<FeedItem[]>([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [postsHasMore, setPostsHasMore] = useState(false);
  const [postsCursor, setPostsCursor] = useState('');
  const postsLoadingRef = useRef(false);
  const postsLoaded = useRef(false);

  // PRs tab
  const [prs, setPrs] = useState<PersonalRecord[]>([]);
  const [prsLoading, setPrsLoading] = useState(false);
  const prsLoaded = useRef(false);

  // Add PR modal
  const [prModalVisible, setPrModalVisible] = useState(false);
  const [prExercise, setPrExercise] = useState('');
  const [prValue, setPrValue] = useState('');
  const [prUnit, setPrUnit] = useState('lbs');
  const [prVideoUri, setPrVideoUri] = useState<string | null>(null);
  const [prSaving, setPrSaving] = useState(false);

  // Exercise catalog picker — shown inline inside the PR modal (avoids nested-modal focus bug)
  const [catalogVisible, setCatalogVisible] = useState(false);
  const [catalogQuery, setCatalogQuery] = useState('');
  const [catalogCategory, setCatalogCategory] = useState('All');
  const [catalogAllItems, setCatalogAllItems] = useState<ExerciseCatalogItem[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const catalogSearchRef = useRef<TextInput>(null);

  const CATALOG_CATEGORIES = ['All', 'Arms', 'Back', 'Chest', 'Core', 'Cardio', 'Legs', 'Shoulders'];

  const filteredCatalog = useMemo(() => {
    let items = catalogAllItems;
    if (catalogCategory !== 'All') {
      items = items.filter((i) => i.category === catalogCategory);
    }
    if (catalogQuery) {
      const q = catalogQuery.toLowerCase();
      items = items.filter((i) => i.name.toLowerCase().includes(q));
    }
    return items;
  }, [catalogAllItems, catalogCategory, catalogQuery]);

  const catalogSections = useMemo(() => {
    const groups: Record<string, ExerciseCatalogItem[]> = {};
    filteredCatalog.forEach((item) => {
      if (!groups[item.category]) groups[item.category] = [];
      groups[item.category].push(item);
    });
    return Object.entries(groups).map(([title, data]) => ({ title, data }));
  }, [filteredCatalog]);

  // Post viewer pager
  const [viewerStartIndex, setViewerStartIndex] = useState<number | null>(null);
  const [commentItem, setCommentItem] = useState<FeedItem | null>(null);

  // Video viewer (for PR videos)
  const [videoViewerUrl, setVideoViewerUrl] = useState<string | null>(null);

  // ── Load profile ─────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    try {
      const data = await fetchProfile(username);
      setProfile(data);
    } catch {
      // silently handle
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [username]);

  useEffect(() => { load(); }, [load]);

  // ── Load posts ────────────────────────────────────────────────────────────────

  const loadPosts = useCallback(async (cursor?: string) => {
    if (postsLoadingRef.current) return;
    postsLoadingRef.current = true;
    setPostsLoading(true);
    try {
      const result = await fetchUserPosts(username, cursor);
      setPosts((prev) => cursor ? [...prev, ...result.items] : result.items);
      setPostsCursor(result.nextCursor);
      setPostsHasMore(!!result.nextCursor);
    } catch {
      // endpoint may not be live yet
    } finally {
      postsLoadingRef.current = false;
      setPostsLoading(false);
    }
  }, [username]);

  // ── Load PRs ──────────────────────────────────────────────────────────────────

  const loadPRs = useCallback(async () => {
    setPrsLoading(true);
    try {
      const data = await fetchUserPRs(username);
      setPrs(data);
    } catch {
      // silently handle
    } finally {
      setPrsLoading(false);
    }
  }, [username]);

  useEffect(() => {
    // Posts are needed for both Posts and Calendar tabs
    if ((activeTab === 'Posts' || activeTab === 'Calendar') && !postsLoaded.current) {
      postsLoaded.current = true;
      loadPosts();
    }
    if (activeTab === 'Records' && !prsLoaded.current) {
      prsLoaded.current = true;
      loadPRs();
    }
  }, [activeTab, loadPosts, loadPRs]);

  // ── Follow ────────────────────────────────────────────────────────────────────

  const handleFollow = async () => {
    if (!profile) return;
    setFollowLoading(true);
    try {
      const res = await toggleFollow(username);
      setProfile((p) =>
        p ? { ...p, is_following: res.following, follower_count: p.follower_count + (res.following ? 1 : -1) } : p,
      );
    } finally {
      setFollowLoading(false);
    }
  };

  // ── Post viewer ───────────────────────────────────────────────────────────────

  const openPost = useCallback((item: FeedItem) => {
    const idx = posts.findIndex((p) => p.id === item.id);
    setViewerStartIndex(idx >= 0 ? idx : 0);
  }, [posts]);

  const updateViewerItem = useCallback((_id: string, updates: Partial<FeedItem>) => {
    setPosts((prev) => prev.map((p) => (p.id === _id ? { ...p, ...updates } : p)));
  }, []);

  const handleLike = useToggleLike(updateViewerItem);
  const handlePollVote = usePollVote(updateViewerItem);

  // ── Exercise catalog ──────────────────────────────────────────────────────────

  // Load full catalog once when picker opens; filtering is done client-side
  const loadCatalog = useCallback(async () => {
    if (catalogAllItems.length > 0) return;
    setCatalogLoading(true);
    try {
      const items = await fetchExerciseCatalog();
      setCatalogAllItems(items);
    } catch {
      setCatalogAllItems([]);
    } finally {
      setCatalogLoading(false);
    }
  }, [catalogAllItems.length]);

  useEffect(() => {
    if (catalogVisible) loadCatalog();
  }, [catalogVisible, loadCatalog]);

  // ── Video picker ──────────────────────────────────────────────────────────────

  const pickVideo = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Please allow access to your media library.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'videos',
      allowsEditing: false,
      quality: 1,
    });
    if (!result.canceled && result.assets?.[0]) {
      setPrVideoUri(result.assets[0].uri);
    }
  };

  // ── PR save ───────────────────────────────────────────────────────────────────

  const handleSavePR = async () => {
    if (!prExercise.trim() || !prValue.trim()) {
      Alert.alert('Missing info', 'Please select an exercise and enter a value.');
      return;
    }
    setPrSaving(true);
    try {
      const saved = await savePR({
        exercise_name: prExercise.trim(),
        value: parseFloat(prValue),
        unit: prUnit,
        videoUri: prVideoUri ?? undefined,
      });
      setPrs((prev) => {
        const idx = prev.findIndex((p) => p.exercise_name.toLowerCase() === saved.exercise_name.toLowerCase());
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = saved;
          return next;
        }
        return [saved, ...prev];
      });
      setPrModalVisible(false);
      setPrExercise('');
      setPrValue('');
      setPrUnit('lbs');
      setPrVideoUri(null);
    } catch {
      Alert.alert('Error', 'Could not save PR. Please try again.');
    } finally {
      setPrSaving(false);
    }
  };

  const handleDeletePR = (pr: PersonalRecord) => {
    Alert.alert('Delete PR', `Remove PR for ${pr.exercise_name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            await deletePR(pr.id);
            setPrs((prev) => prev.filter((p) => p.id !== pr.id));
          } catch {
            Alert.alert('Error', 'Could not delete PR.');
          }
        },
      },
    ]);
  };

  // ── Auto-load more posts on scroll ───────────────────────────────────────────

  const handleScroll = useCallback((e: any) => {
    if (activeTab !== 'Posts' || !postsHasMore || postsLoadingRef.current) return;
    const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
    if (layoutMeasurement.height + contentOffset.y >= contentSize.height - 400) {
      loadPosts(postsCursor);
    }
  }, [activeTab, postsHasMore, postsCursor, loadPosts]);

  // ── Navigate ──────────────────────────────────────────────────────────────────

  const goToList = (type: 'followers' | 'following' | 'friends') => {
    const titles = { followers: 'Followers', following: 'Following', friends: 'Friends' };
    navigation.navigate('UserList', { username, type, title: titles[type] });
  };

  // ── Loading/error ─────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.emptyText}>User not found</Text>
      </View>
    );
  }

  const currentStreak = profile.streak ?? 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background.base }}>
      {/* Header bar */}
      <View style={[styles.headerBar, { paddingTop: insets.top }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.iconBtn}>
          <Feather name="arrow-left" size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>@{profile.username}</Text>
        {isOwn ? (
          <Pressable onPress={() => navigation.navigate('EditProfile')} style={styles.iconBtn}>
            <Feather name="settings" size={20} color={colors.textPrimary} />
          </Pressable>
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              postsLoaded.current = false;
              prsLoaded.current = false;
              setPosts([]);
              setPrs([]);
              load();
            }}
            tintColor={colors.primary}
          />
        }
        showsVerticalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={400}
      >
        {/* ── Profile header (centered) ───────────────────────────────────── */}
        <View style={styles.profileHeader}>
          <View style={styles.avatarWrap}>
            <Avatar uri={profile.avatar_url} name={profile.display_name} size={80} />
          </View>

          <Text style={styles.displayName}>
            {profile.display_name}
            {currentStreak > 0
              ? <Text style={styles.streakInline}> 🔥{currentStreak}</Text>
              : null}
          </Text>
          <Text style={styles.usernameText}>@{profile.username}</Text>
          {profile.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}

          {/* Social stats */}
          <View style={styles.socialStats}>
            <View style={styles.socialStat}>
              <Text style={styles.socialStatValue}>{profile.total_workouts}</Text>
              <Text style={styles.socialStatLabel}>Workouts</Text>
            </View>
            <Pressable style={styles.socialStat} onPress={() => goToList('following')}>
              <Text style={styles.socialStatValue}>{profile.following_count}</Text>
              <Text style={[styles.socialStatLabel, styles.clickable]}>Following</Text>
            </Pressable>
            <Pressable style={styles.socialStat} onPress={() => goToList('followers')}>
              <Text style={styles.socialStatValue}>{profile.follower_count}</Text>
              <Text style={[styles.socialStatLabel, styles.clickable]}>Followers</Text>
            </Pressable>
          </View>

          {/* Metric cards */}
          <View style={styles.metricCards}>
            <View style={styles.metricCard}>
              <Text style={styles.metricLabel}>💪 Total Workouts</Text>
              <Text style={[styles.metricValue, { color: colors.primary }]}>
                {profile.total_workouts}
              </Text>
            </View>
            <View style={styles.metricCard}>
              <Text style={styles.metricLabel}>🔥 Best Streak</Text>
              <Text style={[styles.metricValue, { color: '#fb923c' }]}>
                {profile.longest_streak}
              </Text>
            </View>
            <Pressable style={styles.metricCard} onPress={() => goToList('friends')}>
              <Text style={styles.metricLabel}>👥 Friends</Text>
              <Text style={[styles.metricValue, { color: '#a78bfa' }]}>
                {profile.friend_count ?? 0}
              </Text>
            </Pressable>
          </View>

          {/* Action buttons — only for other users */}
          {!isOwn && (
            <View style={styles.actionRow}>
              <Pressable
                style={[styles.actionBtn, styles.actionBtnFlex, profile.is_following && styles.actionBtnOutline]}
                onPress={handleFollow}
                disabled={followLoading}
              >
                {followLoading
                  ? <ActivityIndicator size="small" color={profile.is_following ? colors.textPrimary : colors.textOnPrimary} />
                  : <Text style={[styles.actionBtnText, profile.is_following && styles.actionBtnTextOutline]}>
                      {profile.is_following ? 'Following' : 'Follow'}
                    </Text>}
              </Pressable>
              <Pressable
                style={[styles.actionBtn, styles.actionBtnFlex, styles.actionBtnOutline]}
                onPress={() => navigation.navigate('Chat', {
                  partnerId: profile.id,
                  partnerName: profile.display_name,
                  partnerUsername: profile.username,
                  partnerAvatar: profile.avatar_url,
                })}
              >
                <Text style={styles.actionBtnTextOutline}>Message</Text>
              </Pressable>
            </View>
          )}
        </View>

        {/* ── Tab bar ──────────────────────────────────────────────────────── */}
        <View style={styles.tabBar}>
          {(['Posts', 'Calendar', 'Records'] as ProfileTab[]).map((tab) => (
            <Pressable
              key={tab}
              style={[styles.tabBtn, activeTab === tab && styles.tabBtnActive]}
              onPress={() => setActiveTab(tab)}
            >
              <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>{tab}</Text>
            </Pressable>
          ))}
        </View>

        {activeTab === 'Posts' && (
          <PostsTab
            posts={posts}
            loading={postsLoading}
            onOpenPost={openPost}
          />
        )}

        {activeTab === 'Calendar' && (
          <CalendarTab posts={posts} postsLoading={postsLoading} onOpenPost={openPost} />
        )}

        {activeTab === 'Records' && (
          <RecordsTab
            prs={prs}
            loading={prsLoading}
            isOwn={isOwn}
            onAdd={() => setPrModalVisible(true)}
            onDelete={handleDeletePR}
            onViewVideo={(url) => setVideoViewerUrl(url)}
          />
        )}
      </ScrollView>

      {/* ── Post viewer modal (horizontal pager) ────────────────────────────── */}
      <Modal
        visible={viewerStartIndex !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setViewerStartIndex(null)}
      >
        <View style={{ flex: 1, backgroundColor: colors.background.base }}>
          <View style={[styles.viewerHeader, { paddingTop: insets.top > 0 ? insets.top : 16 }]}>
            <View style={styles.viewerUserRow}>
              <Avatar uri={profile.avatar_url} name={profile.display_name} size={32} />
              <Text style={styles.viewerName}>{profile.display_name}</Text>
            </View>
            <Pressable style={styles.viewerClose} onPress={() => setViewerStartIndex(null)}>
              <Feather name="x" size={22} color={colors.textPrimary} />
            </Pressable>
          </View>

          <FlatList
            data={posts}
            keyExtractor={(item) => item.id}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            initialScrollIndex={viewerStartIndex ?? 0}
            getItemLayout={(_, index) => ({
              length: SCREEN_WIDTH,
              offset: SCREEN_WIDTH * index,
              index,
            })}
            renderItem={({ item }) => (
              <ScrollView
                style={{ width: SCREEN_WIDTH }}
                contentContainerStyle={styles.viewerScroll}
                showsVerticalScrollIndicator={false}
              >
                <FeedCard
                  item={item}
                  index={0}
                  onLike={() => handleLike(item)}
                  onComment={() => setCommentItem(item)}
                  onPollVote={(optionId) => handlePollVote(item, optionId)}
                />
              </ScrollView>
            )}
          />
        </View>
        <CommentsSheet item={commentItem} onClose={() => setCommentItem(null)} />
      </Modal>

      {/* ── Add PR modal (with inline catalog picker to avoid nested-modal focus issues) ── */}
      <Modal
        visible={prModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => {
          if (catalogVisible) { setCatalogVisible(false); setCatalogQuery(''); }
          else setPrModalVisible(false);
        }}
      >
        <View style={[styles.prModal, { paddingTop: insets.top > 0 ? insets.top : 20 }]}>
          {/* ── Catalog search view (slides in over the form) ── */}
          {catalogVisible ? (
            <>
              <View style={styles.prModalHeader}>
                <Pressable onPress={() => { setCatalogVisible(false); setCatalogQuery(''); setCatalogCategory('All'); }} style={styles.iconBtn}>
                  <Feather name="arrow-left" size={20} color={colors.textPrimary} />
                </Pressable>
                <Text style={styles.prModalTitle}>Select Exercise</Text>
                <View style={{ width: 40 }} />
              </View>

              {/* Search bar */}
              <View style={styles.catalogSearchWrap}>
                <Feather name="search" size={16} color={colors.textMuted} />
                <TextInput
                  ref={catalogSearchRef}
                  style={styles.catalogSearchInput}
                  value={catalogQuery}
                  onChangeText={setCatalogQuery}
                  placeholder="Search exercises..."
                  placeholderTextColor={colors.textMuted}
                  autoFocus
                  autoCapitalize="words"
                  returnKeyType="search"
                />
                {catalogQuery.length > 0 && (
                  <Pressable onPress={() => setCatalogQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Feather name="x-circle" size={16} color={colors.textMuted} />
                  </Pressable>
                )}
              </View>

              {/* Category chips */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catalogCategoryScroll} contentContainerStyle={styles.catalogCategoryContent}>
                {CATALOG_CATEGORIES.map((cat) => (
                  <Pressable
                    key={cat}
                    style={[styles.catalogChip, catalogCategory === cat && styles.catalogChipActive]}
                    onPress={() => setCatalogCategory(cat)}
                  >
                    <Text style={[styles.catalogChipText, catalogCategory === cat && styles.catalogChipTextActive]}>{cat}</Text>
                  </Pressable>
                ))}
              </ScrollView>

              {/* Exercise list */}
              {catalogLoading ? (
                <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />
              ) : (
                <SectionList
                  sections={catalogSections}
                  keyExtractor={(item) => item.id}
                  keyboardShouldPersistTaps="handled"
                  stickySectionHeadersEnabled={false}
                  renderSectionHeader={({ section: { title } }) => (
                    <Text style={styles.catalogSectionHeader}>{title}</Text>
                  )}
                  renderItem={({ item }) => (
                    <Pressable
                      style={({ pressed }) => [styles.catalogItem, pressed && { opacity: 0.6 }]}
                      onPress={() => {
                        setPrExercise(item.name);
                        setCatalogVisible(false);
                        setCatalogQuery('');
                        setCatalogCategory('All');
                      }}
                    >
                      <Text style={styles.catalogItemName}>{item.name}</Text>
                      <Feather name="plus" size={18} color={colors.primary} />
                    </Pressable>
                  )}
                  ListEmptyComponent={
                    <View style={styles.catalogEmpty}>
                      <Text style={styles.emptyText}>
                        {catalogQuery ? 'No exercises match your search' : 'No exercises found'}
                      </Text>
                    </View>
                  }
                />
              )}
            </>
          ) : (
            /* ── PR form view ── */
            <>
              <View style={styles.prModalHeader}>
                <Text style={styles.prModalTitle}>Add Personal Record</Text>
                <Pressable onPress={() => setPrModalVisible(false)}>
                  <Feather name="x" size={22} color={colors.textPrimary} />
                </Pressable>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <View style={styles.prForm}>
                  <Text style={styles.prFormLabel}>Exercise</Text>
                  <Pressable style={styles.prCatalogBtn} onPress={() => setCatalogVisible(true)}>
                    <Text style={[styles.prCatalogBtnText, !prExercise && styles.prCatalogPlaceholder]}>
                      {prExercise || 'Select from exercise catalog…'}
                    </Text>
                    <Feather name="search" size={16} color={colors.textMuted} />
                  </Pressable>

                  <Text style={styles.prFormLabel}>Weight / Value</Text>
                  <TextInput
                    style={styles.prInput}
                    value={prValue}
                    onChangeText={setPrValue}
                    placeholder="e.g. 225"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="decimal-pad"
                  />

                  <Text style={styles.prFormLabel}>Unit</Text>
                  <View style={styles.unitRow}>
                    {['lbs', 'kg', 'reps', 'sec', 'min'].map((u) => (
                      <Pressable
                        key={u}
                        style={[styles.unitBtn, prUnit === u && styles.unitBtnActive]}
                        onPress={() => setPrUnit(u)}
                      >
                        <Text style={[styles.unitBtnText, prUnit === u && styles.unitBtnTextActive]}>{u}</Text>
                      </Pressable>
                    ))}
                  </View>

                  <Text style={styles.prFormLabel}>Proof Video (optional)</Text>
                  <Pressable style={styles.videoPickerBtn} onPress={pickVideo}>
                    <Feather name="video" size={18} color={colors.textSecondary} />
                    <Text style={styles.videoPickerText}>
                      {prVideoUri ? '✓ Video selected' : 'Attach video to verify PR'}
                    </Text>
                    {prVideoUri && (
                      <Pressable onPress={() => setPrVideoUri(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Feather name="x" size={14} color={colors.textMuted} />
                      </Pressable>
                    )}
                  </Pressable>

                  <Pressable
                    style={[styles.prSaveBtn, prSaving && { opacity: 0.6 }]}
                    onPress={handleSavePR}
                    disabled={prSaving}
                  >
                    {prSaving
                      ? <ActivityIndicator size="small" color="#000" />
                      : <Text style={styles.prSaveBtnText}>Save PR</Text>}
                  </Pressable>
                </View>
              </ScrollView>
            </>
          )}
        </View>
      </Modal>

      {/* ── PR video viewer ───────────────────────────────────────────────────── */}
      <VideoPlayerModal url={videoViewerUrl} onClose={() => setVideoViewerUrl(null)} topInset={insets.top} />
    </View>
  );
}

// ─── Video Player Modal ───────────────────────────────────────────────────────

function VideoPlayerModal({ url, onClose, topInset }: { url: string | null; onClose: () => void; topInset: number }) {
  const player = useVideoPlayer(url, (p) => {
    p.loop = false;
  });

  useEffect(() => {
    if (url) player.play();
  }, [url, player]);

  return (
    <Modal visible={url !== null} animationType="fade" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={styles.videoViewer}>
        <Pressable style={[styles.videoViewerClose, { top: topInset + 12 }]} onPress={onClose}>
          <Feather name="x" size={26} color="#fff" />
        </Pressable>
        <VideoView
          player={player}
          style={{ width: SCREEN_WIDTH, height: SCREEN_HEIGHT * 0.75 }}
          contentFit="contain"
          nativeControls
        />
      </View>
    </Modal>
  );
}

// ─── Posts Tab ────────────────────────────────────────────────────────────────

function PostsTab({
  posts, loading, onOpenPost,
}: {
  posts: FeedItem[];
  loading: boolean;
  onOpenPost: (item: FeedItem) => void;
}) {
  if (loading && posts.length === 0) {
    return <View style={styles.emptyTab}><ActivityIndicator color={colors.primary} /></View>;
  }
  if (!loading && posts.length === 0) {
    return (
      <View style={styles.emptyTab}>
        <Feather name="image" size={36} color={colors.textMuted} />
        <Text style={styles.emptyText}>No posts yet. Start sharing your workouts!</Text>
      </View>
    );
  }

  const rows: FeedItem[][] = [];
  for (let i = 0; i < posts.length; i += 3) rows.push(posts.slice(i, i + 3));

  return (
    <View style={styles.postsGrid}>
      {rows.map((row, ri) => (
        <View key={ri} style={styles.postsRow}>
          {row.map((item) => (
            <PostThumbnail key={item.id} item={item} onPress={() => onOpenPost(item)} />
          ))}
          {row.length < 3 && Array.from({ length: 3 - row.length }).map((_, i) => (
            <View key={`empty-${i}`} style={styles.thumbEmpty} />
          ))}
        </View>
      ))}
      {loading && posts.length > 0 && (
        <ActivityIndicator color={colors.primary} style={{ paddingVertical: spacing.md }} />
      )}
    </View>
  );
}

// ─── Post Thumbnail ───────────────────────────────────────────────────────────

function PostThumbnail({ item, onPress }: { item: FeedItem; onPress: () => void }) {
  return (
    <Pressable style={({ pressed }) => [styles.thumb, pressed && styles.thumbPressed]} onPress={onPress}>
      {item.photo_url ? (
        /* Photo post — show the actual image */
        <Image source={{ uri: item.photo_url }} style={styles.thumbImage} contentFit="cover" />
      ) : item.workout ? (
        /* Workout post — type badge + name + stats */
        <LinearGradient colors={['rgba(124,58,237,0.14)', 'rgba(6,182,212,0.14)']} style={styles.thumbContent}>
          <View style={styles.thumbBadge}>
            <Feather name="activity" size={10} color="#7c3aed" />
            <Text style={[styles.thumbBadgeText, { color: '#7c3aed' }]}>WORKOUT</Text>
          </View>
          <Text style={styles.thumbTitle} numberOfLines={2}>
            {item.workout_type ?? 'Workout'}
          </Text>
          <Text style={styles.thumbSub}>
            {item.workout.exercise_count} exercise{item.workout.exercise_count !== 1 ? 's' : ''}
          </Text>
        </LinearGradient>
      ) : item.personal_record ? (
        /* PR post — exercise + value */
        <LinearGradient colors={['rgba(16,185,129,0.14)', 'rgba(6,182,212,0.10)']} style={styles.thumbContent}>
          <View style={styles.thumbBadge}>
            <Feather name="award" size={10} color="#10b981" />
            <Text style={[styles.thumbBadgeText, { color: '#10b981' }]}>NEW PR</Text>
          </View>
          <Text style={styles.thumbTitle} numberOfLines={2}>
            {item.personal_record.exercise_name}
          </Text>
          <Text style={[styles.thumbSub, { color: '#10b981', fontWeight: '700' }]}>
            {item.personal_record.value} {item.personal_record.unit}
          </Text>
        </LinearGradient>
      ) : item.poll ? (
        /* Poll post — question text */
        <LinearGradient colors={['rgba(59,130,246,0.14)', 'rgba(124,58,237,0.10)']} style={styles.thumbContent}>
          <View style={styles.thumbBadge}>
            <Feather name="bar-chart-2" size={10} color="#3b82f6" />
            <Text style={[styles.thumbBadgeText, { color: '#3b82f6' }]}>POLL</Text>
          </View>
          <Text style={styles.thumbTitle} numberOfLines={3}>{item.poll.question}</Text>
        </LinearGradient>
      ) : item.description ? (
        /* Text / caption post — show the actual text */
        <View style={[styles.thumbContent, styles.thumbTextBg]}>
          <Text style={styles.thumbTextContent} numberOfLines={4}>{item.description}</Text>
        </View>
      ) : (
        /* Fallback */
        <LinearGradient colors={['rgba(124,58,237,0.10)', 'rgba(6,182,212,0.10)']} style={styles.thumbContent}>
          <Feather name="zap" size={20} color={colors.primary} />
        </LinearGradient>
      )}
    </Pressable>
  );
}

// ─── Calendar Tab ─────────────────────────────────────────────────────────────

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function CalendarTab({
  posts,
  postsLoading,
  onOpenPost,
}: {
  posts: FeedItem[];
  postsLoading: boolean;
  onOpenPost: (item: FeedItem) => void;
}) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  const workoutDays = new Set<number>();
  posts.forEach((p) => {
    const d = new Date(p.created_at);
    if (d.getFullYear() === year && d.getMonth() === month) {
      workoutDays.add(d.getDate());
    }
  });

  const selectedPosts = selectedDay !== null
    ? posts.filter((p) => {
        const d = new Date(p.created_at);
        return d.getFullYear() === year && d.getMonth() === month && d.getDate() === selectedDay;
      })
    : [];

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const prevMonth = () => {
    setSelectedDay(null);
    if (month === 0) { setMonth(11); setYear((y) => y - 1); }
    else setMonth((m) => m - 1);
  };
  const nextMonth = () => {
    setSelectedDay(null);
    if (month === 11) { setMonth(0); setYear((y) => y + 1); }
    else setMonth((m) => m + 1);
  };

  const handleDayPress = (day: number) => {
    if (workoutDays.has(day)) {
      setSelectedDay((prev) => (prev === day ? null : day));
    }
  };

  if (postsLoading) {
    return <View style={styles.emptyTab}><ActivityIndicator color={colors.primary} /></View>;
  }

  return (
    <View style={styles.calendarWrap}>
      <Text style={styles.calendarTitle}>📅 Workout Calendar</Text>
      <View style={styles.calendarCard}>
        <View style={styles.calNav}>
          <Pressable style={styles.calNavBtn} onPress={prevMonth}>
            <Feather name="chevron-left" size={18} color={colors.textSecondary} />
          </Pressable>
          <Text style={styles.calMonthLabel}>{MONTHS[month]} {year}</Text>
          <Pressable style={styles.calNavBtn} onPress={nextMonth}>
            <Feather name="chevron-right" size={18} color={colors.textSecondary} />
          </Pressable>
        </View>

        <View style={styles.calWeekdays}>
          {WEEKDAYS.map((d, i) => (
            <Text key={i} style={styles.calWeekday}>{d}</Text>
          ))}
        </View>

        <View style={styles.calDays}>
          {Array.from({ length: firstDay }).map((_, i) => (
            <View key={`e-${i}`} style={styles.calDay} />
          ))}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const hasWorkout = workoutDays.has(day);
            const isSelected = selectedDay === day;
            return (
              <Pressable
                key={day}
                style={[styles.calDay, hasWorkout && styles.calDayWorkout, isSelected && styles.calDaySelected]}
                onPress={() => handleDayPress(day)}
                disabled={!hasWorkout}
              >
                <Text style={[
                  styles.calDayText,
                  hasWorkout && styles.calDayTextWorkout,
                  isSelected && styles.calDayTextSelected,
                ]}>
                  {day}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Selected day posts */}
      {selectedDay !== null && selectedPosts.length > 0 && (
        <View style={styles.calDayPostsWrap}>
          <Text style={styles.calDayPostsTitle}>
            {MONTHS[month]} {selectedDay} — {selectedPosts.length} post{selectedPosts.length > 1 ? 's' : ''}
          </Text>
          {selectedPosts.map((item) => (
            <Pressable
              key={item.id}
              style={({ pressed }) => [styles.calPostRow, pressed && { opacity: 0.7 }]}
              onPress={() => onOpenPost(item)}
            >
              <View style={styles.calPostThumb}>
                {item.photo_url ? (
                  <Image source={{ uri: item.photo_url }} style={styles.calPostThumbImage} contentFit="cover" />
                ) : (
                  <Text style={styles.calPostThumbIcon}>
                    {item.workout ? '🏋️' : item.personal_record ? '🏆' : item.poll ? '📊' : '💬'}
                  </Text>
                )}
              </View>
              <View style={styles.calPostInfo}>
                <Text style={styles.calPostType}>
                  {item.workout ? 'Workout' : item.personal_record ? 'Personal Record' : item.poll ? 'Poll' : 'Post'}
                </Text>
                <Text style={styles.calPostDesc} numberOfLines={2}>
                  {item.workout
                    ? `${item.workout.exercise_count} exercises`
                    : item.personal_record
                    ? `${item.personal_record.exercise_name} — ${item.personal_record.value} ${item.personal_record.unit}`
                    : item.poll
                    ? item.poll.question
                    : item.description ?? ''}
                </Text>
              </View>
              <Feather name="chevron-right" size={16} color={colors.textMuted} />
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

// ─── Records Tab ──────────────────────────────────────────────────────────────

function RecordsTab({
  prs, loading, isOwn, onAdd, onDelete, onViewVideo,
}: {
  prs: PersonalRecord[];
  loading: boolean;
  isOwn: boolean;
  onAdd: () => void;
  onDelete: (pr: PersonalRecord) => void;
  onViewVideo: (url: string) => void;
}) {
  if (loading) {
    return <View style={styles.emptyTab}><ActivityIndicator color={colors.primary} /></View>;
  }

  return (
    <View style={styles.prWrap}>
      <View style={styles.prHeader}>
        <Text style={styles.prTitle}>🏆 Personal Records</Text>
        {isOwn && (
          <Pressable style={styles.addPrBtn} onPress={onAdd}>
            <Feather name="plus" size={16} color="#000" />
            <Text style={styles.addPrBtnText}>Add PR</Text>
          </Pressable>
        )}
      </View>

      {prs.length === 0 ? (
        <View style={styles.emptyTab}>
          <Feather name="award" size={36} color={colors.textMuted} />
          <Text style={styles.emptyText}>No personal records yet</Text>
          {isOwn && (
            <Pressable style={styles.addPrBtn} onPress={onAdd}>
              <Feather name="plus" size={16} color="#000" />
              <Text style={styles.addPrBtnText}>Add your first PR</Text>
            </Pressable>
          )}
        </View>
      ) : (
        <View style={styles.prGrid}>
          {prs.map((pr) => (
            <View key={pr.id} style={styles.prCard}>
              <View style={styles.prCardHeader}>
                <Text style={styles.prCardName} numberOfLines={1}>{pr.exercise_name}</Text>
                {isOwn && (
                  <Pressable onPress={() => onDelete(pr)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Feather name="trash-2" size={14} color={colors.textMuted} />
                  </Pressable>
                )}
              </View>
              <Text style={styles.prCardValue}>
                {pr.value} <Text style={styles.prCardUnit}>{pr.unit}</Text>
              </Text>
              {pr.video_url ? (
                <Pressable style={styles.prVerified} onPress={() => onViewVideo(pr.video_url!)}>
                  <Feather name="check-circle" size={12} color={colors.semantic.prGreen} />
                  <Text style={styles.prVerifiedText}>Verified · Tap to watch</Text>
                </Pressable>
              ) : (
                <Text style={styles.prUnverified}>Unverified</Text>
              )}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  center: {
    flex: 1,
    backgroundColor: colors.background.base,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.sm,
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: typography.size.base, fontWeight: '600', color: colors.textPrimary },

  profileHeader: {
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.base,
    gap: spacing.sm,
  },
  avatarWrap: {
    width: 86,
    height: 86,
    borderRadius: 43,
    borderWidth: 3,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  displayName: { fontSize: 22, fontWeight: '700', color: colors.textPrimary, textAlign: 'center' },
  streakInline: { fontSize: 18, fontWeight: '700', color: '#fb923c' },
  usernameText: { fontSize: typography.size.sm, color: colors.textMuted },
  bio: { fontSize: typography.size.sm, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 },

  socialStats: {
    flexDirection: 'row', gap: 32,
    paddingVertical: spacing.md,
    borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border.subtle,
    marginTop: spacing.sm, width: '100%', justifyContent: 'center',
  },
  socialStat: { alignItems: 'center' },
  socialStatValue: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  socialStatLabel: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  clickable: { color: colors.primary },

  metricCards: { flexDirection: 'row', gap: 8, width: '100%', marginTop: spacing.sm },
  metricCard: {
    flex: 1, backgroundColor: colors.background.elevated,
    borderRadius: 10, borderWidth: 1, borderColor: colors.border.subtle, padding: 12,
  },
  metricLabel: { fontSize: 10, color: colors.textMuted, marginBottom: 6 },
  metricValue: { fontSize: 22, fontWeight: '700', letterSpacing: -0.5 },

  actionRow: { flexDirection: 'row', gap: spacing.sm, width: '100%', marginTop: spacing.sm },
  actionBtn: {
    backgroundColor: colors.primary, borderRadius: 10,
    paddingHorizontal: spacing.xl, paddingVertical: spacing.sm + 2,
    alignItems: 'center', justifyContent: 'center', marginTop: spacing.sm,
  },
  actionBtnFlex: { flex: 1, marginTop: 0 },
  actionBtnOutline: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: colors.borderColor },
  actionBtnText: { fontSize: typography.size.sm, fontWeight: '600', color: colors.textOnPrimary },
  actionBtnTextOutline: { fontSize: typography.size.sm, fontWeight: '600', color: colors.textPrimary },

  tabBar: {
    flexDirection: 'row', backgroundColor: colors.surface, borderRadius: 12,
    padding: 4, marginHorizontal: spacing.xl, marginBottom: spacing.md,
    borderWidth: 1, borderColor: colors.border.default,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4 },
      android: { elevation: 1 },
    }),
  },
  tabBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8 },
  tabBtnActive: { backgroundColor: colors.primary },
  tabText: { fontSize: 13, fontWeight: '500', color: colors.textMuted },
  tabTextActive: { fontWeight: '600', color: '#000' },

  postsGrid: { paddingHorizontal: spacing.xl },
  postsRow: { flexDirection: 'row', gap: THUMB_GAP, marginBottom: THUMB_GAP },
  thumb: {
    width: THUMB_SIZE, height: THUMB_SIZE,
    backgroundColor: colors.background.elevated, borderRadius: 4,
    overflow: 'hidden', borderWidth: 1, borderColor: colors.border.subtle,
  },
  thumbPressed: { opacity: 0.75 },
  thumbEmpty: { width: THUMB_SIZE, height: THUMB_SIZE },
  thumbImage: { width: '100%', height: '100%' },
  thumbContent: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 6 },
  thumbBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 5 },
  thumbBadgeText: { fontSize: 7, fontWeight: '700', letterSpacing: 0.5 },
  thumbTitle: { fontSize: 10, fontWeight: '700', color: colors.textPrimary, textAlign: 'center', lineHeight: 13 },
  thumbSub: { fontSize: 9, color: colors.textMuted, marginTop: 2, textAlign: 'center' },
  thumbTextBg: { backgroundColor: colors.background.elevated },
  thumbTextContent: { fontSize: 9, color: colors.textPrimary, lineHeight: 12 },
  loadMoreBtn: { alignItems: 'center', paddingVertical: spacing.md },
  loadMoreText: { fontSize: typography.size.sm, color: colors.primary, fontWeight: '600' },

  emptyTab: { alignItems: 'center', gap: spacing.md, paddingTop: 48, paddingHorizontal: spacing.xl },
  emptyText: { fontSize: typography.size.base, color: colors.textMuted, textAlign: 'center' },

  calendarWrap: { paddingHorizontal: spacing.xl, paddingTop: spacing.sm },
  calendarTitle: { fontSize: 16, fontWeight: '600', color: colors.textPrimary, marginBottom: spacing.md },
  calendarCard: {
    backgroundColor: colors.surface, borderRadius: 16,
    borderWidth: 1, borderColor: colors.border.default, padding: spacing.base,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4 },
      android: { elevation: 1 },
    }),
  },
  calNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  calNavBtn: {
    width: 36, height: 36, backgroundColor: colors.background.elevated,
    borderRadius: 8, borderWidth: 1, borderColor: colors.border.subtle,
    alignItems: 'center', justifyContent: 'center',
  },
  calMonthLabel: { fontSize: 16, fontWeight: '600', color: colors.textPrimary },
  calWeekdays: { flexDirection: 'row', marginBottom: spacing.sm },
  calWeekday: { flex: 1, textAlign: 'center', fontSize: 12, fontWeight: '500', color: colors.textMuted, paddingVertical: 4 },
  calDays: { flexDirection: 'row', flexWrap: 'wrap' },
  calDay: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 6 },
  calDayWorkout: { backgroundColor: 'rgba(79,195,224,0.15)' },
  calDaySelected: { backgroundColor: colors.primary },
  calDayText: { fontSize: 13, fontWeight: '500', color: colors.textSecondary },
  calDayTextWorkout: { color: colors.primary, fontWeight: '700' },
  calDayTextSelected: { color: '#000', fontWeight: '700' },

  calDayPostsWrap: { marginTop: spacing.md },
  calDayPostsTitle: { fontSize: 14, fontWeight: '600', color: colors.textPrimary, marginBottom: spacing.sm },
  calPostRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.background.elevated, borderRadius: 12,
    borderWidth: 1, borderColor: colors.border.subtle,
    padding: spacing.md, marginBottom: 8,
  },
  calPostThumb: {
    width: 52, height: 52, borderRadius: 8,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border.subtle,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  calPostThumbImage: { width: 52, height: 52 },
  calPostThumbIcon: { fontSize: 22 },
  calPostInfo: { flex: 1 },
  calPostType: {
    fontSize: 11, fontWeight: '600', color: colors.primary,
    marginBottom: 2, textTransform: 'uppercase', letterSpacing: 0.5,
  },
  calPostDesc: { fontSize: 13, color: colors.textPrimary, lineHeight: 17 },

  prWrap: { paddingHorizontal: spacing.xl, paddingTop: spacing.sm },
  prHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  prTitle: { fontSize: 16, fontWeight: '600', color: colors.textPrimary },
  addPrBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.primary, borderRadius: 8,
    paddingHorizontal: spacing.md, paddingVertical: 6,
  },
  addPrBtnText: { fontSize: typography.size.sm, fontWeight: '600', color: '#000' },
  prGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  prCard: {
    width: '47%', backgroundColor: colors.background.elevated,
    borderRadius: 12, borderWidth: 1, borderColor: colors.border.subtle, padding: 12,
  },
  prCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  prCardName: { flex: 1, fontSize: typography.size.sm, fontWeight: '600', color: colors.textPrimary },
  prCardValue: { fontSize: 22, fontWeight: '700', color: colors.primary, letterSpacing: -0.5 },
  prCardUnit: { fontSize: 14, fontWeight: '500', color: colors.textSecondary },
  prVerified: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 4 },
  prVerifiedText: { fontSize: 10, color: colors.semantic.prGreen, fontWeight: '600' },
  prUnverified: { fontSize: 10, color: colors.textMuted, marginTop: 4 },

  viewerHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.base, paddingBottom: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border.subtle,
  },
  viewerUserRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  viewerName: { fontSize: typography.size.base, fontWeight: '600', color: colors.textPrimary },
  viewerClose: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  viewerScroll: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: 80 },

  prModal: { flex: 1, backgroundColor: colors.background.base, paddingHorizontal: spacing.xl },
  prModalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border.subtle,
    marginBottom: spacing.xl,
  },
  prModalTitle: { fontSize: typography.size.lg, fontWeight: '700', color: colors.textPrimary },
  prForm: { gap: spacing.md, paddingBottom: 40 },
  prFormLabel: { fontSize: typography.size.sm, fontWeight: '600', color: colors.textSecondary },
  prCatalogBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.background.elevated,
    borderRadius: 10, borderWidth: 1, borderColor: colors.border.default,
    paddingHorizontal: spacing.md, paddingVertical: 13,
  },
  prCatalogBtnText: { fontSize: typography.size.base, color: colors.textPrimary, flex: 1 },
  prCatalogPlaceholder: { color: colors.textMuted },
  prInput: {
    backgroundColor: colors.background.elevated,
    borderRadius: 10, borderWidth: 1, borderColor: colors.border.default,
    paddingHorizontal: spacing.md, paddingVertical: 12,
    fontSize: typography.size.base, color: colors.textPrimary,
  },
  unitRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  unitBtn: {
    paddingHorizontal: spacing.md, paddingVertical: 8,
    borderRadius: 8, borderWidth: 1, borderColor: colors.border.default,
    backgroundColor: colors.background.elevated,
  },
  unitBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  unitBtnText: { fontSize: typography.size.sm, fontWeight: '500', color: colors.textSecondary },
  unitBtnTextActive: { color: '#000', fontWeight: '600' },
  videoPickerBtn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.background.elevated,
    borderRadius: 10, borderWidth: 1, borderColor: colors.border.default,
    borderStyle: 'dashed',
    paddingHorizontal: spacing.md, paddingVertical: 13,
  },
  videoPickerText: { flex: 1, fontSize: typography.size.sm, color: colors.textSecondary },
  prSaveBtn: {
    backgroundColor: colors.primary, borderRadius: 10,
    paddingVertical: spacing.md, alignItems: 'center', marginTop: spacing.md,
  },
  prSaveBtnText: { fontSize: typography.size.base, fontWeight: '700', color: '#000' },

  catalogModal: { flex: 1, backgroundColor: colors.background.base, paddingHorizontal: spacing.xl },
  catalogSearchWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.background.elevated,
    borderRadius: 10, borderWidth: 1, borderColor: colors.border.default,
    paddingHorizontal: spacing.md, paddingVertical: 10, marginBottom: spacing.sm,
  },
  catalogSearchInput: { flex: 1, marginLeft: 8, fontSize: typography.size.base, color: colors.textPrimary },
  catalogCategoryScroll: { maxHeight: 44, marginBottom: spacing.sm },
  catalogCategoryContent: { flexDirection: 'row', gap: 8, paddingRight: spacing.xl },
  catalogChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    backgroundColor: colors.background.elevated,
    borderWidth: 1, borderColor: colors.border.default,
  },
  catalogChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  catalogChipText: { fontSize: 13, fontWeight: '500', color: colors.textSecondary },
  catalogChipTextActive: { color: '#000', fontWeight: '700' },
  catalogSectionHeader: {
    fontSize: 12, fontWeight: '700', color: colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.8,
    paddingTop: spacing.md, paddingBottom: 6,
  },
  catalogItem: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border.subtle,
  },
  catalogItemName: { fontSize: typography.size.base, fontWeight: '500', color: colors.textPrimary, flex: 1 },
  catalogItemMeta: { fontSize: typography.size.sm, color: colors.textMuted, marginTop: 2 },
  catalogEmpty: { alignItems: 'center', paddingTop: 40 },

  videoViewer: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  videoViewerClose: {
    position: 'absolute', right: 20, zIndex: 10,
    backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 20, padding: 6,
  },
});