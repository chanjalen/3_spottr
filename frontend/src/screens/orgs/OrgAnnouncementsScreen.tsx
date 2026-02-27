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
  Clipboard,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { pickMedia } from '../../utils/pickMedia';
import { VideoView, useVideoPlayer } from 'expo-video';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp, useFocusEffect } from '@react-navigation/native';
import Avatar from '../../components/common/Avatar';
import VideoThumbnail from '../../components/common/VideoThumbnail';
import {
  fetchAnnouncements,
  createAnnouncement,
  deleteAnnouncement,
  reactToAnnouncement,
  voteOnPoll,
  markAnnouncementsRead,
  uploadMedia,
  fetchOrgDetail,
  Announcement,
  AnnouncementPoll,
  OrgDetail,
  CreateAnnouncementPayload,
} from '../../api/organizations';
import { useAuth } from '../../store/AuthContext';
import { useUnreadCount } from '../../store/UnreadCountContext';
import { colors, spacing, typography } from '../../theme';
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
  const [voting, setVoting] = useState(false);

  const totalVotes = poll.total_votes;

  const handleVote = async (optionId: string) => {
    if (!poll.is_active || poll.user_voted_option_id || voting) return;
    setVoting(true);
    try {
      const res = await voteOnPoll(orgId, announcementId, optionId);
      onVoted(res.poll);
    } catch {
      Alert.alert('Error', 'Failed to cast vote.');
    } finally {
      setVoting(false);
    }
  };

  return (
    <View style={pollStyles.container}>
      <Text style={pollStyles.question}>{poll.question}</Text>
      {poll.options.map((opt) => {
        const pct = totalVotes > 0 ? Math.round((opt.votes / totalVotes) * 100) : 0;
        const isVoted = opt.user_voted;
        const showResult = !!poll.user_voted_option_id || !poll.is_active;
        return (
          <Pressable
            key={opt.id}
            style={[
              pollStyles.option,
              isVoted && pollStyles.optionVoted,
              !poll.is_active && pollStyles.optionInactive,
            ]}
            onPress={() => handleVote(opt.id)}
            disabled={showResult || voting}
          >
            {showResult && (
              <View style={[pollStyles.bar, { width: `${pct}%` as any }]} />
            )}
            <Text style={[pollStyles.optionText, isVoted && pollStyles.optionTextVoted]}>
              {opt.text}
            </Text>
            {showResult && (
              <Text style={pollStyles.pct}>{pct}%</Text>
            )}
            {isVoted && <Feather name="check" size={12} color={colors.primary} style={{ marginLeft: 4 }} />}
          </Pressable>
        );
      })}
      <Text style={pollStyles.meta}>
        {totalVotes} {totalVotes !== 1 ? 'votes' : 'vote'} {'\u2022'} {poll.is_active ? 'Active' : 'Ended'}
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
}: {
  reactions: Announcement['reactions'];
  onReact: (emoji: string) => void;
}) {
  if (reactions.length === 0) return null;
  return (
    <View style={rxStyles.row}>
      {reactions.map((r) => (
        <Pressable
          key={r.emoji}
          style={[rxStyles.chip, r.user_reacted && rxStyles.chipActive]}
          onPress={() => onReact(r.emoji)}
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
  onVoted,
  onRetry,
  onVideoPress,
}: {
  item: OptimisticAnnouncement;
  orgId: string;
  isAdmin: boolean;
  onLongPress: (item: OptimisticAnnouncement) => void;
  onReact: (announcementId: string, emoji: string) => void;
  onVoted: (announcementId: string, poll: AnnouncementPoll) => void;
  onRetry: (item: OptimisticAnnouncement) => void;
  onVideoPress: (url: string) => void;
}) {
  const isPending = item._status === 'pending';
  const isFailed = item._status === 'failed';

  return (
    <Pressable
      style={[styles.bubble, isPending && styles.bubblePending, isFailed && styles.bubbleFailed]}
      onLongPress={() => !isPending && !isFailed && onLongPress(item)}
      delayLongPress={400}
    >
      <View style={styles.bubbleHeader}>
        <Avatar uri={item.author_avatar_url} name={item.author_display_name} size={32} />
        <View style={{ marginLeft: 8, flex: 1 }}>
          <Text style={styles.bubbleAuthor}>{item.author_display_name}</Text>
          {!isPending && (
            <Text style={styles.bubbleTime}>{timeAgo(item.created_at)}</Text>
          )}
        </View>
        {isPending && (
          <ActivityIndicator size="small" color={colors.textMuted} />
        )}
      </View>

      {!!item.content && (
        <Text style={styles.bubbleContent}>{item.content}</Text>
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
        />
      )}

      {isFailed && (
        <Pressable style={styles.retryRow} onPress={() => onRetry(item)}>
          <Feather name="alert-circle" size={14} color="#ef4444" />
          <Text style={styles.retryText}>Failed to post. Tap to retry.</Text>
        </Pressable>
      )}
    </Pressable>
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

  const [announcements, setAnnouncements] = useState<AnnouncementListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [oldestId, setOldestId] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [userRole, setUserRole] = useState<'creator' | 'admin' | 'member' | null>(null);

  // ── Long-press context menu ──────────────────────────────────────────────
  const [contextItem, setContextItem] = useState<OptimisticAnnouncement | null>(null);
  const [contextVisible, setContextVisible] = useState(false);

  // ── Create announcement sheet ────────────────────────────────────────────
  const [sheetVisible, setSheetVisible] = useState(false);
  const [draftText, setDraftText] = useState('');
  const [draftMediaUris, setDraftMediaUris] = useState<string[]>([]);
  const [draftMediaIds, setDraftMediaIds] = useState<string[]>([]);
  const [draftMediaTypes, setDraftMediaTypes] = useState<Array<'image' | 'video'>>([]);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  // Poll builder
  const [showPollBuilder, setShowPollBuilder] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState(['', '']);
  const [pollDuration, setPollDuration] = useState(24);
  const [submitting, setSubmitting] = useState(false);

  const isAdmin = userRole === 'creator' || userRole === 'admin';
  const flatRef = useRef<FlatList>(null);
  const [videoPlayerUrl, setVideoPlayerUrl] = useState<string | null>(null);

  // ── Load announcements ───────────────────────────────────────────────────

  const loadInitial = useCallback(async () => {
    setLoading(true);
    try {
      const [page, detail] = await Promise.all([
        fetchAnnouncements(orgId, { limit: 30 }),
        fetchOrgDetail(orgId),
      ]);
      // Insert "NEW" divider between unread (front/bottom) and read (back/top) announcements.
      // API returns newest-first; FlatList is inverted so index 0 appears at the bottom.
      const firstReadIdx = page.results.findIndex(a => a.is_read);
      const listItems: AnnouncementListItem[] = firstReadIdx > 0
        ? [
            ...page.results.slice(0, firstReadIdx),
            { id: '__new_divider__', isDivider: true as const },
            ...page.results.slice(firstReadIdx),
          ]
        : page.results;
      setAnnouncements(listItems);
      setHasMore(page.has_more);
      setOldestId(page.oldest_id);
      setUserRole(detail.user_role);
      // Mark as read and refresh the global unread badge.
      markAnnouncementsRead(orgId).then(refreshUnread).catch(() => {});
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
        return [announcement, ...prev];
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
      setAnnouncements(prev => [...prev, ...page.results]);
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

  // ── Poll voted ───────────────────────────────────────────────────────────

  const handlePollVoted = (announcementId: string, poll: AnnouncementPoll) => {
    setAnnouncements(prev =>
      prev.map(a => isAnn(a) && a.id === announcementId ? { ...a, poll } : a),
    );
  };

  // ── Long-press context ───────────────────────────────────────────────────

  const handleLongPress = (item: OptimisticAnnouncement) => {
    // Only allow context menu on fully-delivered items
    if (item._status) return;
    setContextItem(item);
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
    Clipboard.setString(contextItem.content ?? '');
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
    const items = await pickMedia({ allowsMultiple: true });
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
    setAnnouncements(prev => [optimistic, ...prev]);
    resetSheet(); // close sheet and clear draft immediately
    flatRef.current?.scrollToOffset({ offset: 0, animated: true });

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
        onVoted={handlePollVoted}
        onRetry={handleRetry}
        onVideoPress={setVideoPlayerUrl}
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
          <Avatar uri={orgAvatar} name={orgName} size={34} />
          <View style={{ marginLeft: 10, flex: 1 }}>
            <Text style={styles.headerTitle} numberOfLines={1}>{orgName}</Text>
            <Text style={styles.headerSubtitle}>Announcements</Text>
          </View>
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
          inverted
          contentContainerStyle={{
            paddingTop: insets.bottom + (isAdmin ? 90 : 24),
            paddingBottom: spacing.md,
            paddingHorizontal: spacing.base,
          }}
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
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

      {/* Long-press context menu */}
      <Modal
        visible={contextVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setContextVisible(false)}
      >
        <Pressable style={styles.contextOverlay} onPress={() => setContextVisible(false)}>
          <View style={styles.contextCard}>
            {/* Emoji row */}
            <View style={styles.emojiRow}>
              {EMOJI_QUICK.map((e) => (
                <Pressable key={e} style={styles.emojiBtn} onPress={() => handleContextReact(e)}>
                  <Text style={styles.emojiText}>{e}</Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.contextDivider} />
            {/* Copy */}
            {!!contextItem?.content && (
              <Pressable style={styles.contextAction} onPress={handleContextCopy}>
                <Feather name="copy" size={16} color={colors.textPrimary} />
                <Text style={styles.contextActionText}>Copy Text</Text>
              </Pressable>
            )}
            {/* Delete (admin only) */}
            {isAdmin && (
              <Pressable style={styles.contextAction} onPress={handleContextDelete}>
                <Feather name="trash-2" size={16} color="#ef4444" />
                <Text style={[styles.contextActionText, { color: '#ef4444' }]}>Delete</Text>
              </Pressable>
            )}
          </View>
        </Pressable>
      </Modal>

      {videoPlayerUrl != null && (
        <VideoPlayerModal url={videoPlayerUrl} onClose={() => setVideoPlayerUrl(null)} />
      )}

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

            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              {/* Text input */}
              <TextInput
                style={styles.sheetInput}
                placeholder="Write an announcement…"
                placeholderTextColor={colors.textMuted}
                value={draftText}
                onChangeText={setDraftText}
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
              <Pressable style={styles.sheetActionBtn} onPress={handlePickMedia}>
                <Feather name="image" size={20} color={colors.primary} />
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
  bubbleAuthor: { fontSize: typography.size.sm, fontWeight: '700', color: colors.textPrimary },
  bubbleTime: { fontSize: typography.size.xs, color: colors.textMuted },
  bubbleContent: { fontSize: typography.size.sm, color: colors.textPrimary, lineHeight: 20 },

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
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  contextCard: {
    backgroundColor: colors.background.card,
    borderRadius: 16,
    padding: spacing.md,
    width: '80%',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
  },
  emojiRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: spacing.sm,
  },
  emojiBtn: { padding: 8 },
  emojiText: { fontSize: 26 },
  contextDivider: { height: 1, backgroundColor: colors.borderColor, marginVertical: spacing.sm },
  contextAction: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 10,
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
