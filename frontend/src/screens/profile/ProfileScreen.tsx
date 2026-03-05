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
  Animated,
  Share,
  Dimensions,
  Platform,
  Alert,
  TextInput,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { VideoView, useVideoPlayer } from 'expo-video';
import { pickMedia } from '../../utils/pickMedia';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { RouteProp } from '@react-navigation/native';
import Avatar from '../../components/common/Avatar';
import FeedCard from '../../components/feed/FeedCard';
import FeedCardHeader from '../../components/feed/FeedCardHeader';
import FeedCardBody from '../../components/feed/FeedCardBody';
import FeedCardActions from '../../components/feed/FeedCardActions';
import CommentsSheet from '../../components/comments/CommentsSheet';
import { useAuth } from '../../store/AuthContext';
import { fetchProfile, toggleFollow, fetchUserPRs, savePR, deletePR, fetchMutualFollowers, apiBlockToggle, apiRemoveFollower } from '../../api/accounts';
import ShareSheet from '../../components/feed/ShareSheet';
import { fetchExerciseCatalog, fetchUserAchievements } from '../../api/workouts';
import { fetchUserPostThumbnails, fetchUserPosts, fetchUserCheckins, toggleLikeCheckin, CheckinItem, deletePost } from '../../api/feed';
import CheckinViewer from '../../components/profile/CheckinViewer';
import { fetchMyGyms, fetchUserGyms } from '../../api/gyms';
import { listMyOrgs, fetchUserOrgs, OrgListItem } from '../../api/organizations';
import { useToggleLike } from '../../hooks/useToggleLike';
import { usePollVote } from '../../hooks/usePollVote';
import { UserProfile, PersonalRecord, UserBrief } from '../../types/user';
import { ExerciseCatalogItem, Achievement } from '../../types/workout';
import { FeedItem } from '../../types/feed';
import { Gym } from '../../types/gym';
import { colors, spacing, typography } from '../../theme';
import RNAnimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
  cancelAnimation,
} from 'react-native-reanimated';

type Props = {
  navigation: any;
  route: RouteProp<{ Profile: { username: string } }, 'Profile'>;
};

type ProfileTab = 'Posts' | 'Calendar' | 'Records';

type CalViewerDay = {
  year: number;
  month: number; // 0-indexed
  day: number;
  checkins: CheckinItem[];
};

