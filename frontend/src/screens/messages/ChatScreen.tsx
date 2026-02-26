import React, { useCallback, useEffect, useRef, useState } from 'react';
import { wsManager } from '../../services/websocket';
import {
  Alert,
  Image,
  View,
  Text,
  FlatList,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp, useFocusEffect } from '@react-navigation/native';
import Avatar from '../../components/common/Avatar';
import { fetchDMMessages, markMessagesRead, reactToMessage, sendDM } from '../../api/messaging';
import { uploadMedia } from '../../api/organizations';
import { Message, MessageReaction } from '../../types/messaging';
import { useAuth } from '../../store/AuthContext';
import { useUnreadCount } from '../../store/UnreadCountContext';
import { colors, spacing, typography } from '../../theme';
import { RootStackParamList } from '../../navigation/types';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Generate a lightweight unique ID for client-side message correlation. */
const genClientMsgId = (): string =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;

/** Timeout before a 'sending' message is marked as failed (ms). */
const SEND_TIMEOUT_MS = 12_000;

const EMOJI_QUICK = ['👍', '👎', '😂', '😡', '❤️'];

const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_VIDEO_SIZE = 50 * 1024 * 1024; // 50 MB

// ── Types ────────────────────────────────────────────────────────────────────

type NewDivider = { id: '__new_divider__'; isDivider: true };
type ListItem = Message | NewDivider;

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Chat'>;
  route: RouteProp<RootStackParamList, 'Chat'>;
};

// ── Status icon (own messages only) ──────────────────────────────────────────

function MsgStatusIcon({ status }: { status: NonNullable<Message['status']> }) {
  if (status === 'sending' || status === 'waiting') {
    return <Feather name="clock" size={10} color="rgba(255,255,255,0.65)" />;
  }
  if (status === 'sent') {
    return <Feather name="check" size={10} color="rgba(255,255,255,0.85)" />;
  }
  if (status === 'failed') {
    return <Feather name="alert-circle" size={10} color="#ff6b6b" />;
  }
  return null;
}

// ── Screen ───────────────────────────────────────────────────────────────────

