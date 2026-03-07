import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  Modal,
  Image,
  ScrollView,
  Dimensions,
  Animated,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system/legacy';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { pickMedia } from '../../utils/pickMedia';
import { VideoView, useVideoPlayer } from 'expo-video';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp, useFocusEffect } from '@react-navigation/native';
import Avatar from '../../components/common/Avatar';
import ReactionDetailModal from '../../components/messages/ReactionDetailModal';
import VideoThumbnail from '../../components/common/VideoThumbnail';
import MentionText from '../../components/common/MentionText';
import MentionAutocomplete, { type MentionableUser } from '../../components/messages/MentionAutocomplete';
import { SharedPostCard } from '../../components/messages/MessageRow';
import {
  fetchAnnouncements,
  createAnnouncement,
  deleteAnnouncement,
  reactToAnnouncement,
  fetchAnnouncementReactionDetails,
  voteOnPoll,
  markAnnouncementsRead,
  uploadMedia,
  fetchOrgDetail,
  listOrgMembers,
  Announcement,
  AnnouncementPoll,
  OrgDetail,
  CreateAnnouncementPayload,
} from '../../api/organizations';
import { useAuth } from '../../store/AuthContext';
import { useUnreadCount } from '../../store/UnreadCountContext';
import { colors, spacing, typography } from '../../theme';
import { staleCache } from '../../utils/staleCache';
import { RootStackParamList } from '../../navigation/types';
import { timeAgo } from '../../utils/timeAgo';
import { wsManager } from '../../services/websocket';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'OrgAnnouncements'>;
  route: RouteProp<RootStackParamList, 'OrgAnnouncements'>;
};

// ── Optimistic announcement type ─────────────────────────────────────────────
// _clientId  : set only on locally-created (not-yet-confirmed) items
// _status    : 'pending' while REST in-flight; 'failed' on error; absent = delivered
// _retryPayload : stored so the user can retry a failed post
type OptimisticAnnouncement = Announcement & {
  _clientId?: string;
  _status?: 'pending' | 'failed';
  _retryPayload?: CreateAnnouncementPayload;
};

type AnnouncementDivider = { id: '__new_divider__'; isDivider: true };
type AnnouncementListItem = OptimisticAnnouncement | AnnouncementDivider;

type CachedOrgAnn = {
  announcements: AnnouncementListItem[];
  has_more: boolean;
  oldest_id: string | null;
  userRole: 'creator' | 'admin' | 'member' | null;
};

function isAnn(item: AnnouncementListItem): item is OptimisticAnnouncement {
  return !('isDivider' in item);
}