const SCREEN_WIDTH = Dimensions.get('window').width;
const SCREEN_HEIGHT = Dimensions.get('window').height;
const GRID_PADDING = spacing.xl * 2;
const THUMB_GAP = 1;
const THUMB_SIZE = (SCREEN_WIDTH - GRID_PADDING - THUMB_GAP * 2) / 3;
const CAROUSEL_CARD_W = Math.round(SCREEN_WIDTH * 0.9);
const CAROUSEL_CARD_H = 400;
const CAROUSEL_GAP = 12;


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

  // Checkins (for story-ring viewer)
  const [checkins, setCheckins] = useState<CheckinItem[]>([]);
  const [checkinsHasMore, setCheckinsHasMore] = useState(false);
  const [checkinsCursor, setCheckinsCursor] = useState('');
  const checkinsLoadingRef = useRef(false);
  const [checkinViewerVisible, setCheckinViewerVisible] = useState(false);

  // Gyms + Orgs (profile user's data)
  const [gyms, setGyms] = useState<Gym[]>([]);
  const [orgs, setOrgs] = useState<OrgListItem[]>([]);

  // Calendar pre-load: keyed by "YYYY-M" (0-indexed month), fetched eagerly so dots appear instantly
  const [calPreloaded, setCalPreloaded] = useState<Record<string, CheckinItem[]>>({});

  // Achievements (own profile only)
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [selectedAchievement, setSelectedAchievement] = useState<Achievement | null>(null);

  // Mutual connections (non-own profile only)
  const [mutualFollowers, setMutualFollowers] = useState<UserBrief[]>([]);
  const [myGyms, setMyGyms] = useState<Gym[]>([]);
  const [myOrgs, setMyOrgs] = useState<OrgListItem[]>([]);
  const [mutualModalVisible, setMutualModalVisible] = useState(false);
  const [mutualSearch, setMutualSearch] = useState('');

  // 3-dot menu for other users
  const [menuVisible, setMenuVisible] = useState(false);
  const [blockLoading, setBlockLoading] = useState(false);
  const [shareProfileVisible, setShareProfileVisible] = useState(false);

  // View toggles
  const [showAllPRs, setShowAllPRs] = useState(false);
  const [allPostsModalVisible, setAllPostsModalVisible] = useState(false);
  const [viewerCommentItem, setViewerCommentItem] = useState<FeedItem | null>(null);
  const [allPostsCommentItem, setAllPostsCommentItem] = useState<FeedItem | null>(null);

  // Overlay slide animations (replaces Modal so tab bar stays visible)
  const viewerAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const allPostsAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const calViewerAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  // Calendar check-in viewer (floating card, tab-bar-visible overlay)
  const [calViewerVisible, setCalViewerVisible] = useState(false);
  const [calViewerDays, setCalViewerDays] = useState<CalViewerDay[]>([]);
  const [calViewerDayIdx, setCalViewerDayIdx] = useState(0);
  const [calLikeState, setCalLikeState] = useState<Record<string, { liked: boolean; count: number }>>({});
  const [calCheckinCommentItem, setCalCheckinCommentItem] = useState<FeedItem | null>(null);

  // Add PR modal
  const [prModalVisible, setPrModalVisible] = useState(false);
  const [editingPr, setEditingPr] = useState<PersonalRecord | null>(null);
  const [prExercise, setPrExercise] = useState('');
  const [prValue, setPrValue] = useState('');
  const [prUnit, setPrUnit] = useState('lbs');
  const [prVideoUri, setPrVideoUri] = useState<string | null>(null);
  const [prSaving, setPrSaving] = useState(false);

  // Exercise catalog picker — shown inline inside the PR modal
  const [catalogVisible, setCatalogVisible] = useState(false);
  const [catalogQuery, setCatalogQuery] = useState('');
  const [catalogCategory, setCatalogCategory] = useState('All');
  const [catalogAllItems, setCatalogAllItems] = useState<ExerciseCatalogItem[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const catalogSearchRef = useRef<TextInput>(null);

  const CATALOG_CATEGORIES = ['All', 'Back', 'Biceps', 'Chest', 'Core', 'Cardio', 'Legs', 'Shoulders', 'Triceps'];

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

  // Load gyms + orgs; for non-own profiles also load mutual connection data
  useEffect(() => {
    fetchUserAchievements(username).then(setAchievements).catch(() => {});
    // Pre-fetch current + previous 2 months in parallel so calendar dots appear instantly
    const now = new Date();
    const monthsToPreload = [0, 1, 2].map(offset => {
      const d = new Date(now.getFullYear(), now.getMonth() - offset, 1);
      return { year: d.getFullYear(), month: d.getMonth() }; // month is 0-indexed
    });
    Promise.all(
      monthsToPreload.map(({ year, month }) =>
        fetchUserCheckins(username, undefined, month + 1, year)
          .then(res => ({ key: `${year}-${month}`, items: res.items }))
          .catch(() => null)
      )
    ).then(results => {
      const map: Record<string, CheckinItem[]> = {};
      for (const r of results) {
        if (r) map[r.key] = r.items;
      }
      setCalPreloaded(map);
    });
    if (isOwn) {
      fetchMyGyms().then(setGyms).catch(() => {});
      listMyOrgs().then(setOrgs).catch(() => {});
    } else {
      fetchUserGyms(username).then(setGyms).catch(() => {});
      fetchUserOrgs(username).then(setOrgs).catch(() => {});
      fetchMutualFollowers(username).then(setMutualFollowers).catch(() => {});
      fetchMyGyms().then(setMyGyms).catch(() => {});
      listMyOrgs().then(setMyOrgs).catch(() => {});
    }
  }, [isOwn, username]);

  const mutualGyms = useMemo(() => {
    if (isOwn) return [];
    const myGymIds = new Set(myGyms.map(g => g.id));
    return gyms.filter(g => myGymIds.has(g.id));
  }, [isOwn, gyms, myGyms]);

  const mutualOrgs = useMemo(() => {
    if (isOwn) return [];
    const myOrgIds = new Set(myOrgs.map(o => o.id));
    return orgs.filter(o => myOrgIds.has(o.id));
  }, [isOwn, orgs, myOrgs]);

  const filteredMutualFollowers = useMemo(() => {
    if (!mutualSearch.trim()) return mutualFollowers;
    const q = mutualSearch.toLowerCase();
    return mutualFollowers.filter(u =>
      u.username.toLowerCase().includes(q) || u.display_name.toLowerCase().includes(q)
    );
  }, [mutualFollowers, mutualSearch]);

  // ── Load posts ────────────────────────────────────────────────────────────────

  const loadPosts = useCallback(async (cursor?: string) => {
    if (postsLoadingRef.current) return;
    postsLoadingRef.current = true;
    setPostsLoading(true);
    try {
      // Phase 1: fast thumbnails — grid shows immediately (~5 DB queries)
      let thumbResult: Awaited<ReturnType<typeof fetchUserPostThumbnails>> | null = null;
      try {
        thumbResult = await fetchUserPostThumbnails(username, cursor);
      } catch {
        // thumbnail endpoint unavailable — fall through to full load
      }

      if (thumbResult) {
        setPosts((prev) => {
          if (!cursor) return thumbResult!.items;
          const seen = new Set(prev.map((p) => p.id));
          return [...prev, ...thumbResult!.items.filter((p) => !seen.has(p.id))];
        });
        setPostsCursor(thumbResult.nextCursor);
        setPostsHasMore(!!thumbResult.nextCursor);
        postsLoadingRef.current = false;
        setPostsLoading(false);
        // Phase 2: full data in background — merges like/comment counts silently
        fetchUserPosts(username, cursor)
          .then((fullResult) => {
            const fullMap = new Map(fullResult.items.map((i) => [i.id, i]));
            setPosts((prev) => prev.map((p) => fullMap.get(p.id) ?? p));
          })
          .catch(() => {});
      } else {
        // Fallback: load full posts directly
        const result = await fetchUserPosts(username, cursor);
        setPosts((prev) => {
          if (!cursor) return result.items;
          const seen = new Set(prev.map((p) => p.id));
          return [...prev, ...result.items.filter((p) => !seen.has(p.id))];
        });
        setPostsCursor(result.nextCursor);
        setPostsHasMore(!!result.nextCursor);
        postsLoadingRef.current = false;
        setPostsLoading(false);
      }
    } catch {
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

  // ── Load checkins ─────────────────────────────────────────────────────────────

  const loadCheckins = useCallback(async (cursor?: string) => {
    if (checkinsLoadingRef.current) return;
    checkinsLoadingRef.current = true;
    try {
      const result = await fetchUserCheckins(username, cursor);
      setCheckins((prev) => {
        if (!cursor) return result.items;
        const seen = new Set(prev.map((c) => c.id));
        return [...prev, ...result.items.filter((c) => !seen.has(c.id))];
      });
      setCheckinsCursor(result.nextCursor);
      setCheckinsHasMore(!!result.nextCursor);
    } catch {
      // silently handle
    } finally {
      checkinsLoadingRef.current = false;
    }
  }, [username]);

  useEffect(() => {
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

  // Ref guard prevents spam-clicks racing through before state update commits
  const followLoadingRef = useRef(false);

  const handleFollow = async () => {
    if (!profile || followLoadingRef.current) return;
    followLoadingRef.current = true;
    setFollowLoading(true);
    // Optimistic update immediately so UI feels instant
    const prevFollowing = profile.is_following;
    const prevCount = profile.follower_count;
    setProfile((p) =>
      p ? { ...p, is_following: !prevFollowing, follower_count: prevCount + (prevFollowing ? -1 : 1) } : p,
    );
    try {
      await toggleFollow(username);
      // Optimistic state is already correct — no overwrite needed
    } catch {
      // Rollback on error
      setProfile((p) => p ? { ...p, is_following: prevFollowing, follower_count: prevCount } : p);
    } finally {
      followLoadingRef.current = false;
      setFollowLoading(false);
    }
  };

  // ── Block / Remove follower ───────────────────────────────────────────────────

  const handleBlock = async () => {
    if (!profile || blockLoading) return;
    setMenuVisible(false);
    Alert.alert(
      `Block @${profile.username}?`,
      'They won\'t be able to see your profile. This also removes the follow in both directions.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block',
          style: 'destructive',
          onPress: async () => {
            setBlockLoading(true);
            try {
              await apiBlockToggle(username);
              setProfile((p) => p ? { ...p, is_blocked: true, is_following: false, is_followed_by: false } : p);
            } catch (e: any) {
              const msg = e?.response?.data?.error || e?.response?.data?.detail || e?.message || 'Unknown error';
              Alert.alert('Block failed', msg);
            } finally {
              setBlockLoading(false);
            }
          },
        },
      ],
    );
  };

  const handleUnblock = async () => {
    if (!profile || blockLoading) return;
    setBlockLoading(true);
    try {
      await apiBlockToggle(username);
      setProfile((p) => p ? { ...p, is_blocked: false } : p);
    } catch {
      Alert.alert('Error', 'Could not unblock this user. Please try again.');
    } finally {
      setBlockLoading(false);
    }
  };

  const handleRemoveFollower = async () => {
    if (!profile) return;
    setMenuVisible(false);
    Alert.alert(
      `Remove @${profile.username}?`,
      'They will no longer follow you. They won\'t be notified.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await apiRemoveFollower(username);
              setProfile((p) => p ? { ...p, is_followed_by: false, following_count: Math.max(0, (p.following_count ?? 1) - 1) } : p);
            } catch {
              Alert.alert('Error', 'Could not remove follower. Please try again.');
            }
          },
        },
      ],
    );
  };

  const handleShareNative = () => {
    setMenuVisible(false);
    // Wait for modal dismiss animation before opening native share sheet
    setTimeout(async () => {
      try {
        await Share.share({ message: `Check out @${username} on Spottr!` });
      } catch {
        // dismissed
      }
    }, 350);
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

  useEffect(() => {
    Animated.timing(viewerAnim, {
      toValue: viewerStartIndex !== null ? 0 : SCREEN_HEIGHT,
      duration: 280,
      useNativeDriver: true,
    }).start();
  }, [viewerStartIndex]);

  useEffect(() => {
    Animated.timing(allPostsAnim, {
      toValue: allPostsModalVisible ? 0 : SCREEN_HEIGHT,
      duration: 280,
      useNativeDriver: true,
    }).start();
  }, [allPostsModalVisible]);

  useEffect(() => {
    Animated.timing(calViewerAnim, {
      toValue: calViewerVisible ? 0 : SCREEN_HEIGHT,
      duration: 260,
      useNativeDriver: true,
    }).start();
  }, [calViewerVisible]);

  // ── Video picker ──────────────────────────────────────────────────────────────

  const pickVideo = async () => {
    const picked = await pickMedia({ allowsMultiple: false, maxVideoBytes: 50 * 1024 * 1024, mediaTypes: ['videos'] });
    if (picked?.[0]?.kind === 'video') {
      setPrVideoUri(picked[0].uri);
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
        prId: editingPr?.id,
      });
      setPrs((prev) => {
        const idx = editingPr
          ? prev.findIndex((p) => p.id === editingPr.id)
          : prev.findIndex((p) => p.exercise_name.toLowerCase() === saved.exercise_name.toLowerCase());
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = saved;
          return next;
        }
        return [saved, ...prev];
      });
      const hadVideo = !!prVideoUri;
      closePrModal();
      if (hadVideo) {
        Alert.alert('Video uploaded', 'Your video was uploaded successfully!');
      }
    } catch {
      Alert.alert('Error', 'Could not save PR. Please try again.');
    } finally {
      setPrSaving(false);
    }
  };

  const closePrModal = () => {
    setPrModalVisible(false);
    setEditingPr(null);
    setPrExercise('');
    setPrValue('');
    setPrUnit('lbs');
    setPrVideoUri(null);
  };

  const handleEditPR = (pr: PersonalRecord) => {
    setEditingPr(pr);
    setPrExercise(pr.exercise_name);
    setPrValue(String(pr.value));
    setPrUnit(pr.unit);
    setPrVideoUri(null); // new video upload; existing video shown via pr.video_url
    setPrModalVisible(true);
  };

  const handleDeletePost = useCallback(async (item: FeedItem) => {
    try {
      await deletePost(item.id);
      setPosts((prev) => prev.filter((p) => p.id !== item.id));
    } catch {
      Alert.alert('Error', 'Could not delete post.');
    }
  }, []);

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

  // ── Calendar viewer: cross-month lazy loading ────────────────────────────────

  const calViewerLoadedMonths = useRef<Set<string>>(new Set());

  const loadAdjacentCalMonth = useCallback(async (year: number, month: number) => {
    const key = `${year}-${month}`;
    if (calViewerLoadedMonths.current.has(key)) return;
    calViewerLoadedMonths.current.add(key);
    try {
      const { items } = await fetchUserCheckins(username, undefined, month + 1, year);
      if (items.length === 0) return;
      const grouped: Record<string, CalViewerDay> = {};
      items.forEach((ci) => {
        const d = new Date(ci.created_at);
        const k = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
        if (!grouped[k]) grouped[k] = { year: d.getFullYear(), month: d.getMonth(), day: d.getDate(), checkins: [] };
        grouped[k].checkins.push(ci);
      });
      const newDays = Object.values(grouped).sort(
        (a, b) => new Date(a.year, a.month, a.day).getTime() - new Date(b.year, b.month, b.day).getTime(),
      );
      setCalViewerDays((prev) => {
        const existingKeys = new Set(prev.map((d) => `${d.year}-${d.month}-${d.day}`));
        const trulyNew = newDays.filter((d) => !existingKeys.has(`${d.year}-${d.month}-${d.day}`));
        if (trulyNew.length === 0) return prev;
        return [...prev, ...trulyNew].sort(
          (a, b) => new Date(a.year, a.month, a.day).getTime() - new Date(b.year, b.month, b.day).getTime(),
        );
      });
    } catch { /* silent */ }
  }, [username]);

  // Load adjacent months when near the edges of loaded data
  useEffect(() => {
    if (!calViewerVisible || calViewerDays.length === 0) return;
    if (calViewerDayIdx <= 3) {
      const first = calViewerDays[0];
      loadAdjacentCalMonth(
        first.month === 0 ? first.year - 1 : first.year,
        first.month === 0 ? 11 : first.month - 1,
      );
    }
    if (calViewerDayIdx >= calViewerDays.length - 4) {
      const last = calViewerDays[calViewerDays.length - 1];
      loadAdjacentCalMonth(
        last.month === 11 ? last.year + 1 : last.year,
        last.month === 11 ? 0 : last.month + 1,
      );
    }
  }, [calViewerDayIdx, calViewerVisible, calViewerDays, loadAdjacentCalMonth]);

  // ── Calendar viewer handlers ──────────────────────────────────────────────────

  const handleCalLike = useCallback(async (checkin: CheckinItem) => {
    const prev = calLikeState[checkin.id] ?? { liked: checkin.user_liked, count: checkin.like_count };
    setCalLikeState((s) => ({ ...s, [checkin.id]: { liked: !prev.liked, count: prev.count + (prev.liked ? -1 : 1) } }));
    try {
      const res = await toggleLikeCheckin(checkin.id);
      setCalLikeState((s) => ({ ...s, [checkin.id]: { liked: res.liked, count: res.like_count } }));
    } catch {
      setCalLikeState((s) => ({ ...s, [checkin.id]: prev }));
    }
  }, [calLikeState]);

  const handleCalComment = useCallback((checkin: CheckinItem) => {
    if (!profile) return;
    setCalCheckinCommentItem({
      id: checkin.id, type: 'checkin',
      user: { id: profile.id, username: profile.username, display_name: profile.display_name, avatar_url: profile.avatar_url },
      created_at: checkin.created_at, description: checkin.description,
      location_name: checkin.location_name || null, photo_url: checkin.photo_url,
      link_url: null, like_count: checkin.like_count, comment_count: checkin.comment_count,
      user_liked: checkin.user_liked, workout: null, personal_record: null, poll: null, visibility: 'main',
    });
  }, [profile]);

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

  const switchTab = (tab: ProfileTab) => {
    setActiveTab(tab);
    setShowAllPRs(false);
  };

  // Enrich posts with profile data so Phase-1 thumbnails never show a blank avatar
  const enrichedPosts = useMemo(() => {
    if (!profile) return posts;
    return posts.map((item) => ({
      ...item,
      user: {
        ...item.user,
        avatar_url: item.user.avatar_url ?? profile.avatar_url,
        display_name: item.user.display_name || profile.display_name,
        username: item.user.username || profile.username,
      },
    }));
  }, [posts, profile]);

  // Today's check-ins only — passed to the stories ring viewer
  const todayCheckins = useMemo(() => {
    const now = new Date();
    return checkins.filter((c) => {
      const d = new Date(c.created_at);
      return d.getFullYear() === now.getFullYear() &&
        d.getMonth() === now.getMonth() &&
        d.getDate() === now.getDate();
    });
  }, [checkins]);

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
          <Pressable onPress={() => navigation.navigate('EditProfile', { bio: profile.bio, display_name: profile.display_name })} style={styles.iconBtn}>
            <Feather name="settings" size={20} color={colors.textPrimary} />
          </Pressable>
        ) : (
          <Pressable onPress={() => setMenuVisible(true)} style={styles.iconBtn}>
            <Feather name="more-vertical" size={20} color={colors.textPrimary} />
          </Pressable>
        )}
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              const reloadPrs = prsLoaded.current;
              postsLoaded.current = true;
              prsLoaded.current = reloadPrs;
              setPosts([]);
              setPrs([]);
              setCheckins([]);
              setCheckinsCursor('');
              setCheckinsHasMore(false);
              setShowAllPRs(false);
              load();
              loadPosts();
              if (reloadPrs) loadPRs();
              if (isOwn) {
                fetchMyGyms().then(setGyms).catch(() => {});
                listMyOrgs().then(setOrgs).catch(() => {});
              }
            }}
            tintColor={colors.primary}
          />
        }
        showsVerticalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={400}
      >
        {/* ── Instagram-style summary row ─────────────────────────────────────── */}
        <View style={styles.summaryRow}>
          <Pressable
            style={[
              styles.avatarWrap,
              { borderColor: profile.has_checkin_today ? colors.primary : '#555' },
            ]}
            onPress={() => {
              // Only block if we know for certain they have no check-in today
              if (profile.has_checkin_today === false) return;
              if (checkins.length === 0 && !checkinsLoadingRef.current) loadCheckins();
              setCheckinViewerVisible(true);
            }}
          >
            <Avatar uri={profile.avatar_url} name={profile.display_name} size={76} />
          </Pressable>
          <View style={styles.summaryStats}>
            <View style={styles.summaryStatItem}>
              <Text style={styles.summaryStatValue}>{profile.total_workouts}</Text>
              <Text style={styles.summaryStatLabel}>Workouts</Text>
            </View>
            <Pressable style={styles.summaryStatItem} onPress={() => goToList('following')}>
              <Text style={styles.summaryStatValue}>{profile.following_count}</Text>
              <Text style={[styles.summaryStatLabel, styles.clickable]}>Following</Text>
            </Pressable>
            <Pressable style={styles.summaryStatItem} onPress={() => goToList('followers')}>
              <Text style={styles.summaryStatValue}>{profile.follower_count}</Text>
              <Text style={[styles.summaryStatLabel, styles.clickable]}>Followers</Text>
            </Pressable>
          </View>
        </View>

        {/* ── Name, username, bio ──────────────────────────────────────────────── */}
        <View style={styles.nameBlock}>
          <Text style={styles.displayName}>
            {profile.display_name}
            {currentStreak > 0
              ? <Text style={styles.streakInline}> 🔥{currentStreak}</Text>
              : null}
          </Text>
          <Text style={styles.usernameText}>@{profile.username}</Text>
          {profile.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}
        </View>

        {/* ── Blocked overlay (when I've blocked this user) ───────────────────── */}
        {profile.is_blocked ? (
          <View style={styles.blockedCard}>
            <Feather name="slash" size={36} color={colors.textMuted} style={{ marginBottom: spacing.md }} />
            <Text style={styles.blockedTitle}>You've blocked this user</Text>
            <Text style={styles.blockedSub}>Unblock to see their profile and posts.</Text>
            <Pressable
              style={[styles.actionBtn, { marginTop: spacing.lg, alignSelf: 'center', paddingHorizontal: spacing.xl }]}
              onPress={handleUnblock}
              disabled={blockLoading}
            >
              {blockLoading
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={styles.actionBtnText}>Unblock</Text>}
            </Pressable>
          </View>
        ) : (
          <>
        {/* ── Mutual connections (other profiles only) ─────────────────────────── */}
        {!isOwn && mutualFollowers.length > 0 && (
          <MutualConnectionsSection
            mutualFollowers={mutualFollowers}
            onShowFollowers={() => setMutualModalVisible(true)}
          />
        )}

        {/* ── Stats chips ──────────────────────────────────────────────────────── */}
        <View style={styles.chipRow}>
          <Pressable style={styles.statChip} onPress={() => navigation.navigate('StreakDetails')}>
            <Text style={styles.chipEmoji}>🔥</Text>
            <Text style={styles.chipVal}>{profile.longest_streak}</Text>
            <Text style={styles.chipLbl}> longest streak</Text>
          </Pressable>
          <Pressable style={styles.statChip} onPress={() => goToList('friends')}>
            <Text style={styles.chipEmoji}>👥</Text>
            <Text style={styles.chipVal}>{profile.friend_count ?? 0}</Text>
            <Text style={styles.chipLbl}> friends</Text>
          </Pressable>
        </View>

        {/* ── Action buttons (other users only) ───────────────────────────────── */}
        {!isOwn && (
          <View style={styles.actionRow}>
            <Pressable
              style={[styles.actionBtn, styles.actionBtnFlex, profile.is_following && styles.actionBtnOutline]}
              onPress={handleFollow}
            >
              <Text style={[styles.actionBtnText, profile.is_following && styles.actionBtnTextOutline]}>
                {profile.is_following ? 'Following' : 'Follow'}
              </Text>
            </Pressable>
            {profile.is_following && profile.is_followed_by && (
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
            )}
          </View>
        )}

        {/* ── Tab bar ──────────────────────────────────────────────────────────── */}
        <View style={styles.tabBar}>
          {(['Posts', 'Calendar', 'Records'] as ProfileTab[]).map((tab) => (
            <Pressable
              key={tab}
              style={[styles.tabBtn, activeTab === tab && styles.tabBtnActive]}
              onPress={() => switchTab(tab)}
            >
              <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>{tab}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.tabContent}>
          {activeTab === 'Posts' && (
            <PostsTab
              posts={enrichedPosts}
              loading={postsLoading}
              isOwn={isOwn}
              onOpenPost={openPost}
              onViewAllPosts={() => setAllPostsModalVisible(true)}
              onLike={handleLike}
              onComment={(item) => setCommentItem(item)}
              onPollVote={handlePollVote}
              onDelete={isOwn ? handleDeletePost : undefined}
            />
          )}

          {activeTab === 'Calendar' && (
            <CalendarTab
              profileUsername={username}
              preloadedMonths={calPreloaded}
              onOpenViewer={(days, index) => {
                // Seed loaded-months so we don't re-fetch what CalendarTab already loaded
                calViewerLoadedMonths.current.clear();
                days.forEach((d) => calViewerLoadedMonths.current.add(`${d.year}-${d.month}`));
                setCalViewerDays(days);
                setCalViewerDayIdx(index);
                setCalLikeState({});
                setCalViewerVisible(true);
              }}
            />
          )}

          {activeTab === 'Records' && (
            <RecordsTab
              prs={prs}
              loading={prsLoading}
              isOwn={isOwn}
              onAdd={() => setPrModalVisible(true)}
              onEdit={handleEditPR}
              onDelete={handleDeletePR}
              onViewVideo={(url) => setVideoViewerUrl(url)}
              showAll={showAllPRs}
              onToggleShowAll={setShowAllPRs}
            />
          )}
        </View>

        {/* ── Gyms section ─────────────────────────────────────────────────────── */}
        <GymsSection gyms={gyms} isOwn={isOwn} navigation={navigation} />

        {/* ── Orgs section ──────────────────────────────────────────────────────── */}
        <OrgsSection orgs={orgs} isOwn={isOwn} navigation={navigation} />

        {/* ── Achievements section ──────────────────────────────────────────────── */}
        {achievements.length > 0 && (
          <AchievementsSection achievements={achievements} onSelect={setSelectedAchievement} />
        )}

        {/* ── In common (non-own profiles only) ────────────────────────────────── */}
        {!isOwn && (mutualGyms.length > 0 || mutualOrgs.length > 0) && (
          <InCommonSection mutualGyms={mutualGyms} mutualOrgs={mutualOrgs} navigation={navigation} />
        )}
          </>
        )}
      </ScrollView>

      {/* ── Achievement detail modal ────────────────────────────────────────── */}
      <AchievementModal achievement={selectedAchievement} onClose={() => setSelectedAchievement(null)} />

      {/* ── 3-dot action menu (other users) ──────────────────────────────────── */}
      <Modal
        visible={menuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuVisible(false)}
      >
        <Pressable style={styles.menuBackdrop} onPress={() => setMenuVisible(false)}>
          <View style={[styles.menuSheet, { paddingBottom: insets.bottom + 8 }]}>
            <View style={styles.menuHandle} />
            {profile.is_followed_by && (
              <Pressable style={styles.menuItem} onPress={handleRemoveFollower}>
                <Feather name="user-x" size={20} color={colors.textPrimary} />
                <Text style={styles.menuItemText}>Remove as Follower</Text>
              </Pressable>
            )}
            {profile.is_blocked ? (
              <Pressable style={styles.menuItem} onPress={() => { setMenuVisible(false); handleUnblock(); }}>
                <Feather name="user-check" size={20} color={colors.textPrimary} />
                <Text style={styles.menuItemText}>Unblock</Text>
              </Pressable>
            ) : (
              <Pressable style={styles.menuItem} onPress={handleBlock}>
                <Feather name="slash" size={20} color={colors.error} />
                <Text style={[styles.menuItemText, { color: colors.error }]}>Block</Text>
              </Pressable>
            )}
            <View style={styles.menuDivider} />
            <Pressable style={styles.menuItem} onPress={() => { setMenuVisible(false); setShareProfileVisible(true); }}>
              <Feather name="send" size={20} color={colors.textPrimary} />
              <Text style={styles.menuItemText}>Share via Messages</Text>
            </Pressable>
            <Pressable style={styles.menuItem} onPress={handleShareNative}>
              <Feather name="share" size={20} color={colors.textPrimary} />
              <Text style={styles.menuItemText}>Share via...</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      {/* ── Profile ShareSheet ────────────────────────────────────────────────── */}
      <ShareSheet
        item={null}
        profileUsername={shareProfileVisible ? username : undefined}
        onClose={() => setShareProfileVisible(false)}
      />

      {/* ── Mutual followers modal ───────────────────────────────────────────── */}
      <Modal
        visible={mutualModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => { setMutualModalVisible(false); setMutualSearch(''); }}
      >
        <View style={{ flex: 1, backgroundColor: colors.background.base }}>
          <View style={[styles.mutualModalHeader, { paddingTop: insets.top > 0 ? insets.top : 16 }]}>
            <Text style={styles.mutualModalTitle}>Mutual Followers</Text>
            <Pressable onPress={() => { setMutualModalVisible(false); setMutualSearch(''); }} style={styles.mutualModalClose}>
              <Feather name="x" size={22} color={colors.textPrimary} />
            </Pressable>
          </View>
          <View style={styles.mutualSearchWrap}>
            <Feather name="search" size={15} color={colors.textMuted} />
            <TextInput
              style={styles.mutualSearchInput}
              placeholder="Search"
              placeholderTextColor={colors.textMuted}
              value={mutualSearch}
              onChangeText={setMutualSearch}
              autoCapitalize="none"
              returnKeyType="search"
            />
            {mutualSearch.length > 0 && (
              <Pressable onPress={() => setMutualSearch('')}>
                <Feather name="x-circle" size={15} color={colors.textMuted} />
              </Pressable>
            )}
          </View>
          <FlatList
            data={filteredMutualFollowers}
            keyExtractor={u => u.id}
            contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
            ListEmptyComponent={
              <View style={styles.mutualEmpty}>
                <Text style={styles.mutualEmptyText}>No mutual followers found</Text>
              </View>
            }
            renderItem={({ item }) => (
              <Pressable
                style={({ pressed }) => [styles.mutualUserRow, pressed && { opacity: 0.7 }]}
                onPress={() => {
                  setMutualModalVisible(false);
                  setMutualSearch('');
                  navigation.navigate('Profile', { username: item.username });
                }}
              >
                <Avatar uri={item.avatar_url ?? null} name={item.display_name} size={42} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.mutualUserName}>{item.display_name}</Text>
                  <Text style={styles.mutualUserHandle}>@{item.username}</Text>
                </View>
                <Feather name="chevron-right" size={16} color={colors.textMuted} />
              </Pressable>
            )}
          />
        </View>
      </Modal>

      {/* ── Post viewer overlay (tab bar stays visible) ───────────────────── */}
      <Animated.View
        style={[StyleSheet.absoluteFill, { backgroundColor: colors.background.base, transform: [{ translateY: viewerAnim }] }]}
        pointerEvents={viewerStartIndex !== null ? 'auto' : 'none'}
      >
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
          data={viewerStartIndex !== null ? enrichedPosts.slice(viewerStartIndex) : enrichedPosts}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 80 }}
          onEndReached={() => { if (postsHasMore && !postsLoadingRef.current) loadPosts(postsCursor); }}
          onEndReachedThreshold={0.4}
          ListFooterComponent={postsHasMore ? (
            <View style={styles.feedFooter}>
              <ActivityIndicator size="small" color={colors.primary} />
            </View>
          ) : null}
          renderItem={({ item }) => (
            <FeedCard
              item={item}
              index={0}
              onLike={() => handleLike(item)}
              onComment={() => setViewerCommentItem(item)}
              onPollVote={(optionId) => handlePollVote(item, optionId)}
              onDelete={isOwn ? () => handleDeletePost(item) : undefined}
            />
          )}
        />
        <CommentsSheet item={viewerCommentItem} onClose={() => setViewerCommentItem(null)} />
      </Animated.View>
      <CommentsSheet item={commentItem} onClose={() => setCommentItem(null)} />

      <CheckinViewer
        visible={checkinViewerVisible}
        checkins={todayCheckins}
        onClose={() => setCheckinViewerVisible(false)}
      />

      {/* ── All Posts feed overlay (tab bar stays visible) ─────────────── */}
      <Animated.View
        style={[StyleSheet.absoluteFill, { backgroundColor: colors.background.base, transform: [{ translateY: allPostsAnim }] }]}
        pointerEvents={allPostsModalVisible ? 'auto' : 'none'}
      >
        <View style={[styles.viewerHeader, { paddingTop: insets.top > 0 ? insets.top : 16 }]}>
          <View style={{ width: 36 }} />
          <View style={styles.viewerUserRow}>
            <Avatar uri={profile.avatar_url} name={profile.display_name} size={32} />
            <Text style={styles.viewerName}>{profile.display_name}</Text>
          </View>
          <Pressable style={styles.viewerClose} onPress={() => setAllPostsModalVisible(false)}>
            <Feather name="x" size={22} color={colors.textPrimary} />
          </Pressable>
        </View>

        <FlatList
          data={enrichedPosts.slice(5)}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 80 }}
          onEndReached={() => { if (postsHasMore && !postsLoadingRef.current) loadPosts(postsCursor); }}
          onEndReachedThreshold={0.4}
          ListFooterComponent={postsHasMore ? (
            <View style={styles.feedFooter}>
              <ActivityIndicator size="small" color={colors.primary} />
            </View>
          ) : null}
          ListEmptyComponent={
            <View style={styles.emptyTab}>
              <Feather name="image" size={36} color={colors.textMuted} />
              <Text style={styles.emptyText}>No more posts</Text>
            </View>
          }
          renderItem={({ item }) => (
            <FeedCard
              item={item}
              index={0}
              onLike={() => handleLike(item)}
              onComment={() => setAllPostsCommentItem(item)}
              onPollVote={(optionId) => handlePollVote(item, optionId)}
              onDelete={isOwn ? () => handleDeletePost(item) : undefined}
            />
          )}
        />
        <CommentsSheet item={allPostsCommentItem} onClose={() => setAllPostsCommentItem(null)} />
      </Animated.View>

      {/* ── Calendar check-in viewer (FlatList pager, tab bar stays visible) ── */}
      <Animated.View
        style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.88)', transform: [{ translateY: calViewerAnim }] }]}
        pointerEvents={calViewerVisible ? 'auto' : 'none'}
      >
        {calViewerDays.length > 0 && (
          <CalViewerFlatList
            days={calViewerDays}
            initialDayIdx={calViewerDayIdx}
            likeState={calLikeState}
            onClose={() => setCalViewerVisible(false)}
            onDayChange={(idx) => setCalViewerDayIdx(idx)}
            onLike={handleCalLike}
            onComment={handleCalComment}
          />
        )}

        <CommentsSheet item={calCheckinCommentItem} onClose={() => setCalCheckinCommentItem(null)} />
      </Animated.View>

      {/* ── Add PR modal (with inline catalog picker) ── */}
      <Modal
        visible={prModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => {
          if (catalogVisible) { setCatalogVisible(false); setCatalogQuery(''); }
          else closePrModal();
        }}
      >
        <View style={[styles.prModal, { paddingTop: insets.top > 0 ? insets.top : 20 }]}>
          {/* ── Catalog search view ── */}
          {catalogVisible ? (
            <>
              <View style={styles.prModalHeader}>
                <Pressable onPress={() => { setCatalogVisible(false); setCatalogQuery(''); setCatalogCategory('All'); }} style={styles.iconBtn}>
                  <Feather name="arrow-left" size={20} color={colors.textPrimary} />
                </Pressable>
                <Text style={styles.prModalTitle}>Select Exercise</Text>
                <View style={{ width: 40 }} />
              </View>

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
                <Text style={styles.prModalTitle}>{editingPr ? 'Edit PR' : 'Add Personal Record'}</Text>
                <Pressable onPress={closePrModal}>
                  <Feather name="x" size={22} color={colors.textPrimary} />
                </Pressable>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <View style={styles.prForm}>
                  <Text style={styles.prFormLabel}>Exercise</Text>
                  {editingPr ? (
                    <View style={[styles.prCatalogBtn, { opacity: 0.7 }]}>
                      <Text style={styles.prCatalogBtnText}>{prExercise}</Text>
                      <Feather name="lock" size={14} color={colors.textMuted} />
                    </View>
                  ) : (
                    <Pressable style={styles.prCatalogBtn} onPress={() => setCatalogVisible(true)}>
                      <Text style={[styles.prCatalogBtnText, !prExercise && styles.prCatalogPlaceholder]}>
                        {prExercise || 'Select from exercise catalog…'}
                      </Text>
                      <Feather name="search" size={16} color={colors.textMuted} />
                    </Pressable>
                  )}

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
                      {prVideoUri
                        ? '✓ New video selected'
                        : editingPr?.video_url
                        ? '✓ Video already attached — tap to replace'
                        : 'Attach video to verify PR'}
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

// ─── Mutual Connections Section ───────────────────────────────────────────────

function MutualConnectionsSection({
  mutualFollowers, onShowFollowers,
}: {
  mutualFollowers: UserBrief[];
  onShowFollowers: () => void;
}) {
  const [first, second] = mutualFollowers;
  const followerLabel =
    mutualFollowers.length === 1 ? first.display_name :
    mutualFollowers.length === 2 ? `${first.display_name} and ${second.display_name}` :
    `${first.display_name}, ${second.display_name} and ${mutualFollowers.length - 2} more`;

  return (
    <View style={styles.mutualSection}>
      <Pressable
        style={({ pressed }) => [styles.mutualFollowedRow, pressed && { opacity: 0.7 }]}
        onPress={onShowFollowers}
      >
        <View style={styles.mutualAvatarStack}>
          {mutualFollowers.slice(0, 3).map((u, i) => (
            <View key={u.id} style={[styles.mutualAvatarWrap, { marginLeft: i === 0 ? 0 : -8, zIndex: 3 - i }]}>
              <Avatar uri={u.avatar_url ?? null} name={u.display_name} size={22} />
            </View>
          ))}
        </View>
        <Text style={styles.mutualFollowedText} numberOfLines={1}>
          <Text style={styles.mutualFollowedLabel}>Followed by </Text>
          {followerLabel}
        </Text>
        <Feather name="chevron-right" size={13} color={colors.textMuted} />
      </Pressable>
    </View>
  );
}

function InCommonSection({ mutualGyms, mutualOrgs, navigation }: { mutualGyms: Gym[]; mutualOrgs: OrgListItem[]; navigation: any }) {
  return (
    <View style={styles.experienceSection}>
      <View style={styles.experienceSectionHeader}>
        <Feather name="link" size={15} color={colors.textSecondary} />
        <Text style={styles.experienceSectionTitle}>In Common</Text>
      </View>
      <View style={styles.mutualInCommonRow}>
        <View style={styles.mutualChips}>
          {mutualGyms.map(g => (
            <Pressable
              key={g.id}
              style={({ pressed }) => [styles.mutualChip, pressed && { opacity: 0.7 }]}
              onPress={() => navigation.navigate('MainTabs', { screen: 'Gyms', params: { screen: 'GymDetail', params: { gymId: g.id, gymName: g.name } } })}
            >
              <Text style={styles.mutualChipIcon}>🏋️</Text>
              <Text style={styles.mutualChipText} numberOfLines={1}>{g.name}</Text>
            </Pressable>
          ))}
          {mutualOrgs.map(o => (
            <Pressable
              key={o.id}
              style={({ pressed }) => [styles.mutualChip, pressed && { opacity: 0.7 }]}
              onPress={() => navigation.navigate('OrgProfile', { orgId: o.id })}
            >
              <Text style={styles.mutualChipIcon}>🏢</Text>
              <Text style={styles.mutualChipText} numberOfLines={1}>{o.name}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
}

// ─── Gyms Section (LinkedIn-style) ───────────────────────────────────────────

function GymsSection({ gyms, isOwn, navigation }: { gyms: Gym[]; isOwn: boolean; navigation: any }) {
  const [showAll, setShowAll] = React.useState(false);
  const visible = showAll ? gyms : gyms.slice(0, 3);
  return (
    <View style={styles.experienceSection}>
      <View style={styles.experienceSectionHeader}>
        <Feather name="map-pin" size={15} color={colors.textSecondary} />
        <Text style={styles.experienceSectionTitle}>Gyms</Text>
      </View>
      {gyms.length === 0 ? (
        isOwn ? (
          <Pressable
            style={({ pressed }) => [styles.experienceEmptyCTA, pressed && { opacity: 0.7 }]}
            onPress={() => navigation.navigate('MainTabs', { screen: 'Gyms', params: { screen: 'GymList' } })}
          >
            <Feather name="plus-circle" size={15} color={colors.primary} />
            <Text style={styles.experienceEmptyCTAText}>Enroll in a gym</Text>
            <Feather name="chevron-right" size={14} color={colors.primary} />
          </Pressable>
        ) : (
          <Text style={styles.experienceEmptyText}>Not enrolled in any gyms</Text>
        )
      ) : (
        <>
          {visible.map((gym, index) => (
            <Pressable
              key={gym.id}
              style={({ pressed }) => [
                styles.experienceItem,
                index < visible.length - 1 && styles.experienceItemBorder,
                pressed && { opacity: 0.7 },
              ]}
              onPress={() => navigation.navigate('MainTabs', { screen: 'Gyms', params: { screen: 'GymDetail', params: { gymId: gym.id, gymName: gym.name } } })}
            >
              <View style={styles.experienceIconWrap}>
                <Feather name="home" size={18} color="white" />
              </View>
              <View style={styles.experienceInfo}>
                <Text style={styles.experienceName} numberOfLines={1}>{gym.name}</Text>
                {gym.address ? (
                  <Text style={styles.experienceSub} numberOfLines={1}>{gym.address}</Text>
                ) : null}
                {gym.rating ? (
                  <Text style={styles.experienceRating}>⭐ {parseFloat(gym.rating).toFixed(1)}</Text>
                ) : null}
              </View>
              {gym.is_enrolled && (
                <View style={styles.enrolledBadge}>
                  <Text style={styles.enrolledBadgeText}>Member</Text>
                </View>
              )}
            </Pressable>
          ))}
          {gyms.length > 3 && (
            <Pressable
              style={({ pressed }) => [styles.experienceViewAll, pressed && { opacity: 0.7 }]}
              onPress={() => setShowAll(v => !v)}
            >
              <Text style={styles.experienceViewAllText}>
                {showAll ? 'Show less' : `View all ${gyms.length} gyms`}
              </Text>
              <Feather name={showAll ? 'chevron-up' : 'chevron-down'} size={14} color={colors.primary} />
            </Pressable>
          )}
        </>
      )}
    </View>
  );
}

// ─── Orgs Section (LinkedIn-style) ───────────────────────────────────────────

function OrgsSection({ orgs, isOwn, navigation }: { orgs: OrgListItem[]; isOwn: boolean; navigation: any }) {
  const [showAll, setShowAll] = React.useState(false);
  const visible = showAll ? orgs : orgs.slice(0, 3);
  return (
    <View style={styles.experienceSection}>
      <View style={styles.experienceSectionHeader}>
        <Feather name="users" size={15} color={colors.textSecondary} />
        <Text style={styles.experienceSectionTitle}>Organizations</Text>
      </View>
      {orgs.length === 0 ? (
        isOwn ? (
          <Pressable
            style={({ pressed }) => [styles.experienceEmptyCTA, pressed && { opacity: 0.7 }]}
            onPress={() => navigation.navigate('MainTabs', { screen: 'Social', params: { screen: 'SocialHome', params: { tab: 'Orgs' } } })}
          >
            <Feather name="plus-circle" size={15} color={colors.primary} />
            <Text style={styles.experienceEmptyCTAText}>Join an organization</Text>
            <Feather name="chevron-right" size={14} color={colors.primary} />
          </Pressable>
        ) : (
          <Text style={styles.experienceEmptyText}>Not in any organizations</Text>
        )
      ) : (
        <>
          {visible.map((org, index) => (
            <Pressable
              key={org.id}
              style={({ pressed }) => [
                styles.experienceItem,
                index < visible.length - 1 && styles.experienceItemBorder,
                pressed && { opacity: 0.7 },
              ]}
              onPress={() => navigation.navigate('OrgProfile', { orgId: org.id })}
            >
              <View style={styles.experienceIconWrap}>
                {org.avatar_url ? (
                  <Image source={{ uri: org.avatar_url }} style={styles.orgAvatar} contentFit="cover" />
                ) : (
                  <Feather name="users" size={18} color="white" />
                )}
              </View>
              <View style={styles.experienceInfo}>
                <Text style={styles.experienceName} numberOfLines={1}>{org.name}</Text>
                <Text style={styles.experienceSub}>
                  {org.member_count} member{org.member_count !== 1 ? 's' : ''}
                  {org.user_role ? ` · ${org.user_role}` : ''}
                </Text>
              </View>
              <Feather name="chevron-right" size={15} color={colors.textMuted} />
            </Pressable>
          ))}
          {orgs.length > 3 && (
            <Pressable
              style={({ pressed }) => [styles.experienceViewAll, pressed && { opacity: 0.7 }]}
              onPress={() => setShowAll(v => !v)}
            >
              <Text style={styles.experienceViewAllText}>
                {showAll ? 'Show less' : `View all ${orgs.length} organizations`}
              </Text>
              <Feather name={showAll ? 'chevron-up' : 'chevron-down'} size={14} color={colors.primary} />
            </Pressable>
          )}
        </>
      )}
    </View>
  );
}

// ─── Achievements Section ─────────────────────────────────────────────────────

const RARITY_COLORS: Record<Achievement['rarity'], string> = {
  common: '#6B7280',
  rare: '#3B82F6',
  epic: '#8B5CF6',
  legendary: '#F59E0B',
};

const RARITY_LABELS: Record<Achievement['rarity'], string> = {
  common: 'COMMON',
  rare: 'RARE',
  epic: 'EPIC',
  legendary: 'LEGENDARY',
};

const RARITY_GRADIENTS: Record<Achievement['rarity'], [string, string]> = {
  common:    ['#4B5563', '#1F2937'],
  rare:      ['#2563EB', '#1E3A8A'],
  epic:      ['#7C3AED', '#3B0764'],
  legendary: ['#D97706', '#78350F'],
};

function AchievementsSection({ achievements, onSelect }: { achievements: Achievement[]; onSelect: (a: Achievement) => void }) {
  return (
    <View style={styles.experienceSection}>
      <View style={styles.experienceSectionHeader}>
        <Text style={{ fontSize: 15 }}>🏆</Text>
        <Text style={styles.experienceSectionTitle}>Achievements</Text>
        <Text style={achievStyles.countLabel}>{achievements.length} earned</Text>
      </View>
      <FlatList
        data={achievements}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingVertical: spacing.md, gap: 10 }}
        renderItem={({ item }) => (
          <AchievementBadge item={item} onPress={() => onSelect(item)} />
        )}
      />
    </View>
  );
}

function AchievementBadge({ item, onPress }: { item: Achievement; onPress: () => void }) {
  const color = RARITY_COLORS[item.rarity];
  return (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && { opacity: 0.75 }}>
      <View style={[achievStyles.badge, { borderColor: color }, Platform.OS === 'ios' ? { shadowColor: color } : {}]}>
        <Text style={achievStyles.badgeEmoji}>{item.emoji}</Text>
        <Text style={achievStyles.badgeName} numberOfLines={2}>{item.name}</Text>
        <Text style={achievStyles.badgeDesc} numberOfLines={2}>{item.desc}</Text>
        <View style={[achievStyles.rarityPill, { backgroundColor: color }]}>
          <Text style={achievStyles.rarityText}>{RARITY_LABELS[item.rarity]}</Text>
        </View>
      </View>
    </Pressable>
  );
}

const ACHIEV_MODAL_CARD_WIDTH = SCREEN_WIDTH * 0.88;
const ACHIEV_PROGRESS_BAR_WIDTH = ACHIEV_MODAL_CARD_WIDTH - 56;

function AchievementModal({ achievement, onClose }: { achievement: Achievement | null; onClose: () => void }) {
  const emojiY      = useSharedValue(0);
  const emojiScale  = useSharedValue(0);
  const cardScale   = useSharedValue(0.82);
  const cardOpacity = useSharedValue(0);
  const progressW   = useSharedValue(0);

  useEffect(() => {
    if (achievement) {
      cardScale.value   = withSpring(1, { damping: 16, stiffness: 200 });
      cardOpacity.value = withTiming(1, { duration: 200 });
      emojiScale.value  = withDelay(120, withSpring(1, { damping: 5, stiffness: 100 }));
      emojiY.value = withDelay(450, withRepeat(
        withSequence(
          withTiming(-22, { duration: 520 }),
          withTiming(0,   { duration: 520 }),
        ),
        -1,
        true,
      ));
      const targetW = Math.min(achievement.user_pct, 100) * ACHIEV_PROGRESS_BAR_WIDTH / 100;
      progressW.value = withDelay(650, withTiming(targetW, { duration: 900 }));
    } else {
      cancelAnimation(emojiY);
      cancelAnimation(emojiScale);
      cancelAnimation(progressW);
      emojiY.value      = 0;
      emojiScale.value  = 0;
      cardScale.value   = 0.82;
      cardOpacity.value = 0;
      progressW.value   = 0;
    }
  }, [achievement?.id]);

  const cardStyle     = useAnimatedStyle(() => ({ transform: [{ scale: cardScale.value }], opacity: cardOpacity.value }));
  const emojiStyle    = useAnimatedStyle(() => ({ transform: [{ translateY: emojiY.value }, { scale: emojiScale.value }] }));
  const progressStyle = useAnimatedStyle(() => ({ width: progressW.value }));

  if (!achievement) return null;

  const gradColors  = RARITY_GRADIENTS[achievement.rarity];
  const rarityColor = RARITY_COLORS[achievement.rarity];
  const pctText     = achievement.user_pct < 1
    ? '< 1% of Spotters have this'
    : `${achievement.user_pct.toFixed(1)}% of Spotters have this`;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={achievModalStyles.overlay} onPress={onClose}>
        <Pressable onPress={() => {}} style={achievModalStyles.cardWrapper}>
          <RNAnimated.View style={[achievModalStyles.cardShadow, cardStyle]}>
            <LinearGradient
              colors={gradColors}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={achievModalStyles.gradient}
            >
              <Pressable style={achievModalStyles.closeBtn} onPress={onClose} hitSlop={14}>
                <Feather name="x" size={22} color="rgba(255,255,255,0.65)" />
              </Pressable>
              <RNAnimated.View style={emojiStyle}>
                <Text style={achievModalStyles.bigEmoji}>{achievement.emoji}</Text>
              </RNAnimated.View>
              <Text style={achievModalStyles.achievName}>{achievement.name}</Text>
              <View style={achievModalStyles.rarityPill}>
                <Text style={achievModalStyles.rarityPillText}>★  {RARITY_LABELS[achievement.rarity]}</Text>
              </View>
              <Text style={achievModalStyles.achievDesc}>{achievement.desc}</Text>
              <View style={achievModalStyles.divider} />
              <Text style={achievModalStyles.pctLabel}>{pctText}</Text>
              <View style={achievModalStyles.progressTrack}>
                <RNAnimated.View style={[achievModalStyles.progressFill, { backgroundColor: rarityColor }, progressStyle]} />
              </View>
              <View style={achievModalStyles.statusRow}>
                <Feather name="check-circle" size={16} color="rgba(255,255,255,0.95)" />
                <Text style={achievModalStyles.statusText}>You earned this!</Text>
              </View>
            </LinearGradient>
          </RNAnimated.View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const achievStyles = StyleSheet.create({
  badge: {
    width: 112,
    borderRadius: 14,
    borderWidth: 1.5,
    backgroundColor: colors.surface,
    padding: 10,
    alignItems: 'center',
    gap: 5,
    ...Platform.select({
      ios: { shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.25, shadowRadius: 8 },
      android: { elevation: 4 },
    }),
  },
  badgeEmoji: { fontSize: 30 },
  badgeName: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
    lineHeight: 15,
  },
  badgeDesc: {
    fontSize: 10,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 13,
  },
  rarityPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginTop: 2,
  },
  rarityText: {
    fontSize: 8,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.6,
  },
  countLabel: {
    fontSize: typography.size.sm,
    color: colors.textMuted,
    fontWeight: '500',
    marginLeft: 'auto' as any,
  },
});

const achievModalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  cardWrapper: {
    width: ACHIEV_MODAL_CARD_WIDTH,
    alignItems: 'center',
  },
  cardShadow: {
    width: ACHIEV_MODAL_CARD_WIDTH,
    borderRadius: 28,
    overflow: 'hidden',
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 16 }, shadowOpacity: 0.45, shadowRadius: 28 },
      android: { elevation: 20 },
    }),
  },
  gradient: {
    padding: 28,
    alignItems: 'center',
    gap: 12,
  },
  closeBtn: { alignSelf: 'flex-end', marginBottom: 4 },
  bigEmoji: { fontSize: 76, lineHeight: 90 },
  achievName: { fontSize: 26, fontWeight: '800', color: '#fff', textAlign: 'center' },
  rarityPill: {
    paddingHorizontal: 18,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  rarityPillText: { fontSize: 13, fontWeight: '700', color: '#fff', letterSpacing: 0.8 },
  achievDesc: { fontSize: 15, color: 'rgba(255,255,255,0.82)', textAlign: 'center', lineHeight: 22 },
  divider: { height: 1, width: '100%', backgroundColor: 'rgba(255,255,255,0.18)', marginVertical: 2 },
  pctLabel: { fontSize: 13, color: 'rgba(255,255,255,0.7)', fontWeight: '600' },
  progressTrack: {
    width: ACHIEV_PROGRESS_BAR_WIDTH,
    height: 7,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: { height: 7, borderRadius: 4 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 4 },
  statusText: { fontSize: 14, color: 'rgba(255,255,255,0.9)', fontWeight: '600' },
});