export default function ChatScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { user: me } = useAuth();
  const { refresh: refreshUnread } = useUnreadCount();
  const { partnerId, partnerName, partnerUsername, partnerAvatar } = route.params;

  // Stored newest-first so inverted FlatList shows newest at the bottom naturally.
  const [messages, setMessages] = useState<ListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [oldestId, setOldestId] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [text, setText] = useState('');
  const [pendingMediaUri, setPendingMediaUri] = useState<string | null>(null);
  const [pendingMediaKind, setPendingMediaKind] = useState<'image' | 'video' | null>(null);
  const [sendingMedia, setSendingMedia] = useState(false);
  const [contextMsg, setContextMsg] = useState<Message | null>(null);
  const [contextVisible, setContextVisible] = useState(false);
  const flatRef = useRef<FlatList>(null);
  // Tracks the newest confirmed (server) message ID for gap-sync on reconnect.
  const newestIdRef = useRef<string | null>(null);
  // Maps client_msg_id → timeout handle for the 12 s send deadline.
  const pendingTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // ── Cleanup timers on unmount ──────────────────────────────────────────────
  useEffect(() => {
    return () => {
      pendingTimers.current.forEach(t => clearTimeout(t));
    };
  }, []);

  // ── Initial load ──────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    try {
      const page = await fetchDMMessages(partnerId);
      // Backend returns oldest-first; reverse so index 0 = newest (required for inverted list).
      const reversed = [...page.results].reverse();
      // Insert "NEW" divider between unread (front) and read (back) messages on first open.
      const firstReadIdx = reversed.findIndex((m) => m.is_read);
      const listItems: ListItem[] = firstReadIdx > 0
        ? [...reversed.slice(0, firstReadIdx), { id: '__new_divider__', isDivider: true as const }, ...reversed.slice(firstReadIdx)]
        : reversed;
      setMessages(listItems);
      setHasMore(page.has_more);
      setOldestId(page.oldest_id ?? null);
      newestIdRef.current = page.newest_id ?? null;
      const unread = page.results
        .filter((m) => !m.is_read && String(m.sender) !== String(me?.id))
        .map((m) => String(m.id));
      if (unread.length) markMessagesRead(unread).then(refreshUnread).catch(() => {});
    } finally {
      setLoading(false);
    }
  }, [partnerId, me?.id]);

  useEffect(() => { load(); }, [load]);

  // Load older messages when the user scrolls to the visual top (onEndReached in inverted mode).
  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore || !oldestId) return;
    setLoadingMore(true);
    try {
      const page = await fetchDMMessages(partnerId, { before_id: oldestId });
      setMessages((prev) => [...prev, ...[...page.results].reverse()]);
      setHasMore(page.has_more);
      setOldestId(page.oldest_id ?? null);
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, loadingMore, oldestId, partnerId]);

  // Silently refresh when the screen regains focus (e.g. after a zap from another screen).
  const initialMountRef = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (initialMountRef.current) {
        initialMountRef.current = false;
        return;
      }
      fetchDMMessages(partnerId).then((page) => {
        setMessages([...page.results].reverse());
        setHasMore(page.has_more);
        setOldestId(page.oldest_id ?? null);
        newestIdRef.current = page.newest_id ?? null;
        const unread = page.results
          .filter((m) => !m.is_read && String(m.sender) !== String(me?.id))
          .map((m) => String(m.id));
        if (unread.length) markMessagesRead(unread).then(refreshUnread).catch(() => {});
      }).catch(() => {});
    }, [partnerId, me?.id]),
  );

  // ── WS: incoming messages ─────────────────────────────────────────────────

  useEffect(() => {
    const handler = (msg: Message) => {
      const isThisConversation =
        String(msg.sender) === String(partnerId) ||
        String(msg.dm_recipient_id) === String(partnerId);
      if (!isThisConversation) return;

      setMessages((prev) => {
        // Reconcile: if the echo carries client_msg_id matching a pending message, replace it.
        if (msg.client_msg_id) {
          const pendingIdx = prev.findIndex(
            (m) => !('isDivider' in m) && m.id === msg.client_msg_id,
          );
          if (pendingIdx !== -1) {
            const timer = pendingTimers.current.get(msg.client_msg_id);
            if (timer) {
              clearTimeout(timer);
              pendingTimers.current.delete(msg.client_msg_id);
            }
            const updated = [...prev];
            updated[pendingIdx] = { ...msg, status: 'sent' as const };
            return updated;
          }
        }
        // Normal path: dedup by server message ID.
        if (prev.some((m) => !('isDivider' in m) && String(m.id) === String(msg.id))) return prev;
        return [msg, ...prev];
      });

      newestIdRef.current = String(msg.id);

      if (String(msg.sender) !== String(me?.id)) {
        markMessagesRead([String(msg.id)]).then(refreshUnread).catch(() => {});
      }
    };

    wsManager.on('new_message', handler);
    return () => wsManager.off('new_message', handler);
  }, [partnerId, me?.id, refreshUnread]);

  // ── WS: gap-sync on reconnect ─────────────────────────────────────────────

  useEffect(() => {
    const handler = () => {
      const nid = newestIdRef.current;
      if (!nid) return;
      fetchDMMessages(partnerId, { after_id: nid, limit: 50 }).then((page) => {
        if (!page.results.length) return;
        newestIdRef.current = page.newest_id ?? nid;
        setMessages((prev) => {
          const existingIds = new Set(
            prev.filter((m): m is Message => !('isDivider' in m)).map((m) => String(m.id))
          );
          const fresh = [...page.results].reverse().filter((m) => !existingIds.has(String(m.id)));
          if (!fresh.length) return prev;
          return [...fresh, ...prev];
        });
        const unread = page.results
          .filter((m) => !m.is_read && String(m.sender) !== String(me?.id))
          .map((m) => String(m.id));
        if (unread.length) markMessagesRead(unread).then(refreshUnread).catch(() => {});
      }).catch(() => {});
    };

    wsManager.on('connected', handler);
    return () => wsManager.off('connected', handler);
  }, [partnerId, me?.id]);

  // ── WS: send error ────────────────────────────────────────────────────────

  useEffect(() => {
    const handler = ({ client_msg_id }: { code: string; detail: string; client_msg_id?: string }) => {
      if (!client_msg_id) return;
      const timer = pendingTimers.current.get(client_msg_id);
      if (timer) {
        clearTimeout(timer);
        pendingTimers.current.delete(client_msg_id);
      }
      setMessages((prev) =>
        prev.map((m) =>
          !('isDivider' in m) && m.id === client_msg_id
            ? { ...m, status: 'failed' as const }
            : m,
        ),
      );
    };
    wsManager.on('send_error', handler);
    return () => wsManager.off('send_error', handler);
  }, []);

  // ── WS: queue item flushed (waiting → sending, start timer) ───────────────

  useEffect(() => {
    const handler = ({ client_msg_id }: { client_msg_id: string }) => {
      setMessages((prev) =>
        prev.map((m) =>
          !('isDivider' in m) && m.id === client_msg_id && m.status === 'waiting'
            ? { ...m, status: 'sending' as const }
            : m,
        ),
      );
      const timeout = setTimeout(() => {
        setMessages((prev) =>
          prev.map((m) =>
            !('isDivider' in m) && m.id === client_msg_id && m.status === 'sending'
              ? { ...m, status: 'failed' as const }
              : m,
          ),
        );
        pendingTimers.current.delete(client_msg_id);
      }, SEND_TIMEOUT_MS);
      pendingTimers.current.set(client_msg_id, timeout);
    };
    wsManager.on('queue_item_flushed', handler);
    return () => wsManager.off('queue_item_flushed', handler);
  }, []);

  // ── Send helpers ──────────────────────────────────────────────────────────

  const _startSendTimer = (clientMsgId: string) => {
    const timeout = setTimeout(() => {
      setMessages((prev) =>
        prev.map((m) =>
          !('isDivider' in m) && m.id === clientMsgId && m.status === 'sending'
            ? { ...m, status: 'failed' as const }
            : m,
        ),
      );
      pendingTimers.current.delete(clientMsgId);
    }, SEND_TIMEOUT_MS);
    pendingTimers.current.set(clientMsgId, timeout);
  };

  const handlePickMedia = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow access to your photo library.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      quality: 0.85,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    const kind: 'image' | 'video' = asset.type === 'video' ? 'video' : 'image';
    const limit = kind === 'video' ? MAX_VIDEO_SIZE : MAX_IMAGE_SIZE;
    if (asset.fileSize != null && asset.fileSize > limit) {
      Alert.alert(
        'File too large',
        kind === 'video' ? 'Videos must be under 50MB.' : 'Images must be under 10MB.',
      );
      return;
    }
    setPendingMediaUri(asset.uri);
    setPendingMediaKind(kind);
  };

  const handleSendMedia = async () => {
    if (!pendingMediaUri || !pendingMediaKind || sendingMedia) return;
    const content = text.trim();
    const uri = pendingMediaUri;
    const kind = pendingMediaKind;
    const clientMsgId = genClientMsgId();

    setPendingMediaUri(null);
    setPendingMediaKind(null);
    setText('');
    setSendingMedia(true);

    const optimisticMsg: Message = {
      id: clientMsgId,
      sender: String(me?.id ?? ''),
      sender_username: null,
      sender_avatar_url: null,
      content,
      media: [{ url: uri, kind, thumbnail_url: null, width: null, height: null }],
      created_at: new Date().toISOString(),
      is_read: true,
      client_msg_id: clientMsgId,
      status: 'sending',
    };
    setMessages((prev) => [optimisticMsg, ...prev]);

    try {
      const uploaded = await uploadMedia(uri, kind);
      const msg = await sendDM(partnerId, content, uploaded.asset_id);
      setMessages((prev) => {
        if (prev.some((m) => !('isDivider' in m) && String(m.id) === String(msg.id))) {
          return prev.filter((m) => ('isDivider' in m) || m.id !== clientMsgId);
        }
        return prev.map((m) =>
          !('isDivider' in m) && m.id === clientMsgId ? { ...msg, status: 'sent' as const } : m,
        );
      });
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          !('isDivider' in m) && m.id === clientMsgId ? { ...m, status: 'failed' as const } : m,
        ),
      );
      Alert.alert('Error', 'Failed to send media.');
    } finally {
      setSendingMedia(false);
    }
  };

  const handleSend = () => {
    if (pendingMediaUri) {
      handleSendMedia();
      return;
    }
    const content = text.trim();
    if (!content) return;

    const clientMsgId = genClientMsgId();
    setText('');

    // Add optimistic message immediately.
    const optimisticMsg: Message = {
      id: clientMsgId,
      sender: String(me?.id ?? ''),
      sender_username: null,
      sender_avatar_url: null,
      content,
      created_at: new Date().toISOString(),
      is_read: true,
      client_msg_id: clientMsgId,
      status: 'sending',
    };
    setMessages((prev) => [optimisticMsg, ...prev]);

    const result = wsManager.sendMessage({
      type: 'send_message',
      content,
      recipient_id: partnerId,
      client_msg_id: clientMsgId,
    });

    if (result === 'queued') {
      // WS was down — show waiting state, queue will drain on reconnect.
      setMessages((prev) =>
        prev.map((m) =>
          !('isDivider' in m) && m.id === clientMsgId
            ? { ...m, status: 'waiting' as const }
            : m,
        ),
      );
      return;
    }

    // WS delivered — start 12 s failure deadline.
    _startSendTimer(clientMsgId);
  };

  const handleRetry = useCallback((msg: Message) => {
    const clientMsgId = msg.client_msg_id;
    if (!clientMsgId || !msg.content || (msg.media && msg.media.length > 0)) return;

    // Clear any stale timer.
    const existing = pendingTimers.current.get(clientMsgId);
    if (existing) {
      clearTimeout(existing);
      pendingTimers.current.delete(clientMsgId);
    }

    // Remove from queue in case it's still sitting there.
    wsManager.removeFromQueue(clientMsgId);

    const result = wsManager.sendMessage({
      type: 'send_message',
      content: msg.content,
      recipient_id: partnerId,
      client_msg_id: clientMsgId,
    });

    setMessages((prev) =>
      prev.map((m) =>
        !('isDivider' in m) && m.id === clientMsgId
          ? { ...m, status: result === 'queued' ? 'waiting' as const : 'sending' as const }
          : m,
      ),
    );

    if (result === 'sent') {
      _startSendTimer(clientMsgId);
    }
  }, [partnerId]);

  const handleLongPress = useCallback((msg: Message) => {
    if (msg.status === 'failed') {
      const hasMedia = msg.media && msg.media.length > 0;
      Alert.alert(
        'Message Options',
        undefined,
        [
          ...(!hasMedia ? [{ text: 'Retry', onPress: () => handleRetry(msg) }] : []),
          {
            text: 'Delete',
            style: 'destructive' as const,
            onPress: () => {
              if (msg.client_msg_id) wsManager.removeFromQueue(msg.client_msg_id);
              setMessages((prev) => prev.filter((m) => m.id !== msg.id));
            },
          },
          { text: 'Cancel', style: 'cancel' as const },
        ],
      );
      return;
    }
    setContextMsg(msg);
    setContextVisible(true);
  }, [handleRetry]);

  const handleReact = useCallback(async (emoji: string) => {
    const msg = contextMsg;
    if (!msg) return;
    setContextVisible(false);
    setContextMsg(null);
    try {
      const res = await reactToMessage(msg.id, emoji);
      setMessages((prev) =>
        prev.map((m) =>
          !('isDivider' in m) && String(m.id) === String(msg.id)
            ? { ...m, reactions: res.reactions }
            : m,
        ),
      );
    } catch {}
  }, [contextMsg]);

  const handleTapReaction = useCallback(async (msg: Message, emoji: string) => {
    try {
      const res = await reactToMessage(msg.id, emoji);
      setMessages((prev) =>
        prev.map((m) =>
          !('isDivider' in m) && String(m.id) === String(msg.id)
            ? { ...m, reactions: res.reactions }
            : m,
        ),
      );
    } catch {}
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────

  const renderItem = useCallback(({ item }: { item: ListItem }) => {
    if ('isDivider' in item) {
      return (
        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerLabel}>NEW</Text>
          <View style={styles.dividerLine} />
        </View>
      );
    }

    const isOwn = String(item.sender) === String(me?.id);
    const isFailed = item.status === 'failed';
    const reactions = item.reactions ?? [];

    return (
      <View style={[styles.msgWrap, isOwn ? styles.msgWrapOwn : styles.msgWrapOther]}>
        {!isOwn && (
          <Pressable onPress={() => navigation.navigate('Profile', { username: partnerUsername })}>
            <Avatar
              uri={item.sender_avatar_url}
              name={item.sender_username ?? '?'}
              size={28}
            />
          </Pressable>
        )}
        <View style={{ maxWidth: '75%' }}>
          {isFailed ? (
            <Pressable
              onPress={() => handleRetry(item)}
              onLongPress={() => handleLongPress(item)}
              delayLongPress={400}
            >
              {item.media && item.media.length > 0 && (
                <View style={[styles.msgMediaGrid, { opacity: 0.7 }]}>
                  {item.media.map((m, idx) =>
                    m.kind === 'video' ? (
                      <View key={idx} style={[styles.msgMediaThumb, styles.msgMediaVideo]}>
                        {m.thumbnail_url ? (
                          <Image source={{ uri: m.thumbnail_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                        ) : null}
                        <Feather name="play-circle" size={28} color="#fff" />
                      </View>
                    ) : (
                      <Image key={idx} source={{ uri: m.thumbnail_url ?? m.url }} style={styles.msgMediaThumb} resizeMode="cover" />
                    )
                  )}
                </View>
              )}
              {!!item.content && (
                <View style={[styles.bubble, isOwn ? styles.bubbleOwn : styles.bubbleOther, styles.bubbleFailed]}>
                  <Text style={[styles.bubbleText, isOwn ? styles.bubbleTextOwn : styles.bubbleTextOther]}>
                    {item.content}
                  </Text>
                </View>
              )}
              {isOwn && item.status != null && (
                <View style={styles.msgStatus}>
                  <MsgStatusIcon status={item.status} />
                </View>
              )}
            </Pressable>
          ) : (
            <Pressable onLongPress={() => handleLongPress(item)} delayLongPress={400}>
              {item.media && item.media.length > 0 && (
                <View style={styles.msgMediaGrid}>
                  {item.media.map((m, idx) =>
                    m.kind === 'video' ? (
                      <View key={idx} style={[styles.msgMediaThumb, styles.msgMediaVideo]}>
                        {m.thumbnail_url ? (
                          <Image source={{ uri: m.thumbnail_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                        ) : null}
                        <Feather name="play-circle" size={28} color="#fff" />
                      </View>
                    ) : (
                      <Image key={idx} source={{ uri: m.thumbnail_url ?? m.url }} style={styles.msgMediaThumb} resizeMode="cover" />
                    )
                  )}
                </View>
              )}
              {!!item.content && (
                <View style={[styles.bubble, isOwn ? styles.bubbleOwn : styles.bubbleOther]}>
                  <Text style={[styles.bubbleText, isOwn ? styles.bubbleTextOwn : styles.bubbleTextOther]}>
                    {item.content}
                  </Text>
                </View>
              )}
              {isOwn && item.status != null && (
                <View style={styles.msgStatus}>
                  <MsgStatusIcon status={item.status} />
                </View>
              )}
            </Pressable>
          )}
          {reactions.length > 0 && (
            <View style={[styles.reactionsRow, isOwn && styles.reactionsRowOwn]}>
              {reactions.map((r: MessageReaction) => (
                <Pressable
                  key={r.emoji}
                  style={[styles.reactionChip, r.user_reacted && styles.reactionChipActive]}
                  onPress={() => handleTapReaction(item, r.emoji)}
                >
                  <Text style={styles.reactionEmoji}>{r.emoji}</Text>
                  <Text style={[styles.reactionCount, r.user_reacted && styles.reactionCountActive]}>
                    {r.count}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>
      </View>
    );
  }, [me?.id, partnerUsername, navigation, handleRetry, handleLongPress, handleTapReaction]);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background.base }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      {/* Header */}
      <LinearGradient
        colors={['#4FC3E0', '#6DCFE8', '#A8E2F4', '#D6F2FB', '#FFFFFF']}
        locations={[0, 0.2, 0.5, 0.75, 1]}
        style={{ paddingBottom: spacing.lg }}
      >
        <View style={[styles.headerBar, { paddingTop: insets.top + 8 }]}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Feather name="arrow-left" size={22} color={colors.textPrimary} />
          </Pressable>
          <Pressable
            style={styles.headerInfo}
            onPress={() => navigation.navigate('Profile', { username: partnerUsername })}
          >
            <Avatar uri={partnerAvatar} name={partnerName} size={42} />
            <Text style={styles.headerTitle} numberOfLines={1}>{partnerName}</Text>
          </Pressable>
          <View style={{ width: 40 }} />
        </View>
      </LinearGradient>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          ref={flatRef}
          inverted
          data={messages}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          contentContainerStyle={{ padding: spacing.base, gap: spacing.sm, paddingTop: 16 }}
          onEndReached={loadMore}
          onEndReachedThreshold={0.2}
          ListFooterComponent={
            loadingMore
              ? <ActivityIndicator style={{ paddingVertical: spacing.md }} color={colors.primary} />
              : null
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyText}>Send a message to start the conversation</Text>
            </View>
          }
        />
      )}

      {/* Input bar */}
      <View style={[styles.inputArea, { paddingBottom: insets.bottom + spacing.sm }]}>
        {pendingMediaUri != null && (
          <View style={styles.pendingMediaPreview}>
            <View style={styles.pendingMediaWrap}>
              {pendingMediaKind === 'video' ? (
                <View style={[styles.pendingThumb, styles.pendingThumbVideo]}>
                  <Feather name="video" size={18} color="#fff" />
                </View>
              ) : (
                <Image source={{ uri: pendingMediaUri }} style={styles.pendingThumb} resizeMode="cover" />
              )}
              <Pressable
                style={styles.pendingRemoveBtn}
                onPress={() => { setPendingMediaUri(null); setPendingMediaKind(null); }}
              >
                <Feather name="x" size={12} color="#fff" />
              </Pressable>
            </View>
          </View>
        )}
        <View style={styles.inputBar}>
          <Pressable style={styles.mediaPickBtn} onPress={handlePickMedia} disabled={sendingMedia}>
            <Feather name="image" size={22} color={colors.textMuted} />
          </Pressable>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder="Message…"
            placeholderTextColor={colors.textMuted}
            multiline
            maxLength={2000}
            returnKeyType="default"
          />
          <Pressable
            style={[styles.sendBtn, (!text.trim() && !pendingMediaUri) && styles.sendBtnDisabled]}
            onPress={handleSend}
            disabled={(!text.trim() && !pendingMediaUri) || sendingMedia}
          >
            {sendingMedia ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Feather name="send" size={18} color="#fff" />
            )}
          </Pressable>
        </View>
      </View>

      {/* Reaction emoji picker */}
      <Modal
        visible={contextVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setContextVisible(false)}
      >
        <Pressable style={styles.contextOverlay} onPress={() => setContextVisible(false)}>
          <View style={styles.contextCard}>
            <View style={styles.emojiRow}>
              {EMOJI_QUICK.map((e) => (
                <Pressable key={e} style={styles.emojiBtn} onPress={() => handleReact(e)}>
                  <Text style={styles.emojiText}>{e}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.md,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  headerTitle: {
    fontSize: typography.size.lg,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  emptyText: { fontSize: typography.size.sm, color: colors.textMuted, textAlign: 'center' },
  msgWrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  msgWrapOwn: { justifyContent: 'flex-end' },
  msgWrapOther: { justifyContent: 'flex-start' },
  bubble: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 16,
  },
  bubbleOwn: { backgroundColor: colors.primary, borderBottomRightRadius: 4 },
  bubbleOther: { backgroundColor: colors.background.elevated, borderBottomLeftRadius: 4 },
  bubbleFailed: { opacity: 0.7 },
  bubbleText: { fontSize: typography.size.sm, lineHeight: 20 },
  bubbleTextOwn: { color: '#fff' },
  bubbleTextOther: { color: colors.textPrimary },
  msgStatus: {
    alignSelf: 'flex-end',
    marginTop: 2,
    marginRight: 4,
  },
  inputArea: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border.subtle,
    backgroundColor: colors.surface,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
  },
  pendingMediaPreview: {
    marginBottom: spacing.sm,
    flexDirection: 'row',
  },
  pendingMediaWrap: {
    position: 'relative',
  },
  pendingThumb: {
    width: 60,
    height: 60,
    borderRadius: 8,
  },
  pendingThumbVideo: {
    backgroundColor: '#333',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pendingRemoveBtn: {
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
  mediaPickBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  msgMediaGrid: {
    marginBottom: 4,
  },
  msgMediaThumb: {
    width: 180,
    height: 180,
    borderRadius: 12,
  },
  msgMediaVideo: {
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  input: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: colors.borderColor,
    borderRadius: 20,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: typography.size.sm,
    color: colors.textPrimary,
    maxHeight: 100,
    backgroundColor: colors.background.elevated,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: colors.iconInactive },
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
  reactionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 4,
    alignSelf: 'flex-start',
  },
  reactionsRowOwn: { alignSelf: 'flex-end' },
  reactionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    backgroundColor: colors.background.elevated,
    gap: 3,
  },
  reactionChipActive: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(79,195,224,0.12)',
  },
  reactionEmoji: { fontSize: 13 },
  reactionCount: { fontSize: 11, color: colors.textMuted },
  reactionCountActive: { color: colors.primary, fontWeight: '600' },
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  emojiRow: { flexDirection: 'row', gap: spacing.sm },
  emojiBtn: { padding: spacing.sm },
  emojiText: { fontSize: 28 },
});