function genClientId(): string {
  return `opt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

const EMOJI_QUICK = ['👍', '👎', '😂', '😡', '❤️'];


// ---------------------------------------------------------------------------
// Poll card
// ---------------------------------------------------------------------------

function formatTimeRemaining(endsAt: string | null): string {
  if (!endsAt) return '';
  const diff = new Date(endsAt).getTime() - Date.now();
  if (diff <= 0) return '';
  const totalMinutes = Math.floor(diff / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h remaining`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m remaining`;
  }
  return `${minutes}m remaining`;
}

function PollOptionBar({
  text,
  pct,
  isVoted,
  showResult,
  isActive,
  voting,
  onPress,
}: {
  text: string;
  pct: number;
  isVoted: boolean;
  showResult: boolean;
  isActive: boolean;
  voting: boolean;
  onPress: () => void;
}) {
  const [containerWidth, setContainerWidth] = useState(0);
  // Pixel-based animation — avoids percentage interpolation quirks
  const animWidth = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (containerWidth === 0) return;
    const target = showResult ? (pct / 100) * containerWidth : 0;
    Animated.timing(animWidth, {
      toValue: target,
      duration: showResult ? 300 : 0,
      useNativeDriver: false,
    }).start();
  }, [pct, showResult, containerWidth]);

  return (
    <Pressable
      style={[
        pollStyles.option,
        isVoted && pollStyles.optionVoted,
        !isActive && pollStyles.optionInactive,
      ]}
      onLayout={e => setContainerWidth(e.nativeEvent.layout.width)}
      onPress={onPress}
      disabled={!isActive || voting}
    >
      {showResult && (
        <Animated.View style={[pollStyles.bar, { width: animWidth }]} />
      )}
      <Text style={[pollStyles.optionText, isVoted && pollStyles.optionTextVoted]}>
        {text}
      </Text>
      {showResult && <Text style={pollStyles.pct}>{pct}%</Text>}
      {isVoted && <Feather name="check" size={12} color={colors.primary} style={{ marginLeft: 4 }} />}
    </Pressable>
  );
}

function PollCard({
  poll,
  orgId,
  announcementId,
  onVoted,
}: {
  poll: AnnouncementPoll;
  orgId: string;
  announcementId: string;
  onVoted: (updatedPoll: AnnouncementPoll) => void;
}) {
  // localVotedId: tracks which option this user voted for.
  // Initialized from server data and NEVER goes back to null once set,
  // so results stay visible even if server response is slow or errors out.
  const [localVotedId, setLocalVotedId] = useState<string | null>(
    poll.user_voted_option_id,
  );
  const [voting, setVoting] = useState(false);
  // useRef guard: prevents double-taps before React batches the state update.
  // Unlike useState, setting this is synchronous and takes effect immediately.
  const votingRef = useRef(false);

  // If the component mounts with an already-voted poll (e.g. navigating back),
  // sync local state. Only ever transitions null → value, never value → null.
  useEffect(() => {
    if (poll.user_voted_option_id && !localVotedId) {
      setLocalVotedId(poll.user_voted_option_id);
    }
  }, [poll.user_voted_option_id]);

  // showResult stays true permanently once the user has ever voted
  const showResult = localVotedId !== null || !poll.is_active;
  const totalVotes = poll.total_votes;

  const handleVote = async (optionId: string) => {
    if (!poll.is_active) return;
    if (votingRef.current) return;        // Synchronous guard — blocks double-taps instantly
    if (optionId === localVotedId) return; // Already voted for this option

    votingRef.current = true; // Lock immediately — before any await or setState

    const prevVotedId = localVotedId;
    const isChangingVote = prevVotedId !== null;

    // 1. Lock in the selection locally — results are now permanently visible
    setLocalVotedId(optionId);

    // 2. Optimistic parent update so vote counts update instantly
    const optimisticPoll: AnnouncementPoll = {
      ...poll,
      user_voted_option_id: optionId,
      total_votes: isChangingVote ? poll.total_votes : poll.total_votes + 1,
      options: poll.options.map(opt => {
        let votes = opt.votes;
        if (opt.id === optionId) votes += 1;
        if (isChangingVote && opt.id === prevVotedId) votes = Math.max(0, votes - 1);
        return { ...opt, votes, user_voted: opt.id === optionId };
      }),
    };
    onVoted(optimisticPoll);

    setVoting(true);
    try {
      const res = await voteOnPoll(orgId, announcementId, optionId);
      // Reconcile with server — but only update localVotedId if server confirms a vote
      if (res.poll.user_voted_option_id) {
        setLocalVotedId(res.poll.user_voted_option_id);
      }
      onVoted(res.poll);
    } catch {
      // Don't revert localVotedId — keep results showing.
      // Revert the parent counts to avoid phantom count changes.
      onVoted({ ...poll, user_voted_option_id: localVotedId } as AnnouncementPoll);
      Alert.alert('Error', 'Failed to cast vote. Please try again.');
    } finally {
      votingRef.current = false;
      setVoting(false);
    }
  };

  return (
    <View style={pollStyles.container}>
      <Text style={pollStyles.question}>{poll.question}</Text>
      {poll.options.map((opt) => {
        const pct = totalVotes > 0 ? Math.round((opt.votes / totalVotes) * 100) : 0;
        return (
          <PollOptionBar
            key={opt.id}
            text={opt.text}
            pct={pct}
            isVoted={opt.id === localVotedId}
            showResult={showResult}
            isActive={poll.is_active}
            voting={voting}
            onPress={() => handleVote(opt.id)}
          />
        );
      })}
      <Text style={pollStyles.meta}>
        {totalVotes} {totalVotes !== 1 ? 'votes' : 'vote'}
        {poll.is_active
          ? ` \u2022 Active \u2022 ${formatTimeRemaining(poll.ends_at)}`
          : ' \u2022 Ended'}
      </Text>
    </View>
  );
}

const pollStyles = StyleSheet.create({
  container: {
    marginTop: spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 10,
    padding: spacing.sm,
  },
  question: {
    fontSize: typography.size.sm,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  option: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.borderColor,
    borderRadius: 8,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
    marginBottom: 6,
    overflow: 'hidden',
  },
  optionVoted: {
    borderColor: colors.primary,
  },
  optionInactive: {
    opacity: 0.8,
  },
  bar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(79,195,224,0.18)',
    borderRadius: 8,
  },
  optionText: {
    flex: 1,
    fontSize: typography.size.sm,
    color: colors.textPrimary,
  },
  optionTextVoted: {
    fontWeight: '600',
    color: colors.primary,
  },
  pct: {
    fontSize: typography.size.xs,
    color: colors.textMuted,
    marginLeft: 6,
  },
  meta: {
    fontSize: typography.size.xs,
    color: colors.textMuted,
    marginTop: 4,
  },
});

// ---------------------------------------------------------------------------
// Reaction row
// ---------------------------------------------------------------------------

function ReactionRow({
  reactions,
  onReact,
  onLongPressReaction,
}: {
  reactions: Announcement['reactions'];
  onReact: (emoji: string) => void;
  onLongPressReaction: () => void;
}) {
  if (reactions.length === 0) return null;
  return (
    <View style={rxStyles.row}>
      {reactions.map((r) => (
        <Pressable
          key={r.emoji}
          style={[rxStyles.chip, r.user_reacted && rxStyles.chipActive]}
          onPress={() => onReact(r.emoji)}
          onLongPress={onLongPressReaction}
          delayLongPress={350}
        >
          <Text style={rxStyles.emoji}>{r.emoji}</Text>
          <Text style={[rxStyles.count, r.user_reacted && rxStyles.countActive]}>
            {r.count}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const rxStyles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 6, gap: 4 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.06)',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  chipActive: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(79,195,224,0.12)',
  },
  emoji: { fontSize: 13 },
  count: { fontSize: 11, color: colors.textMuted, marginLeft: 3 },
  countActive: { color: colors.primary, fontWeight: '600' },
});

// ---------------------------------------------------------------------------
// Video player modal
// ---------------------------------------------------------------------------

function VideoPlayerModal({ url, onClose }: { url: string; onClose: () => void }) {
  const player = useVideoPlayer(url, (p) => { p.play(); });
  return (
    <Modal visible animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <VideoView player={player} style={{ flex: 1 }} nativeControls contentFit="contain" />
        <Pressable
          onPress={onClose}
          style={{ position: 'absolute', top: 52, right: 20, padding: 10, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 20 }}
        >
          <Feather name="x" size={24} color="#fff" />
        </Pressable>
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Announcement bubble
// ---------------------------------------------------------------------------

function AnnouncementBubble({
  item,
  orgId,
  isAdmin,
  onLongPress,
  onReact,
  onLongPressReaction,
  onVoted,
  onRetry,
  onVideoPress,
  onMentionPress,
  onAuthorPress,
  onSharedPostPress,
}: {
  item: OptimisticAnnouncement;
  orgId: string;
  isAdmin: boolean;
  onLongPress: (item: OptimisticAnnouncement, pageY: number) => void;
  onReact: (announcementId: string, emoji: string) => void;
  onLongPressReaction: (announcementId: string) => void;
  onVoted: (announcementId: string, poll: AnnouncementPoll) => void;
  onRetry: (item: OptimisticAnnouncement) => void;
  onVideoPress: (url: string) => void;
  onMentionPress?: (username: string) => void;
  onAuthorPress?: (username: string) => void;
  onSharedPostPress?: (postId: string, itemType: 'post' | 'workout' | 'checkin') => void;
}) {
  const isPending = item._status === 'pending';
  const isFailed = item._status === 'failed';
  const bubbleRef = useRef<View>(null);

  return (
    <View ref={bubbleRef}>
    <Pressable
      style={[styles.bubble, isPending && styles.bubblePending, isFailed && styles.bubbleFailed]}
      onLongPress={() => {
        if (!isPending && !isFailed) {
          bubbleRef.current?.measureInWindow((_x, y) => {
            onLongPress(item, y);
          });
        }
      }}
      delayLongPress={400}
    >
      <View style={styles.bubbleHeader}>
        <Pressable
          style={styles.bubbleAuthorRow}
          onPress={() => item.author_username && onAuthorPress?.(item.author_username)}
          disabled={!item.author_username || isPending}
        >
          <Avatar uri={item.author_avatar_url} name={item.author_display_name} size={32} />
          <View style={{ marginLeft: 8, flex: 1 }}>
            <Text style={styles.bubbleAuthor}>{item.author_display_name}</Text>
            {!isPending && (
              <Text style={styles.bubbleTime}>{timeAgo(item.created_at)}</Text>
            )}
          </View>
        </Pressable>
        {isPending && (
          <ActivityIndicator size="small" color={colors.textMuted} />
        )}
      </View>

      {!!item.content && (
        <MentionText
          content={item.content}
          textStyle={styles.bubbleContent}
          onMentionPress={onMentionPress}
        />
      )}

      {!!item.shared_post && (
        <View style={styles.sharedPostWrapper}>
          <SharedPostCard
            post={item.shared_post}
            onPress={
              onSharedPostPress && item.shared_post.id
                ? () => onSharedPostPress(
                    item.shared_post!.id!,
                    item.shared_post!.item_type === 'checkin' ? 'checkin'
                      : item.shared_post!.workout ? 'workout' : 'post',
                  )
                : undefined
            }
          />
        </View>
      )}

      {item.media.length > 0 && (
        <View style={styles.mediaGrid}>
          {item.media.map((m, i) =>
            m.kind === 'video' ? (
              <Pressable key={i} onPress={() => onVideoPress(m.url)}>
                <VideoThumbnail
                  videoUrl={m.url}
                  thumbnailUrl={m.thumbnail_url}
                  style={styles.mediaThumb}
                />
              </Pressable>
            ) : (
              <Image
                key={i}
                source={{ uri: m.thumbnail_url ?? m.url }}
                style={styles.mediaThumb}
                resizeMode="cover"
              />
            )
          )}
        </View>
      )}

      {item.poll && !isPending && (
        <PollCard
          poll={item.poll}
          orgId={orgId}
          announcementId={item.id}
          onVoted={(p) => onVoted(item.id, p)}
        />
      )}

      {!isPending && !isFailed && (
        <ReactionRow
          reactions={item.reactions}
          onReact={(emoji) => onReact(item.id, emoji)}
          onLongPressReaction={() => onLongPressReaction(item.id)}
        />
      )}

      {isFailed && (
        <Pressable style={styles.retryRow} onPress={() => onRetry(item)}>
          <Feather name="alert-circle" size={14} color="#ef4444" />
          <Text style={styles.retryText}>Failed to post. Tap to retry.</Text>
        </Pressable>
      )}
    </Pressable>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function OrgAnnouncementsScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { user: me } = useAuth();
  const { refresh: refreshUnread } = useUnreadCount();
  const { orgId, orgName, orgAvatar } = route.params;

  const [announcements, setAnnouncements] = useState<AnnouncementListItem[]>(
    () => staleCache.getSync<CachedOrgAnn>(`org:ann:${orgId}`)?.announcements ?? [],
  );
  const [loading, setLoading] = useState(
    () => staleCache.getSync<CachedOrgAnn>(`org:ann:${orgId}`) === null,
  );
  const [hasMore, setHasMore] = useState(
    () => staleCache.getSync<CachedOrgAnn>(`org:ann:${orgId}`)?.has_more ?? false,
  );
  const [oldestId, setOldestId] = useState<string | null>(
    () => staleCache.getSync<CachedOrgAnn>(`org:ann:${orgId}`)?.oldest_id ?? null,
  );
  const [loadingMore, setLoadingMore] = useState(false);
  const [userRole, setUserRole] = useState<'creator' | 'admin' | 'member' | null>(
    () => staleCache.getSync<CachedOrgAnn>(`org:ann:${orgId}`)?.userRole ?? null,
  );

  // ── Long-press context menu ──────────────────────────────────────────────
  const [contextItem, setContextItem] = useState<OptimisticAnnouncement | null>(null);
  const [contextVisible, setContextVisible] = useState(false);
  const [contextPageY, setContextPageY] = useState(0);
  const [reactionDetailAnnId, setReactionDetailAnnId] = useState<string | null>(null);

  // ── Create announcement sheet ────────────────────────────────────────────
  const [sheetVisible, setSheetVisible] = useState(false);
  const [draftText, setDraftText] = useState('');
  const [draftMediaUris, setDraftMediaUris] = useState<string[]>([]);
  const [draftMediaIds, setDraftMediaIds] = useState<string[]>([]);
  const [draftMediaTypes, setDraftMediaTypes] = useState<Array<'image' | 'video'>>([]);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [picking, setPicking] = useState(false);
  // Poll builder
  const [showPollBuilder, setShowPollBuilder] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState(['', '']);
  const [pollDuration, setPollDuration] = useState(24);
  const [submitting, setSubmitting] = useState(false);

  const isAdmin = userRole === 'creator' || userRole === 'admin';
  const myUserId = String(me?.id ?? '');
  const [mentionableUsers, setMentionableUsers] = useState<MentionableUser[]>([]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);

  const detectMention = useCallback((value: string) => {
    const match = value.match(/@([\w.\-]*)$/);
    setMentionQuery(match ? match[1] : null);
  }, []);

  const handleMentionSelect = useCallback((user: MentionableUser) => {
    setDraftText(prev => prev.replace(/@([\w.\-]*)$/, `@${user.username} `));
    setMentionQuery(null);
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    listOrgMembers(orgId).then(members =>
      setMentionableUsers(
        members
          .filter(m => String(m.user_id) !== myUserId)
          .map(m => ({
            id: String(m.user_id),
            username: m.username,
            display_name: m.display_name,
            avatar_url: m.avatar_url,
          })),
      ),
    ).catch(() => {});
  }, [orgId, isAdmin, myUserId]);

  const flatRef = useRef<FlatList>(null);
  const [videoPlayerUrl, setVideoPlayerUrl] = useState<string | null>(null);
  const _mountTime = useRef(Date.now());

  // ── Load announcements ───────────────────────────────────────────────────

  const loadInitial = useCallback(async () => {
    const cacheKey = `org:ann:${orgId}`;

    // ── Serve cached data immediately (skip spinner) ──────────────────────────
    const cached = await staleCache.get<CachedOrgAnn>(cacheKey);
    if (cached) {
      setAnnouncements(cached.announcements);
      setHasMore(cached.has_more);
      setOldestId(cached.oldest_id);
      setUserRole(cached.userRole);
    } else {
      setLoading(true);
    }

    // ── Always fetch fresh in background ─────────────────────────────────────
    const t0 = Date.now();
    try {
      const [page, detail] = await Promise.all([
        fetchAnnouncements(orgId, { limit: 30 }),
        fetchOrgDetail(orgId),
      ]);
      const fetchMs = Date.now() - t0;
      // Store oldest-first so the non-inverted FlatList shows oldest at top, newest at bottom.
      // API returns newest-first, so we reverse before storing.
      const reversed = [...page.results].reverse();
      const firstUnreadIdx = reversed.findIndex(a => !a.is_read);
      const listItems: AnnouncementListItem[] = firstUnreadIdx > 0
        ? [
            ...reversed.slice(0, firstUnreadIdx),
            { id: '__new_divider__', isDivider: true as const },
            ...reversed.slice(firstUnreadIdx),
          ]
        : reversed;
      staleCache.set(cacheKey, { announcements: listItems, has_more: page.has_more, oldest_id: page.oldest_id, userRole: detail.user_role }, 5 * 60 * 1000);
      setAnnouncements(listItems);
      // Scroll to bottom to show the latest announcement (like the messages screen).
      setTimeout(() => flatRef.current?.scrollToEnd({ animated: false }), 50);
      setHasMore(page.has_more);
      setOldestId(page.oldest_id);
      setUserRole(detail.user_role);
      // Mark as read and refresh the global unread badge.
      markAnnouncementsRead(orgId).then(refreshUnread).catch(() => {});
      if (__DEV__) {
        const mediaCount = page.results.filter(a => a.media && a.media.length > 0).length;
        const totalMs = Date.now() - _mountTime.current;
        console.log(
          `[ChatLoad] Announcements | org=${orgId} | fetch=${fetchMs}ms | total=${totalMs}ms` +
          ` | posts=${page.results.length} | withMedia=${mediaCount} | hasMore=${page.has_more}`,
        );
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useFocusEffect(useCallback(() => { loadInitial(); }, [loadInitial]));

  // ── WebSocket: subscribe and handle live announcements ───────────────────

  useEffect(() => {
    wsManager.subscribeOrg(orgId);

    const handler = (announcement: Announcement) => {
      if (announcement.org !== orgId) return;
      setAnnouncements(prev => {
        // Dedup: skip if we already have an item with this real ID
        if (prev.some(a => isAnn(a) && a.id === announcement.id)) return prev;
        return [...prev, announcement];
      });
    };

    wsManager.on('new_announcement', handler);

    // Re-subscribe after a WS reconnect
    const onConnected = () => wsManager.subscribeOrg(orgId);
    wsManager.on('connected', onConnected);

    return () => {
      wsManager.off('new_announcement', handler);
      wsManager.off('connected', onConnected);
    };
  }, [orgId]);

  const loadMore = async () => {
    if (!hasMore || loadingMore || !oldestId) return;
    setLoadingMore(true);
    try {
      const page = await fetchAnnouncements(orgId, { before_id: oldestId, limit: 30 });
      // Prepend older items (reversed to oldest-first) at the front of the list.
      setAnnouncements(prev => [...page.results.reverse(), ...prev]);
      setHasMore(page.has_more);
      setOldestId(page.oldest_id);
    } catch {
      // ignore
    } finally {
      setLoadingMore(false);
    }
  };

  // ── Reactions ────────────────────────────────────────────────────────────

  const handleReact = async (announcementId: string, emoji: string) => {
    try {
      const res = await reactToAnnouncement(orgId, announcementId, emoji);
      setAnnouncements(prev =>
        prev.map(a => isAnn(a) && a.id === announcementId ? { ...a, reactions: res.reactions } : a),
      );
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    const myId = me?.id ? String(me.id) : null;
    const handler = (data: { announcement_id: string; org_id: string; reactions: Array<{ emoji: string; count: number; reactor_ids: string[] }> }) => {
      if (data.org_id !== orgId) return;
      setAnnouncements(prev =>
        prev.map(a =>
          isAnn(a) && a.id === data.announcement_id
            ? {
                ...a,
                reactions: data.reactions.map(r => ({
                  emoji: r.emoji,
                  count: r.count,
                  user_reacted: myId ? r.reactor_ids.includes(myId) : false,
                })),
              }
            : a,
        ),
      );
    };
    wsManager.on('announcement_reaction_update', handler);
    return () => wsManager.off('announcement_reaction_update', handler);
  }, [orgId, me?.id]);

  // ── Poll voted ───────────────────────────────────────────────────────────

  const handlePollVoted = (announcementId: string, poll: AnnouncementPoll) => {
    setAnnouncements(prev =>
      prev.map(a => isAnn(a) && a.id === announcementId ? { ...a, poll } : a),
    );
  };

  // ── Long-press context ───────────────────────────────────────────────────

  const handleLongPress = (item: OptimisticAnnouncement, pageY: number) => {
    // Only allow context menu on fully-delivered items
    if (item._status) return;
    setContextItem(item);
    setContextPageY(pageY);
    setContextVisible(true);
  };

  const handleContextReact = async (emoji: string) => {
    if (!contextItem) return;
    setContextVisible(false);
    await handleReact(contextItem.id, emoji);
  };

  const handleContextCopy = () => {
    if (!contextItem) return;
    setContextVisible(false);
    Clipboard.setStringAsync(contextItem.content ?? '');
  };

  const handleContextSave = async () => {
    if (!contextItem?.media?.length) return;
    setContextVisible(false);
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Allow camera roll access to save media.');
        return;
      }
      for (const m of contextItem.media) {
        let filename = m.url.split('/').pop()?.split('?')[0] ?? '';
        if (!filename.includes('.')) {
          filename = `spottr_${Date.now()}.${m.kind === 'video' ? 'mp4' : 'jpg'}`;
        }
        const dest = `${FileSystem.cacheDirectory}${filename}`;
        const result = await FileSystem.downloadAsync(m.url, dest);
        if (result.status !== 200) throw new Error(`Download failed (${result.status})`);
        await MediaLibrary.createAssetAsync(result.uri);
      }
      Alert.alert('Saved', 'Media saved to your camera roll.');
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Failed to save media.');
    }
  };

  const handleContextDelete = async () => {
    if (!contextItem) return;
    setContextVisible(false);
    Alert.alert('Delete Announcement', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteAnnouncement(orgId, contextItem.id);
            setAnnouncements(prev => prev.filter(a => !isAnn(a) || a.id !== contextItem.id));
          } catch {
            Alert.alert('Error', 'Failed to delete announcement.');
          }
        },
      },
    ]);
  };

  // ── Create announcement (optimistic) ────────────────────────────────────

  const handlePickMedia = async () => {
    setPicking(true);
    let items;
    try {
      items = await pickMedia({ allowsMultiple: true });
    } finally {
      setPicking(false);
    }
    if (!items) return;
    setDraftMediaUris(prev => [...prev, ...items.map(i => i.uri)]);
    setDraftMediaTypes(prev => [...prev, ...items.map(i => i.kind)]);
    setUploadingMedia(true);
    try {
      const ids: string[] = [];
      for (const item of items) {
        const res = await uploadMedia(item.uri, item.kind, item.mimeType);
        ids.push(res.asset_id);
      }
      setDraftMediaIds(prev => [...prev, ...ids]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to upload one or more files.';
      Alert.alert('Upload failed', msg);
    } finally {
      setUploadingMedia(false);
    }
  };

  const resetSheet = () => {
    setDraftText('');
    setDraftMediaUris([]);
    setDraftMediaIds([]);
    setDraftMediaTypes([]);
    setShowPollBuilder(false);
    setPollQuestion('');
    setPollOptions(['', '']);
    setPollDuration(24);
    setSheetVisible(false);
  };

  const submitPayload = async (payload: CreateAnnouncementPayload, clientId: string) => {
    try {
      const real = await createAnnouncement(orgId, payload);
      setAnnouncements(prev => {
        // If the WS push already added the real item, just remove the optimistic one
        if (prev.some(a => isAnn(a) && a.id === real.id && !a._clientId)) {
          return prev.filter(a => !isAnn(a) || a._clientId !== clientId);
        }
        // Otherwise replace the optimistic item with the confirmed one
        return prev.map(a => (isAnn(a) && a._clientId === clientId ? { ...real } : a));
      });
    } catch {
      setAnnouncements(prev =>
        prev.map(a => (isAnn(a) && a._clientId === clientId ? { ...a, _status: 'failed' } : a)),
      );
    }
  };

  const handleSubmit = async () => {
    if (submitting) return;
    const payload: CreateAnnouncementPayload = {};
    if (draftText.trim()) payload.content = draftText.trim();
    if (draftMediaIds.length > 0) payload.media_ids = draftMediaIds;
    if (showPollBuilder) {
      const opts = pollOptions.filter(o => o.trim());
      if (!pollQuestion.trim() || opts.length < 2) {
        Alert.alert('Incomplete poll', 'Please fill in the poll question and at least 2 options before posting.');
        return;
      }
      payload.poll = {
        question: pollQuestion.trim(),
        duration_hours: pollDuration,
        options: opts,
      };
    }
    if (!payload.content && !payload.media_ids && !payload.poll) {
      Alert.alert('Empty announcement', 'Add text, media, or a poll.');
      return;
    }

    const clientId = genClientId();

    // Insert optimistic item immediately so the user sees it right away
    const optimistic: OptimisticAnnouncement = {
      id: clientId,
      org: orgId,
      author_id: me?.id ?? '',
      author_username: me?.username ?? '',
      author_display_name: me?.display_name ?? me?.username ?? '',
      author_avatar_url: me?.avatar_url ?? null,
      content: payload.content ?? '',
      media: [],
      poll: null,
      reactions: [],
      created_at: new Date().toISOString(),
      _clientId: clientId,
      _status: 'pending',
      _retryPayload: payload,
    };

    setSubmitting(true);
    setAnnouncements(prev => [...prev, optimistic]);
    resetSheet(); // close sheet and clear draft immediately
    setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 50);

    await submitPayload(payload, clientId);
    setSubmitting(false);
  };

  // ── Retry a failed optimistic item ──────────────────────────────────────

  const handleRetry = async (item: OptimisticAnnouncement) => {
    if (!item._clientId || !item._retryPayload) return;
    const { _clientId: clientId, _retryPayload: payload } = item;

    // Reset to pending state
    setAnnouncements(prev =>
      prev.map(a => (isAnn(a) && a._clientId === clientId ? { ...a, _status: 'pending' } : a)),
    );

    await submitPayload(payload, clientId);
  };

  // ── Render ───────────────────────────────────────────────────────────────

  const renderItem = ({ item }: { item: AnnouncementListItem }) => {
    if (!isAnn(item)) {
      return (
        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerLabel}>NEW</Text>
          <View style={styles.dividerLine} />
        </View>
      );
    }
    return (
      <AnnouncementBubble
        item={item}
        orgId={orgId}
        isAdmin={isAdmin}
        onLongPress={handleLongPress}
        onReact={handleReact}
        onLongPressReaction={setReactionDetailAnnId}
        onVoted={handlePollVoted}
        onRetry={handleRetry}
        onVideoPress={setVideoPlayerUrl}
        onMentionPress={(u) => navigation.navigate('Profile', { username: u })}
        onAuthorPress={(u) => navigation.navigate('Profile', { username: u })}
        onSharedPostPress={(postId, itemType) => navigation.navigate('PostDetail', { postId, itemType })}
      />
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background.base }}>
      {/* Header */}
      <LinearGradient
        colors={['#4FC3E0', '#6DCFE8', '#A8E2F4', colors.background.base]}
        locations={[0, 0.25, 0.6, 1]}
        style={{ paddingTop: insets.top }}
      >
        <View style={styles.header}>
          <Pressable style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Feather name="arrow-left" size={22} color={colors.textPrimary} />
          </Pressable>
          <Pressable
            style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}
            onPress={() => navigation.navigate('OrgProfile', { orgId })}
          >
            <Avatar uri={orgAvatar} name={orgName} size={34} />
            <View style={{ marginLeft: 10, flex: 1 }}>
              <Text style={styles.headerTitle} numberOfLines={1}>{orgName}</Text>
              <Text style={styles.headerSubtitle}>Announcements</Text>
            </View>
          </Pressable>
          <Pressable
            style={styles.profileBtn}
            onPress={() => navigation.navigate('OrgProfile', { orgId })}
          >
            <Feather name="info" size={20} color={colors.primary} />
          </Pressable>
        </View>
      </LinearGradient>

      {/* Announcements list */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          ref={flatRef}
          data={announcements}
          keyExtractor={(item) => isAnn(item) ? (item._clientId ?? item.id) : item.id}
          renderItem={renderItem}
          contentContainerStyle={{
            paddingTop: spacing.md,
            paddingBottom: insets.bottom + (isAdmin ? 90 : 24),
            paddingHorizontal: spacing.base,
          }}
          maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
          onScroll={(e) => {
            if (e.nativeEvent.contentOffset.y < 80 && hasMore && !loadingMore) {
              loadMore();
            }
          }}
          scrollEventThrottle={200}
          ListHeaderComponent={
            loadingMore
              ? <ActivityIndicator color={colors.primary} style={{ padding: spacing.md }} />
              : null
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Feather name="bell" size={40} color={colors.textMuted} />
              <Text style={styles.emptyTitle}>No announcements yet</Text>
              {isAdmin && (
                <Text style={styles.emptySubtitle}>Tap + to post the first one</Text>
              )}
            </View>
          }
        />
      )}

      {/* Admin FAB */}
      {isAdmin && (
        <Pressable
          style={[styles.fab, { bottom: insets.bottom + 20 }]}
          onPress={() => setSheetVisible(true)}
        >
          <Feather name="plus" size={24} color="#fff" />
        </Pressable>
      )}

      {/* Long-press context menu — focused view */}
      <Modal
        visible={contextVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setContextVisible(false)}
      >
        <BlurView intensity={55} tint="dark" style={StyleSheet.absoluteFill}>
        <Pressable style={styles.contextOverlay} onPress={() => setContextVisible(false)}>
          {(() => {
            const SCREEN_H = Dimensions.get('window').height;
            const EMOJI_H = 64;
            const GAP = 12;
            const hasMedia = !!(contextItem?.media?.length);
            const hasPoll = !!contextItem?.poll;
            const PREVIEW_EST_H = (hasMedia ? 300 : 160) + (hasPoll ? 150 : 0);
            const ACTIONS_EST_H = 150;
            const rawTop = contextPageY - EMOJI_H - GAP;
            const maxTop = SCREEN_H - EMOJI_H - GAP - PREVIEW_EST_H - GAP - ACTIONS_EST_H - 16;
            const clampedTop = Math.max(insets.top + 8, Math.min(rawTop, maxTop));
            return (
              <View style={[styles.contextContent, { top: clampedTop }]}>
                {/* 1. Emoji reactions bar */}
                <View style={styles.contextEmojiBar}>
                  {EMOJI_QUICK.map((e) => (
                    <Pressable key={e} style={styles.emojiBtn} onPress={() => handleContextReact(e)}>
                      <Text style={styles.emojiText}>{e}</Text>
                    </Pressable>
                  ))}
                </View>

                {/* 2. Announcement preview — mirrors the full AnnouncementBubble card */}
                {contextItem && (
                  <Pressable style={styles.contextPreviewCard} onPress={() => {}}>
                    {/* Author header */}
                    <View style={styles.contextAnnHeader}>
                      <Avatar uri={contextItem.author_avatar_url} name={contextItem.author_display_name} size={28} />
                      <View style={{ marginLeft: 8, flex: 1 }}>
                        <Text style={styles.contextAnnAuthor}>{contextItem.author_display_name}</Text>
                        <Text style={styles.contextAnnTime}>{timeAgo(contextItem.created_at)}</Text>
                      </View>
                    </View>

                    {/* Text content */}
                    {!!contextItem.content && (
                      <Text style={styles.contextAnnContent} numberOfLines={5}>
                        {contextItem.content}
                      </Text>
                    )}

                    {/* Media */}
                    {!!contextItem.media?.length && (
                      <View style={styles.contextMediaRow}>
                        {contextItem.media.map((m, idx) =>
                          m.kind === 'video' ? (
                            <VideoThumbnail
                              key={idx}
                              videoUrl={m.url}
                              thumbnailUrl={m.thumbnail_url}
                              style={styles.contextMediaThumb}
                              iconSize={28}
                            />
                          ) : (
                            <Image key={idx} source={{ uri: m.thumbnail_url ?? m.url }} style={styles.contextMediaThumb} resizeMode="cover" />
                          )
                        )}
                      </View>
                    )}

                    {/* Poll */}
                    {!!contextItem.poll && (
                      <PollCard
                        poll={contextItem.poll}
                        orgId={orgId}
                        announcementId={contextItem.id}
                        onVoted={(p) => {
                          handlePollVoted(contextItem.id, p);
                          setContextVisible(false);
                        }}
                      />
                    )}
                  </Pressable>
                )}

                {/* 3. Action buttons */}
                <Pressable style={styles.contextActionsCard} onPress={() => {}}>
                  {!!contextItem?.content && (
                    <Pressable style={styles.contextAction} onPress={handleContextCopy}>
                      <Feather name="copy" size={16} color={colors.textPrimary} />
                      <Text style={styles.contextActionText}>Copy Text</Text>
                    </Pressable>
                  )}
                  {!!contextItem?.content && !!(contextItem?.media?.length) && (
                    <View style={styles.contextDivider} />
                  )}
                  {!!(contextItem?.media?.length) && (
                    <Pressable style={styles.contextAction} onPress={handleContextSave}>
                      <Feather name="download" size={16} color={colors.textPrimary} />
                      <Text style={styles.contextActionText}>Save to Camera Roll</Text>
                    </Pressable>
                  )}
                  {isAdmin && (!!contextItem?.content || !!(contextItem?.media?.length)) && (
                    <View style={styles.contextDivider} />
                  )}
                  {isAdmin && (
                    <Pressable style={styles.contextAction} onPress={handleContextDelete}>
                      <Feather name="trash-2" size={16} color="#ef4444" />
                      <Text style={[styles.contextActionText, { color: '#ef4444' }]}>Delete</Text>
                    </Pressable>
                  )}
                </Pressable>
              </View>
            );
          })()}
        </Pressable>
        </BlurView>
      </Modal>

      {videoPlayerUrl != null && (
        <VideoPlayerModal url={videoPlayerUrl} onClose={() => setVideoPlayerUrl(null)} />
      )}

      <ReactionDetailModal
        visible={reactionDetailAnnId != null}
        onClose={() => setReactionDetailAnnId(null)}
        fetchDetails={() => fetchAnnouncementReactionDetails(orgId, reactionDetailAnnId!)}
      />

      {/* Create announcement bottom sheet */}
      <Modal
        visible={sheetVisible}
        transparent
        animationType="slide"
        onRequestClose={resetSheet}
      >
        <KeyboardAvoidingView
          style={styles.sheetOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={resetSheet} />
          <View style={[styles.sheetCard, { paddingBottom: insets.bottom + spacing.md }]}>
            {/* Sheet header */}
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>New Announcement</Text>
              <Pressable onPress={resetSheet}>
                <Feather name="x" size={18} color={colors.textSecondary} />
              </Pressable>
            </View>

            {mentionQuery !== null && (
              <MentionAutocomplete
                query={mentionQuery}
                users={mentionableUsers}
                onSelect={handleMentionSelect}
              />
            )}
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              {/* Text input */}
              <TextInput
                style={styles.sheetInput}
                placeholder="Write an announcement…"
                placeholderTextColor={colors.textMuted}
                value={draftText}
                onChangeText={(v) => { detectMention(v); setDraftText(v); }}
                multiline
                maxLength={5000}
              />

              {/* Media previews */}
              {draftMediaUris.length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
                  {draftMediaUris.map((uri, i) => (
                    <View key={i} style={styles.draftMediaWrap}>
                      {draftMediaTypes[i] === 'video' ? (
                        <VideoThumbnail
                          videoUrl={uri}
                          thumbnailUrl={null}
                          style={styles.draftMediaThumb}
                          iconSize={16}
                        />
                      ) : (
                        <Image source={{ uri }} style={styles.draftMediaThumb} resizeMode="cover" />
                      )}
                      <Pressable
                        style={styles.draftMediaRemove}
                        onPress={() => {
                          setDraftMediaUris(prev => prev.filter((_, j) => j !== i));
                          setDraftMediaIds(prev => prev.filter((_, j) => j !== i));
                          setDraftMediaTypes(prev => prev.filter((_, j) => j !== i));
                        }}
                      >
                        <Feather name="x" size={12} color="#fff" />
                      </Pressable>
                    </View>
                  ))}
                  {uploadingMedia && (
                    <View style={[styles.draftMediaThumb, styles.draftMediaUploading]}>
                      <ActivityIndicator color="#fff" size="small" />
                    </View>
                  )}
                </ScrollView>
              )}

              {/* Poll builder */}
              {showPollBuilder && (
                <View style={styles.pollBuilder}>
                  <Text style={styles.pollBuilderTitle}>Poll</Text>
                  <TextInput
                    style={styles.pollQuestion}
                    placeholder="Poll question…"
                    placeholderTextColor={colors.textMuted}
                    value={pollQuestion}
                    onChangeText={setPollQuestion}
                    maxLength={280}
                  />
                  {pollOptions.map((opt, i) => (
                    <View key={i} style={styles.pollOptionRow}>
                      <TextInput
                        style={[styles.pollOptionInput, { flex: 1 }]}
                        placeholder={`Option ${i + 1}`}
                        placeholderTextColor={colors.textMuted}
                        value={opt}
                        onChangeText={(v) =>
                          setPollOptions(prev => prev.map((o, j) => j === i ? v : o))
                        }
                        maxLength={100}
                      />
                      {pollOptions.length > 2 && (
                        <Pressable
                          onPress={() => setPollOptions(prev => prev.filter((_, j) => j !== i))}
                          style={{ padding: 6 }}
                        >
                          <Feather name="minus-circle" size={16} color={colors.textMuted} />
                        </Pressable>
                      )}
                    </View>
                  ))}
                  {pollOptions.length < 6 && (
                    <Pressable
                      style={styles.addOptionBtn}
                      onPress={() => setPollOptions(prev => [...prev, ''])}
                    >
                      <Feather name="plus" size={14} color={colors.primary} />
                      <Text style={styles.addOptionText}>Add option</Text>
                    </Pressable>
                  )}
                  <View style={styles.durationRow}>
                    <Text style={styles.durationLabel}>Duration:</Text>
                    {[12, 24, 48, 72].map((h) => (
                      <Pressable
                        key={h}
                        style={[styles.durationChip, pollDuration === h && styles.durationChipActive]}
                        onPress={() => setPollDuration(h)}
                      >
                        <Text style={[styles.durationChipText, pollDuration === h && styles.durationChipTextActive]}>
                          {h}h
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              )}
            </ScrollView>

            {/* Action bar */}
            <View style={styles.sheetActions}>
              <Pressable style={styles.sheetActionBtn} onPress={handlePickMedia} disabled={picking || uploadingMedia}>
                {picking
                  ? <ActivityIndicator size="small" color={colors.primary} />
                  : <Feather name="image" size={20} color={colors.primary} />
                }
              </Pressable>
              <Pressable
                style={[styles.sheetActionBtn, showPollBuilder && styles.sheetActionBtnActive]}
                onPress={() => setShowPollBuilder(!showPollBuilder)}
              >
                <Feather name="bar-chart-2" size={20} color={showPollBuilder ? '#fff' : colors.primary} />
              </Pressable>
              <View style={{ flex: 1 }} />
              <Pressable
                style={[styles.sendBtn, submitting && { opacity: 0.6 }]}
                onPress={handleSubmit}
                disabled={submitting || uploadingMedia}
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.sendBtnText}>Post</Text>
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
  backBtn: { marginRight: spacing.sm, padding: 4 },
  headerTitle: { fontSize: typography.size.md, fontWeight: '700', color: colors.textPrimary },
  headerSubtitle: { fontSize: typography.size.xs, color: colors.textSecondary },
  profileBtn: { padding: 6 },

  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.primary,
    opacity: 0.4,
  },
  dividerLabel: {
    fontSize: typography.size.xs,
    fontWeight: '700',
    color: colors.primary,
    letterSpacing: 1,
  },

  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  emptyTitle: {
    fontSize: typography.size.md,
    fontWeight: '600',
    color: colors.textSecondary,
    marginTop: spacing.md,
  },
  emptySubtitle: {
    fontSize: typography.size.sm,
    color: colors.textMuted,
    marginTop: 4,
  },

  // Bubble
  bubble: {
    backgroundColor: colors.background.card,
    borderRadius: 14,
    padding: spacing.md,
    marginBottom: spacing.sm,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  bubblePending: {
    opacity: 0.65,
  },
  bubbleFailed: {
    borderWidth: 1,
    borderColor: '#ef444440',
  },
  bubbleHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  bubbleAuthorRow: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  bubbleAuthor: { fontSize: typography.size.sm, fontWeight: '700', color: colors.textPrimary },
  bubbleTime: { fontSize: typography.size.xs, color: colors.textMuted },
  bubbleContent: { fontSize: typography.size.sm, color: colors.textPrimary, lineHeight: 20 },

  sharedPostWrapper: { marginTop: 8 },
  mediaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 8 },
  mediaThumb: { width: 100, height: 100, borderRadius: 8 },
  videoThumb: { backgroundColor: '#000', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  draftVideoPlaceholder: { backgroundColor: colors.background.elevated, alignItems: 'center', justifyContent: 'center' },

  // Retry row (failed state)
  retryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#ef444430',
  },
  retryText: {
    fontSize: typography.size.xs,
    color: '#ef4444',
  },

  // FAB
  fab: {
    position: 'absolute',
    right: spacing.base,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },

  // Context menu
  contextOverlay: {
    flex: 1,
  },
  contextContent: {
    position: 'absolute',
    left: spacing.xl,
    right: spacing.xl,
    gap: 12,
  },
  contextEmojiBar: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    backgroundColor: colors.background.card,
    borderRadius: 32,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
  },
  emojiBtn: { padding: 8 },
  emojiText: { fontSize: 28 },
  contextPreviewCard: {
    width: '100%',
    backgroundColor: colors.background.card,
    borderRadius: 16,
    padding: spacing.md,
    gap: spacing.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 6,
  },
  contextAnnHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  contextAnnAuthor: {
    fontSize: typography.size.sm,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  contextAnnTime: {
    fontSize: typography.size.xs,
    color: colors.textMuted,
    marginTop: 1,
  },
  contextAnnContent: {
    fontSize: typography.size.sm,
    lineHeight: 20,
    color: colors.textPrimary,
  },
  contextMediaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  contextMediaThumb: {
    width: 160,
    height: 160,
    borderRadius: 12,
    backgroundColor: '#111',
    overflow: 'hidden',
  },
  contextActionsCard: {
    width: '100%',
    backgroundColor: colors.background.card,
    borderRadius: 16,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 6,
  },
  contextDivider: { height: 1, backgroundColor: colors.borderColor },
  contextAction: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    gap: 12,
  },
  contextActionText: { fontSize: typography.size.sm, color: colors.textPrimary, fontWeight: '500' },

  // Create announcement sheet
  sheetOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  sheetCard: {
    backgroundColor: colors.background.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: spacing.base,
    maxHeight: '85%',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  sheetTitle: { fontSize: typography.size.md, fontWeight: '700', color: colors.textPrimary },
  sheetInput: {
    fontSize: typography.size.sm,
    color: colors.textPrimary,
    minHeight: 80,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: colors.borderColor,
    borderRadius: 10,
    padding: spacing.sm,
  },

  draftMediaWrap: { position: 'relative', marginRight: 8 },
  draftMediaThumb: { width: 72, height: 72, borderRadius: 8 },
  draftMediaUploading: { backgroundColor: 'rgba(0,0,0,0.3)', alignItems: 'center', justifyContent: 'center' },
  draftMediaRemove: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: '#333',
    borderRadius: 10,
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Poll builder
  pollBuilder: {
    marginTop: spacing.md,
    backgroundColor: 'rgba(0,0,0,0.03)',
    borderRadius: 10,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderColor,
  },
  pollBuilderTitle: { fontSize: typography.size.sm, fontWeight: '700', color: colors.textPrimary, marginBottom: 8 },
  pollQuestion: {
    borderWidth: 1,
    borderColor: colors.borderColor,
    borderRadius: 8,
    padding: spacing.sm,
    fontSize: typography.size.sm,
    color: colors.textPrimary,
    marginBottom: 8,
  },
  pollOptionRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  pollOptionInput: {
    borderWidth: 1,
    borderColor: colors.borderColor,
    borderRadius: 8,
    padding: spacing.sm,
    fontSize: typography.size.sm,
    color: colors.textPrimary,
  },
  addOptionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  addOptionText: { fontSize: typography.size.xs, color: colors.primary },
  durationRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 6 },
  durationLabel: { fontSize: typography.size.xs, color: colors.textMuted, marginRight: 4 },
  durationChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderColor,
  },
  durationChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  durationChipText: { fontSize: typography.size.xs, color: colors.textMuted },
  durationChipTextActive: { color: '#fff', fontWeight: '600' },

  // Sheet actions
  sheetActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  sheetActionBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(79,195,224,0.1)',
  },
  sheetActionBtnActive: { backgroundColor: colors.primary },
  sendBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    borderRadius: 20,
    minWidth: 70,
    alignItems: 'center',
  },
  sendBtnText: { color: '#fff', fontWeight: '700', fontSize: typography.size.sm },
});