// ─── Posts Tab ────────────────────────────────────────────────────────────────

type CarouselItem = FeedItem | 'view-all';

function PostsTab({
  posts,
  loading,
  isOwn,
  onOpenPost,
  onViewAllPosts,
  onLike,
  onComment,
  onPollVote,
  onDelete,
}: {
  posts: FeedItem[];
  loading: boolean;
  isOwn: boolean;
  onOpenPost: (item: FeedItem) => void;
  onViewAllPosts: () => void;
  onLike: (item: FeedItem) => void;
  onComment: (item: FeedItem) => void;
  onPollVote: (item: FeedItem, optionId: number | string) => void;
  onDelete?: (item: FeedItem) => void;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const carouselRef = useRef<FlatList>(null);

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

  const data: CarouselItem[] = [...posts.slice(0, 5), 'view-all' as const];

  const scrollTo = (index: number) => {
    const target = Math.max(0, Math.min(index, data.length - 1));
    carouselRef.current?.scrollToOffset({
      offset: target * (CAROUSEL_CARD_W + CAROUSEL_GAP),
      animated: true,
    });
    setActiveIndex(target);
  };

  const canGoLeft = activeIndex > 0;
  const canGoRight = activeIndex < data.length - 1;

  return (
    <View>
      <FlatList
        ref={carouselRef}
        horizontal
        data={data}
        keyExtractor={(item) => (item === 'view-all' ? 'view-all' : item.id)}
        showsHorizontalScrollIndicator={false}
        snapToInterval={CAROUSEL_CARD_W + CAROUSEL_GAP}
        decelerationRate="fast"
        contentContainerStyle={styles.carouselContent}
        onMomentumScrollEnd={(e) => {
          setActiveIndex(Math.round(e.nativeEvent.contentOffset.x / (CAROUSEL_CARD_W + CAROUSEL_GAP)));
        }}
        renderItem={({ item }) => {
          if (item === 'view-all') {
            return (
              <Pressable
                style={({ pressed }) => [styles.viewAllCard, pressed && { opacity: 0.8 }]}
                onPress={onViewAllPosts}
              >
                <Feather name="grid" size={32} color={colors.primary} />
                <Text style={styles.viewAllCardTitle}>View all posts</Text>
                <Feather name="chevron-right" size={20} color={colors.textMuted} />
              </Pressable>
            );
          }
          return (
            // Outer view carries the shadow; inner Pressable clips content with overflow:hidden
            <View style={styles.carouselCardOuter}>
              <Pressable style={styles.carouselCard} onPress={() => onOpenPost(item)}>
                {/* Content area fills available height, taps fall through to open the viewer */}
                <View style={{ flex: 1 }} pointerEvents="none">
                  <View style={styles.carouselCardInner}>
                    <FeedCardHeader
                      user={item.user}
                      createdAt={item.created_at}
                      locationName={item.location_name}
                      workoutType={item.workout_type}
                      sharedContext={item.shared_context}
                    />
                    <FeedCardBody
                      item={item}
                      onPollVote={() => {}}
                    />
                  </View>
                </View>
                {/* Action bar always pinned to the bottom of the fixed-height card */}
                <View style={styles.carouselCardActions}>
                  <FeedCardActions
                    likeCount={item.like_count}
                    commentCount={item.comment_count}
                    userLiked={item.user_liked}
                    onLike={() => onLike(item)}
                    onComment={() => onComment(item)}
                    shareUrl={`https://spottr.app/${item.type}/${item.id}`}
                    shareTitle={
                      item.description
                        ? `${item.user.display_name}: ${item.description.slice(0, 60)}`
                        : `${item.user.display_name}'s post`
                    }
                  />
                </View>
              </Pressable>
            </View>
          );
        }}
      />

      {/* Arrow controls + dot indicators */}
      <View style={styles.carouselControls}>
        <Pressable
          onPress={() => scrollTo(activeIndex - 1)}
          disabled={!canGoLeft}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={[styles.carouselArrow, !canGoLeft && styles.carouselArrowDisabled]}
        >
          <Feather name="chevron-left" size={18} color={canGoLeft ? colors.textPrimary : colors.textMuted} />
        </Pressable>
        <View style={styles.carouselDots}>
          {data.map((_, i) => (
            <View key={i} style={[styles.carouselDot, i === activeIndex && styles.carouselDotActive]} />
          ))}
        </View>
        <Pressable
          onPress={() => scrollTo(activeIndex + 1)}
          disabled={!canGoRight}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={[styles.carouselArrow, !canGoRight && styles.carouselArrowDisabled]}
        >
          <Feather name="chevron-right" size={18} color={canGoRight ? colors.textPrimary : colors.textMuted} />
        </Pressable>
      </View>

      {/* View all posts button */}
      <Pressable
        style={({ pressed }) => [styles.viewAllPostsBtn, pressed && { opacity: 0.75 }]}
        onPress={onViewAllPosts}
      >
        <Feather name="list" size={14} color={colors.primary} />
        <Text style={styles.viewAllPostsBtnText}>View all posts</Text>
        <Feather name="chevron-right" size={14} color={colors.primary} />
      </Pressable>
    </View>
  );
}

// ─── Post Thumbnail ───────────────────────────────────────────────────────────

function PostThumbnail({ item, onPress, size }: { item: FeedItem; onPress: () => void; size?: number }) {
  const s = size ?? THUMB_SIZE;
  return (
    <Pressable
      style={({ pressed }) => [
        { width: s, height: s, backgroundColor: colors.background.elevated, borderRadius: 4, overflow: 'hidden', borderWidth: 1, borderColor: colors.border.subtle },
        pressed && { opacity: 0.75 },
      ]}
      onPress={onPress}
    >
      {item.photo_url ? (
        <Image source={{ uri: item.photo_url }} style={{ width: s, height: s }} contentFit="cover" />
      ) : item.workout ? (
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
        <LinearGradient colors={['rgba(59,130,246,0.14)', 'rgba(124,58,237,0.10)']} style={styles.thumbContent}>
          <View style={styles.thumbBadge}>
            <Feather name="bar-chart-2" size={10} color="#3b82f6" />
            <Text style={[styles.thumbBadgeText, { color: '#3b82f6' }]}>POLL</Text>
          </View>
          <Text style={styles.thumbTitle} numberOfLines={3}>{item.poll.question}</Text>
        </LinearGradient>
      ) : item.description ? (
        <View style={[styles.thumbContent, styles.thumbTextBg]}>
          <Text style={styles.thumbTextContent} numberOfLines={4}>{item.description}</Text>
        </View>
      ) : (
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


// ─── Calendar Tab ──────────────────────────────────────────────────────────────

function CalendarTab({
  profileUsername,
  preloadedMonths,
  onOpenViewer,
}: {
  profileUsername: string;
  preloadedMonths: Record<string, CheckinItem[]>;
  onOpenViewer: (days: CalViewerDay[], initialIndex: number) => void;
}) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const currentKey = `${year}-${month}`;

  // Seed from pre-loaded map if available, otherwise empty
  const [checkins, setCheckins] = useState<CheckinItem[]>(
    () => preloadedMonths[`${now.getFullYear()}-${now.getMonth()}`] ?? []
  );

  // When pre-loaded map arrives (or month changes), sync in pre-loaded data or fetch
  useEffect(() => {
    const preloaded = preloadedMonths[currentKey];
    if (preloaded !== undefined) {
      // Data already available — show immediately, no network call
      setCheckins(preloaded);
    } else {
      // Not pre-loaded — fetch without clearing first so old dots stay visible
      fetchUserCheckins(profileUsername, undefined, month + 1, year)
        .then((res) => setCheckins(res.items))
        .catch(() => {});
    }
  }, [year, month, profileUsername, preloadedMonths]);

  // Group check-ins by day number
  const dayMap = useMemo(() => {
    const map = new Map<number, CheckinItem[]>();
    for (const c of checkins) {
      const d = new Date(c.created_at);
      if (d.getFullYear() === year && d.getMonth() === month) {
        const day = d.getDate();
        if (!map.has(day)) map.set(day, []);
        map.get(day)!.push(c);
      }
    }
    return map;
  }, [checkins, year, month]);

  const checkinDayNums = useMemo(() => new Set(dayMap.keys()), [dayMap]);

  const sortedDays = useMemo<CalViewerDay[]>(() => (
    Array.from(dayMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([day, items]) => ({ year, month, day, checkins: items }))
  ), [dayMap, year, month]);

  const prevMonth = () => {
    if (month === 0) { setMonth(11); setYear((y) => y - 1); }
    else setMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setMonth(0); setYear((y) => y + 1); }
    else setMonth((m) => m + 1);
  };
  const isNextDisabled = () => {
    const today = new Date();
    return year >= today.getFullYear() && month >= today.getMonth();
  };

  const handleDayPress = (day: number) => {
    if (!checkinDayNums.has(day)) return;
    const idx = sortedDays.findIndex((d) => d.day === day);
    if (idx >= 0) onOpenViewer(sortedDays, idx);
  };

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  return (
    <View style={styles.calendarWrap}>
      <Text style={styles.calendarTitle}>📅 Check-in Calendar</Text>
      <View style={styles.calendarCard}>
        <View style={styles.calNav}>
          <Pressable style={styles.calNavBtn} onPress={prevMonth}>
            <Feather name="chevron-left" size={18} color={colors.textSecondary} />
          </Pressable>
          <Text style={styles.calMonthLabel}>{MONTHS[month]} {year}</Text>
          <Pressable
            style={[styles.calNavBtn, isNextDisabled() && { opacity: 0.3 }]}
            onPress={nextMonth}
            disabled={isNextDisabled()}
          >
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
            const hasCheckin = checkinDayNums.has(day);
            return (
              <Pressable
                key={day}
                style={styles.calDay}
                onPress={() => handleDayPress(day)}
                disabled={!hasCheckin}
              >
                <View style={[styles.calDayBubble, hasCheckin && styles.calDayBubbleWorkout]}>
                  <Text style={[styles.calDayText, hasCheckin && styles.calDayTextWorkout]}>
                    {day}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

// ─── Records Tab ──────────────────────────────────────────────────────────────

function RecordsTab({
  prs, loading, isOwn, onAdd, onEdit, onDelete, onViewVideo, showAll, onToggleShowAll,
}: {
  prs: PersonalRecord[];
  loading: boolean;
  isOwn: boolean;
  onAdd: () => void;
  onEdit: (pr: PersonalRecord) => void;
  onDelete: (pr: PersonalRecord) => void;
  onViewVideo: (url: string) => void;
  showAll: boolean;
  onToggleShowAll: (val: boolean) => void;
}) {
  if (loading) {
    return <View style={styles.emptyTab}><ActivityIndicator color={colors.primary} /></View>;
  }

  const displayed = showAll ? prs : prs.slice(0, 4);

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
        <>
          <View style={styles.prGrid}>
            {displayed.map((pr) => (
              <View key={pr.id} style={styles.prCard}>
                <View style={styles.prCardHeader}>
                  <Text style={styles.prCardName} numberOfLines={1}>{pr.exercise_name}</Text>
                  {isOwn && (
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      <Pressable onPress={() => onEdit(pr)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Feather name="edit-2" size={14} color={colors.textMuted} />
                      </Pressable>
                      <Pressable onPress={() => onDelete(pr)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Feather name="trash-2" size={14} color={colors.textMuted} />
                      </Pressable>
                    </View>
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

          {prs.length > 4 && (
            <Pressable style={styles.toggleBtn} onPress={() => onToggleShowAll(!showAll)}>
              <Text style={styles.toggleBtnText}>{showAll ? 'See Less' : `See All ${prs.length} PRs`}</Text>
              <Feather name={showAll ? 'chevron-up' : 'chevron-down'} size={14} color={colors.primary} />
            </Pressable>
          )}
        </>
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

  // ── Instagram-style summary row ──
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.sm,
    gap: spacing.xl,
  },
  avatarWrap: {
    width: 82,
    height: 82,
    borderRadius: 41,
    borderWidth: 3,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryStats: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  summaryStatItem: { alignItems: 'center' },
  summaryStatValue: { fontSize: 20, fontWeight: '700', color: colors.textPrimary },
  summaryStatLabel: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  clickable: { color: colors.primary },

  // ── Name block ──
  nameBlock: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.sm,
    gap: 2,
  },
  displayName: { fontSize: 17, fontWeight: '700', color: colors.textPrimary },
  streakInline: { fontSize: 15, fontWeight: '700', color: '#fb923c' },
  usernameText: { fontSize: typography.size.sm, color: colors.textMuted },
  bio: { fontSize: typography.size.sm, color: colors.textSecondary, lineHeight: 20, marginTop: 2 },

  // ── Stats chips ──
  chipRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  statChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background.elevated,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border.default,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  chipEmoji: { fontSize: 13 },
  chipVal: { fontSize: 13, fontWeight: '700', color: colors.textPrimary, marginLeft: 4 },
  chipLbl: { fontSize: 12, color: colors.textMuted },

  // ── Action buttons ──
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
  },
  actionBtn: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnFlex: { flex: 1 },
  actionBtnOutline: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: colors.borderColor },
  actionBtnText: { fontSize: typography.size.sm, fontWeight: '600', color: colors.textOnPrimary },
  actionBtnTextOutline: { fontSize: typography.size.sm, fontWeight: '600', color: colors.textPrimary },

  // ── Blocked overlay ──
  blockedCard: {
    margin: spacing.xl,
    padding: spacing.xl,
    borderRadius: 16,
    backgroundColor: colors.background.elevated,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  blockedTitle: { fontSize: typography.size.base, fontWeight: '700', color: colors.textPrimary, textAlign: 'center' },
  blockedSub: { fontSize: typography.size.sm, color: colors.textMuted, textAlign: 'center', marginTop: spacing.xs },

  // ── 3-dot action menu ──
  menuBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  menuSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.base,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: -3 }, shadowOpacity: 0.12, shadowRadius: 12 },
      android: { elevation: 8 },
    }),
  },
  menuHandle: {
    width: 36,
    height: 4,
    backgroundColor: colors.border.default,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  menuItemText: { fontSize: typography.size.base, color: colors.textPrimary },
  menuDivider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border.subtle, marginVertical: spacing.xs },

  // ── LinkedIn-style experience sections ──
  experienceSection: {
    marginBottom: spacing.md,
    backgroundColor: colors.background.base,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border.subtle,
  },
  experienceSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  experienceSectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  experienceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  experienceItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  experienceIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 8,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  orgAvatar: { width: 38, height: 38 },
  experienceInfo: { flex: 1 },
  experienceName: { fontSize: typography.size.sm, fontWeight: '600', color: colors.textPrimary },
  experienceSub: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  experienceRating: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
  enrolledBadge: {
    backgroundColor: 'rgba(79,195,224,0.12)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: 'rgba(79,195,224,0.3)',
  },
  enrolledBadgeText: { fontSize: 11, fontWeight: '600', color: colors.primary },
  experienceEmptyCTA: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  experienceEmptyCTAText: { flex: 1, fontSize: typography.size.sm, fontWeight: '600', color: colors.primary },
  experienceEmptyText: {
    fontSize: typography.size.sm,
    color: colors.textMuted,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  experienceViewAll: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: spacing.sm + 2,
    borderTopWidth: 1,
    borderTopColor: colors.border.subtle,
  },
  experienceViewAllText: { fontSize: typography.size.sm, fontWeight: '600', color: colors.primary },

  // ── Mutual connections ──
  mutualSection: {
    marginTop: spacing.xs,
  },
  mutualFollowedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingVertical: 6,
  },
  mutualAvatarStack: { flexDirection: 'row', alignItems: 'center' },
  mutualAvatarWrap: { borderRadius: 11, borderWidth: 1.5, borderColor: colors.background.base },
  mutualFollowedText: { flex: 1, fontSize: typography.size.sm, color: colors.textSecondary },
  mutualFollowedLabel: { color: colors.textMuted },
  mutualInCommonRow: {
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    gap: 6,
  },
  mutualInCommonBorder: { borderTopWidth: 1, borderTopColor: colors.border.subtle },
  mutualInCommonLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  mutualChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  mutualChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.background.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    maxWidth: 160,
  },
  mutualChipIcon: { fontSize: 12 },
  mutualChipText: { fontSize: 12, color: colors.textPrimary, fontWeight: '500', flexShrink: 1 },

  // ── Mutual followers modal ──
  mutualModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  mutualModalTitle: { fontSize: typography.size.base, fontWeight: '700', color: colors.textPrimary },
  mutualModalClose: { position: 'absolute', right: spacing.base, bottom: spacing.md },
  mutualSearchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    margin: spacing.base,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.background.elevated,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  mutualSearchInput: { flex: 1, fontSize: typography.size.sm, color: colors.textPrimary },
  mutualUserRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  mutualUserName: { fontSize: typography.size.sm, fontWeight: '600', color: colors.textPrimary },
  mutualUserHandle: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  mutualEmpty: { alignItems: 'center', paddingTop: 48 },
  mutualEmptyText: { fontSize: typography.size.sm, color: colors.textMuted },

  // ── Tab bar ──
  tabBar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 4,
    marginHorizontal: spacing.xl,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border.default,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4 },
      android: { elevation: 1 },
    }),
  },
  tabBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8 },
  tabBtnActive: { backgroundColor: colors.primary },
  tabText: { fontSize: 13, fontWeight: '500', color: colors.textMuted },
  tabTextActive: { fontWeight: '600', color: '#000' },

  // ── Tab content wrapper ──
  tabContent: { paddingBottom: spacing.xl },

  // ── All posts modal grid ──
  allPostsGrid: { paddingHorizontal: spacing.xl, paddingTop: spacing.sm, paddingBottom: 60 },
  feedFooter: { paddingVertical: spacing.xl, alignItems: 'center' as const },
  allPostsRow: { gap: THUMB_GAP, marginBottom: THUMB_GAP },

  // ── View All / See All toggle button ──
  toggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginHorizontal: spacing.xl,
    marginTop: spacing.sm,
    paddingVertical: spacing.sm + 2,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border.default,
    backgroundColor: colors.background.elevated,
  },
  toggleBtnText: { fontSize: typography.size.sm, fontWeight: '600', color: colors.primary },

  // ── Carousel (Posts tab) ──
  carouselContent: {
    paddingLeft: 16,
    paddingRight: 8,
    paddingVertical: 10,
  },
  // Outer view holds the shadow; no overflow so shadow is visible on iOS
  carouselCardOuter: {
    width: CAROUSEL_CARD_W,
    height: CAROUSEL_CARD_H,
    marginRight: CAROUSEL_GAP,
    borderRadius: 14,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 12 },
      android: { elevation: 4 },
    }),
  },
  // Inner Pressable clips content to border radius
  carouselCard: {
    flex: 1,
    flexDirection: 'column' as const,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  carouselCardInner: {
    paddingTop: spacing.base,
    paddingHorizontal: spacing.base,
  },
  carouselCardActions: {
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.sm,
    paddingTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderColor,
    backgroundColor: colors.surface,
  },
  viewAllCard: {
    width: CAROUSEL_CARD_W,
    height: CAROUSEL_CARD_H,
    marginRight: CAROUSEL_GAP,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border.default,
    backgroundColor: colors.background.elevated,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 14,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12 },
      android: { elevation: 3 },
    }),
  },
  viewAllCardTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: colors.textPrimary,
  },
  carouselControls: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 4,
    gap: 12,
  },
  carouselArrow: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.background.elevated,
    borderWidth: 1,
    borderColor: colors.border.default,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  carouselArrowDisabled: { opacity: 0.35 },
  carouselDots: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 6,
  },
  carouselDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.border.default },
  carouselDotActive: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary },
  viewAllPostsBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 6,
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    paddingVertical: 11,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border.default,
    backgroundColor: colors.background.elevated,
  },
  viewAllPostsBtnText: { fontSize: 13, fontWeight: '600' as const, color: colors.primary },

  // ── Posts full grid ──
  postsGrid: { paddingHorizontal: spacing.xl, paddingBottom: spacing.md },
  postsRow: { flexDirection: 'row', gap: THUMB_GAP, marginBottom: THUMB_GAP },
  thumbEmpty: { width: THUMB_SIZE, height: THUMB_SIZE },
  thumbContent: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 6 },
  thumbBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 5 },
  thumbBadgeText: { fontSize: 7, fontWeight: '700', letterSpacing: 0.5 },
  thumbTitle: { fontSize: 10, fontWeight: '700', color: colors.textPrimary, textAlign: 'center', lineHeight: 13 },
  thumbSub: { fontSize: 9, color: colors.textMuted, marginTop: 2, textAlign: 'center' },
  thumbTextBg: { backgroundColor: colors.background.elevated },
  thumbTextContent: { fontSize: 9, color: colors.textPrimary, lineHeight: 12 },

  emptyTab: { alignItems: 'center', gap: spacing.md, paddingTop: 48, paddingBottom: spacing.xl, paddingHorizontal: spacing.xl },
  emptyText: { fontSize: typography.size.base, color: colors.textMuted, textAlign: 'center' },

  // ── Calendar ──
  calendarWrap: { paddingHorizontal: spacing.xl, paddingTop: spacing.sm },
  calendarTitle: { fontSize: 16, fontWeight: '600', color: colors.textPrimary, marginBottom: spacing.md },
  calendarCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border.default,
    padding: spacing.base,
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
  calDay: { width: `${100 / 7}%`, aspectRatio: 1, padding: 2, alignItems: 'center', justifyContent: 'center' },
  calDayBubble: {
    flex: 1, width: '100%',
    alignItems: 'center', justifyContent: 'center',
    borderRadius: 999,
    backgroundColor: 'rgba(120,120,128,0.15)',
  },
  calDayBubbleWorkout: { backgroundColor: colors.primary },
  calDayBubbleRest: { backgroundColor: '#F59E0B' },
  calDayText: { fontSize: 14, fontWeight: '500', color: colors.textSecondary },
  calDayTextWorkout: { color: '#fff', fontWeight: '700' },
  calDayTextRest: { color: '#fff', fontWeight: '700' },

  calModalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  calModalCenter: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  calModalPopup: {
    width: '100%', height: SCREEN_HEIGHT * 0.55,
    backgroundColor: colors.background.base,
    borderRadius: 20, overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 20 },
      android: { elevation: 12 },
    }),
  },
  calDaySheetHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.sm, paddingBottom: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border.subtle,
  },
  calModalHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.sm, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border.subtle,
  },
  calModalNavBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  calModalDate: { fontSize: 17, fontWeight: '700', color: colors.textPrimary },
  calModalYear: { fontSize: 13, color: colors.textMuted, marginTop: 1 },

  // ── Calendar floating card modal styles ───────────────────────────────────
  calModalBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.88)',
    alignItems: 'center', justifyContent: 'center',
  },
  calModalOuter: {
    width: SCREEN_WIDTH * 0.88,
    alignItems: 'center',
  },
  calModalCard: {
    width: SCREEN_WIDTH * 0.88,
    height: SCREEN_HEIGHT * 0.64,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#111',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.5, shadowRadius: 24 },
      android: { elevation: 16 },
    }),
  },
  calModalTopGrad: {
    position: 'absolute', top: 0, left: 0, right: 0,
    paddingTop: 16, paddingHorizontal: 16, paddingBottom: 40,
  },
  calModalDateText: { fontSize: 17, fontWeight: '700', color: '#fff' },
  calModalCheckinOf: { fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 2 },
  calModalBottomGrad: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: 16, paddingTop: 60, paddingBottom: 16,
  },
  calModalWorkoutType: { fontSize: 18, fontWeight: '700', color: '#fff' },
  calModalLocRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 5 },
  calModalLocation: { fontSize: 13, color: 'rgba(255,255,255,0.8)' },
  calModalDesc: { fontSize: 13, color: 'rgba(255,255,255,0.7)', marginTop: 5, lineHeight: 19 },
  calModalNoPhoto: { alignItems: 'center', justifyContent: 'center' },
  calModalPauseIndicator: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center', zIndex: 5,
  },
  calModalActions: {
    position: 'absolute', right: 10, bottom: 60,
    alignItems: 'center', gap: 20,
  },
  calModalAction: { alignItems: 'center', gap: 4 },
  calModalActionCount: { fontSize: 12, fontWeight: '600', color: '#fff' },
  calModalXBtn: {
    position: 'absolute', top: 12, right: 12,
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center',
  },
  calModalCheckinDots: {
    flexDirection: 'row', gap: 6, marginTop: 10, alignItems: 'center',
  },
  calModalDateNav: {
    flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14,
  },
  calModalCardNavBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center',
  },
  calModalDateDots: { flexDirection: 'row', gap: 5, alignItems: 'center', flexWrap: 'wrap', maxWidth: SCREEN_WIDTH * 0.5 },
  calModalSmDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.35)' },
  calModalSmDotActive: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff' },
  calModalScroll: { flex: 1 },
  calDayCard: {
    backgroundColor: colors.background.elevated, borderRadius: 12,
    borderWidth: 1, borderColor: colors.border.subtle, overflow: 'hidden',
    marginBottom: 10,
  },
  calDayCardImage: { width: '100%', height: 160 },
  calDayCardBody: { padding: spacing.md, gap: 4 },
  calDayCardDesc: { fontSize: 14, color: colors.textPrimary, lineHeight: 19 },
  calDayCardMeta: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },

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

  // ── PRs ──
  prWrap: { paddingHorizontal: spacing.xl, paddingTop: spacing.sm },
  prHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  prTitle: { fontSize: 16, fontWeight: '600', color: colors.textPrimary },
  addPrBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.primary, borderRadius: 8,
    paddingHorizontal: spacing.md, paddingVertical: 6,
  },
  addPrBtnText: { fontSize: typography.size.sm, fontWeight: '600', color: '#000' },
  prGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: spacing.sm },
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

  // ── Post viewer modal ──
  viewerHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.base, paddingBottom: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border.subtle,
  },
  viewerUserRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  viewerName: { fontSize: typography.size.base, fontWeight: '600', color: colors.textPrimary },
  viewerClose: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  viewerScroll: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: 80 },

  // ── PR modal ──
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

  // ── Catalog ──
  catalogSearchWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.background.elevated,
    borderRadius: 10, borderWidth: 1, borderColor: colors.border.default,
    paddingHorizontal: spacing.md, paddingVertical: 10, marginBottom: spacing.sm,
  },
  catalogSearchInput: { flex: 1, marginLeft: 8, fontSize: typography.size.base, color: colors.textPrimary },
  catalogCategoryScroll: { height: 48, marginBottom: spacing.sm },
  catalogCategoryContent: { flexDirection: 'row', gap: 8, paddingRight: spacing.xl, alignItems: 'center' },
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
  catalogEmpty: { alignItems: 'center', paddingTop: 40 },

  // ── Video viewer ──
  videoViewer: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  videoViewerClose: {
    position: 'absolute', right: 20, zIndex: 10,
    backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 20, padding: 6,
  },
});

// ── CalViewerFlatList ─────────────────────────────────────────────────────────
// FlatList-based pager: vertical scroll = days, horizontal scroll = check-ins.
// Gives the same continuous scroll feel as the friends/following feed.

type CalViewerFlatListProps = {
  days: CalViewerDay[];
  initialDayIdx: number;
  likeState: Record<string, { liked: boolean; count: number }>;
  onClose: () => void;
  onDayChange: (idx: number) => void;
  onLike: (checkin: CheckinItem) => void;
  onComment: (checkin: CheckinItem) => void;
};

function CalViewerFlatList({ days, initialDayIdx, likeState, onClose, onDayChange, onLike, onComment }: CalViewerFlatListProps) {
  const onDayChangeRef = useRef(onDayChange);
  useEffect(() => { onDayChangeRef.current = onDayChange; }, [onDayChange]);

  // Must be stable — React Native warns if onViewableItemsChanged changes after mount
  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (viewableItems.length > 0) {
      onDayChangeRef.current(viewableItems[0].index ?? 0);
    }
  }).current;

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 50 }).current;

  return (
    <FlatList
      data={days}
      keyExtractor={(d) => `${d.year}-${d.month}-${d.day}`}
      pagingEnabled
      showsVerticalScrollIndicator={false}
      decelerationRate="fast"
      initialScrollIndex={initialDayIdx > 0 ? initialDayIdx : undefined}
      getItemLayout={(_, index) => ({ length: SCREEN_HEIGHT, offset: SCREEN_HEIGHT * index, index })}
      maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
      onViewableItemsChanged={onViewableItemsChanged}
      viewabilityConfig={viewabilityConfig}
      renderItem={({ item: day }) => (
        <CalDayPage
          day={day}
          likeState={likeState}
          onClose={onClose}
          onLike={onLike}
          onComment={onComment}
        />
      )}
    />
  );
}

// One full-screen page per day. If the day has multiple check-ins, an inner
// horizontal FlatList lets the user swipe between them.
function CalDayPage({ day, likeState, onClose, onLike, onComment }: {
  day: CalViewerDay;
  likeState: Record<string, { liked: boolean; count: number }>;
  onClose: () => void;
  onLike: (c: CheckinItem) => void;
  onComment: (c: CheckinItem) => void;
}) {
  const [activeCheckinIdx, setActiveCheckinIdx] = useState(0);

  if (day.checkins.length === 1) {
    return (
      <View style={{ width: SCREEN_WIDTH, height: SCREEN_HEIGHT, alignItems: 'center', justifyContent: 'center' }}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <CalCheckinCard
          checkin={day.checkins[0]}
          day={day}
          checkinIdx={0}
          totalCheckins={1}
          isActive
          likeState={likeState}
          onClose={onClose}
          onLike={onLike}
          onComment={onComment}
        />
      </View>
    );
  }

  return (
    <View style={{ width: SCREEN_WIDTH, height: SCREEN_HEIGHT }}>
      <FlatList
        horizontal
        pagingEnabled
        data={day.checkins}
        keyExtractor={(c) => c.id}
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        getItemLayout={(_, index) => ({ length: SCREEN_WIDTH, offset: SCREEN_WIDTH * index, index })}
        onMomentumScrollEnd={(e) => {
          const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
          setActiveCheckinIdx(idx);
        }}
        renderItem={({ item: checkin, index }) => (
          <View style={{ width: SCREEN_WIDTH, height: SCREEN_HEIGHT, alignItems: 'center', justifyContent: 'center' }}>
            <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
            <CalCheckinCard
              checkin={checkin}
              day={day}
              checkinIdx={index}
              totalCheckins={day.checkins.length}
              isActive={index === activeCheckinIdx}
              likeState={likeState}
              onClose={onClose}
              onLike={onLike}
              onComment={onComment}
            />
          </View>
        )}
      />
    </View>
  );
}

// The actual bezel card shown for a single check-in.
function CalCheckinCard({ checkin, day, checkinIdx, totalCheckins, isActive, likeState, onClose, onLike, onComment }: {
  checkin: CheckinItem;
  day: CalViewerDay;
  checkinIdx: number;
  totalCheckins: number;
  isActive: boolean;
  likeState: Record<string, { liked: boolean; count: number }>;
  onClose: () => void;
  onLike: (c: CheckinItem) => void;
  onComment: (c: CheckinItem) => void;
}) {
  const likeData = likeState[checkin.id] ?? { liked: checkin.user_liked, count: checkin.like_count };
  const hasVideo = !!checkin.video_url;
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [userPaused, setUserPaused] = useState(false);

  const videoPlayer = useVideoPlayer(hasVideo ? checkin.video_url! : null, (p) => {
    p.loop = true;
    p.muted = false;
  });

  useEffect(() => {
    if (!hasVideo) return;
    if (isActive) {
      videoPlayer.play();
      setIsVideoPlaying(true);
      setUserPaused(false);
    } else {
      videoPlayer.pause();
      setIsVideoPlaying(false);
      setUserPaused(false);
    }
  }, [isActive, hasVideo]); // eslint-disable-line react-hooks/exhaustive-deps

  const lastVideoTapRef = useRef(0);
  const videoTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleVideoTap = () => {
    const now = Date.now();
    if (now - lastVideoTapRef.current < 300) {
      if (videoTapTimerRef.current) { clearTimeout(videoTapTimerRef.current); videoTapTimerRef.current = null; }
      lastVideoTapRef.current = 0;
      return;
    }
    lastVideoTapRef.current = now;
    const playing = isVideoPlaying;
    videoTapTimerRef.current = setTimeout(() => {
      videoTapTimerRef.current = null;
      if (playing) {
        videoPlayer.pause();
        setIsVideoPlaying(false);
        setUserPaused(true);
      } else {
        videoPlayer.play();
        setIsVideoPlaying(true);
        setUserPaused(false);
      }
    }, 300);
  };

  return (
    <Pressable style={styles.calModalCard} onPress={hasVideo ? handleVideoTap : undefined}>
      {hasVideo ? (
        <View style={[StyleSheet.absoluteFill, { transform: [{ scaleX: -1 }] }]}>
          <VideoView
            player={videoPlayer}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            nativeControls={false}
          />
        </View>
      ) : checkin.photo_url ? (
        <Image source={{ uri: checkin.photo_url }} style={StyleSheet.absoluteFill} contentFit="cover" />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.calModalNoPhoto]}>
          <Feather name="camera" size={48} color="rgba(255,255,255,0.2)" />
        </View>
      )}

      {hasVideo && userPaused && (
        <View style={styles.calModalPauseIndicator} pointerEvents="none">
          <Feather name="pause" size={36} color="rgba(255,255,255,0.85)" />
        </View>
      )}

      <LinearGradient colors={['rgba(0,0,0,0.6)', 'transparent']} style={styles.calModalTopGrad}>
        <Text style={styles.calModalDateText}>{MONTHS[day.month]} {day.day}, {day.year}</Text>
        {totalCheckins > 1 && (
          <Text style={styles.calModalCheckinOf}>{checkinIdx + 1} / {totalCheckins}</Text>
        )}
      </LinearGradient>

      <LinearGradient colors={['transparent', 'rgba(0,0,0,0.82)']} style={styles.calModalBottomGrad}>
        {checkin.workout_type ? <Text style={styles.calModalWorkoutType}>{checkin.workout_type}</Text> : null}
        {checkin.location_name ? (
          <View style={styles.calModalLocRow}>
            <Feather name="map-pin" size={12} color="rgba(255,255,255,0.75)" />
            <Text style={styles.calModalLocation}>{checkin.location_name}</Text>
          </View>
        ) : null}
        {checkin.description ? <Text style={styles.calModalDesc}>{checkin.description}</Text> : null}
      </LinearGradient>

      <View style={styles.calModalActions}>
        <Pressable style={styles.calModalAction} onPress={() => onLike(checkin)}>
          <Feather name="heart" size={26} color={likeData.liked ? colors.semantic.like : '#fff'} />
          {likeData.count > 0 && <Text style={styles.calModalActionCount}>{likeData.count}</Text>}
        </Pressable>
        <Pressable style={styles.calModalAction} onPress={() => onComment(checkin)}>
          <Feather name="message-circle" size={26} color="#fff" />
          {checkin.comment_count > 0 && <Text style={styles.calModalActionCount}>{checkin.comment_count}</Text>}
        </Pressable>
        <Pressable
          style={styles.calModalAction}
          onPress={() => Share.share({ message: `Check out this workout on Spottr!` })}
        >
          <Feather name="share" size={24} color="#fff" />
        </Pressable>
      </View>

      <Pressable style={styles.calModalXBtn} onPress={onClose}>
        <Feather name="x" size={18} color="#fff" />
      </Pressable>
    </Pressable>
  );
}
