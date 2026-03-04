import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { wsManager, EventMap } from '../../services/websocket';
import {
  Alert,
  Dimensions,
  Keyboard,
  ScrollView,
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { Image } from 'expo-image';
import { FlashList } from '@shopify/flash-list';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { pickMedia } from '../../utils/pickMedia';
import { VideoView, useVideoPlayer } from 'expo-video';
import * as Clipboard from 'expo-clipboard';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system/legacy';
import { BlurView } from 'expo-blur';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp, useFocusEffect } from '@react-navigation/native';
import Avatar from '../../components/common/Avatar';
import VideoThumbnail from '../../components/common/VideoThumbnail';
import MessageRow, { type ListItem } from '../../components/messages/MessageRow';
import MentionAutocomplete, { type MentionableUser } from '../../components/messages/MentionAutocomplete';
import { fetchDMMessages, fetchMessageReactionDetails, markMessagesRead, reactToMessage, sendDM } from '../../api/messaging';
import ReactionDetailModal from '../../components/messages/ReactionDetailModal';
import { uploadMedia } from '../../api/organizations';
import { Message } from '../../types/messaging';
import { useAuth } from '../../store/AuthContext';
import { useUnreadCount } from '../../store/UnreadCountContext';
import { colors, spacing, typography } from '../../theme';
import { RootStackParamList } from '../../navigation/types';
import { staleCache } from '../../utils/staleCache';

// ── Helpers ──────────────────────────────────────────────────────────────────

const genClientMsgId = (): string =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;

const SEND_TIMEOUT_MS = 12_000;

const EMOJI_QUICK = ['👍', '👎', '😂', '😡', '❤️'];

// ── Types ────────────────────────────────────────────────────────────────────

interface PendingAttachment {
  localId: string;
  uri: string;
  kind: 'image' | 'video';
  mimeType: string;
  thumbUri: string | null;
  assetId: string | null;
  uploading: boolean;
  failed: boolean;
}

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Chat'>;
  route: RouteProp<RootStackParamList, 'Chat'>;
};

// ── Video player modal ────────────────────────────────────────────────────────

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

// ── Image viewer modal ────────────────────────────────────────────────────────

function ImageViewerModal({ url, onClose }: { url: string; onClose: () => void }) {
  return (
    <Modal visible animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <Image source={{ uri: url }} style={{ flex: 1 }} contentFit="contain" />
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

// ── Screen ───────────────────────────────────────────────────────────────────

export default function ChatScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { user: me } = useAuth();
  const { refresh: refreshUnread } = useUnreadCount();
  const { partnerId, partnerName, partnerUsername, partnerAvatar } = route.params;

  // Data is stored oldest-first so FlashList renders naturally (oldest at top, newest at bottom).
  const [messages, setMessages] = useState<ListItem[]>([]);
  // listVisible stays false until the list has been scrolled to the bottom for the first time,
  // preventing the 1-2 frame flash of the top of the list before the snap-to-bottom.
  const [listVisible, setListVisible] = useState(false);
  const dataLoadedRef = useRef(false); // gates onContentSizeChange so it doesn't fire on empty mount
  const [hasMore, setHasMore] = useState(false);
  const [oldestId, setOldestId] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [text, setText] = useState('');
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);

  const mentionableUsers = useMemo<MentionableUser[]>(() => [{
    id: partnerId,
    username: partnerUsername,
    display_name: partnerName,
    avatar_url: partnerAvatar,
  }], [partnerId, partnerUsername, partnerName, partnerAvatar]);

  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [picking, setPicking] = useState(false);
  const [sendingMedia, setSendingMedia] = useState(false);
  const uploadingMedia = pendingAttachments.some(a => a.uploading);
  const hasReadyAttachment = pendingAttachments.some(a => !!a.assetId && !a.failed);
  const [contextMsg, setContextMsg] = useState<Message | null>(null);
  const [contextVisible, setContextVisible] = useState(false);
  const [contextPageY, setContextPageY] = useState<number>(0);
  const [contextMsgHeight, setContextMsgHeight] = useState<number>(56);
  const [reactionDetailMsg, setReactionDetailMsg] = useState<Message | null>(null);
  const [videoPlayerUrl, setVideoPlayerUrl] = useState<string | null>(null);
  const [imageViewerUrl, setImageViewerUrl] = useState<string | null>(null);
  const [kbVisible, setKbVisible] = useState(false);
  const flatRef = useRef<FlashList<ListItem>>(null);
  const newestIdRef = useRef<string | null>(null);
  const pendingTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  // Scroll to bottom once after the first content render.
  const initialScrollDone = useRef(false);
  // Set to true once the list has been revealed; gates re-scrolls in onContentSizeChange.
  const listRevealedRef = useRef(false);
  // Track scroll position so we know whether to auto-scroll when a new message arrives.
  const scrollOffsetRef = useRef(0);
  const contentHeightRef = useRef(0);
  const listHeightRef = useRef(0);
  const isNearBottom = () =>
    contentHeightRef.current - scrollOffsetRef.current - listHeightRef.current < 150;

  const myId = String(me?.id ?? '');
  const _mountTime = useRef(Date.now());

  // ── Mention helpers ────────────────────────────────────────────────────────

  const detectMention = useCallback((value: string) => {
    const match = value.match(/@([\w.\-]*)$/);
    setMentionQuery(match ? match[1] : null);
  }, []);

  const handleMentionSelect = useCallback((user: MentionableUser) => {
    const newText = text.replace(/@([\w.\-]*)$/, `@${user.username} `);
    setText(newText);
    setMentionQuery(null);
  }, [text]);

  // ── Cleanup timers on unmount ──────────────────────────────────────────────
  useEffect(() => {
    return () => {
      pendingTimers.current.forEach(t => clearTimeout(t));
    };
  }, []);

  // ── Initial load ──────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    const t0 = Date.now();
    const cacheKey = `chat:dm:${partnerId}`;
    type CachedPage = { results: Message[]; has_more: boolean; oldest_id: string | null; newest_id: string | null };

    // ── Serve cached page immediately ────────────────────────────────────────
    const cached = await staleCache.get<CachedPage>(cacheKey);
    if (cached && cached.results.length > 0) {
      const firstUnreadIdx = cached.results.findIndex(m => !m.is_read);
      const cachedItems: ListItem[] = firstUnreadIdx > 0
        ? [
            ...cached.results.slice(0, firstUnreadIdx),
            { id: '__new_divider__', isDivider: true as const },
            ...cached.results.slice(firstUnreadIdx),
          ]
        : [...cached.results];
      dataLoadedRef.current = true;
      setMessages(cachedItems);
      setHasMore(cached.has_more);
      setOldestId(cached.oldest_id ?? null);
      newestIdRef.current = cached.newest_id ?? null;
      if (cachedItems.length === 0) { listRevealedRef.current = true; setListVisible(true); }
    }

    // ── Always fetch fresh in background ─────────────────────────────────────
    try {
      const page = await fetchDMMessages(partnerId);
      const fetchMs = Date.now() - t0;
      staleCache.set(cacheKey, page, 5 * 60 * 1000);
      // Backend sends oldest-first — keep that order so index 0 = oldest (top), last = newest (bottom).
      const firstUnreadIdx = page.results.findIndex(m => !m.is_read);
      const listItems: ListItem[] = firstUnreadIdx > 0
        ? [
            ...page.results.slice(0, firstUnreadIdx),
            { id: '__new_divider__', isDivider: true as const },
            ...page.results.slice(firstUnreadIdx),
          ]
        : [...page.results];
      dataLoadedRef.current = true; // must be set before setMessages triggers onContentSizeChange
      setMessages(listItems);
      setHasMore(page.has_more);
      setOldestId(page.oldest_id ?? null);
      newestIdRef.current = page.newest_id ?? null;
      // If already revealed (cache was shown), stay anchored at bottom for any new messages.
      if (listRevealedRef.current && isNearBottom()) {
        requestAnimationFrame(() => flatRef.current?.scrollToEnd({ animated: false }));
      }
      const unread = page.results
        .filter(m => !m.is_read && String(m.sender) !== myId)
        .map(m => String(m.id));
      if (unread.length) markMessagesRead(unread).then(refreshUnread).catch(() => {});
      // Empty conversation: no content size change will fire, so reveal directly.
      if (listItems.length === 0) { listRevealedRef.current = true; setListVisible(true); }
      if (__DEV__) {
        const mediaCount = page.results.filter(m => m.media && m.media.length > 0).length;
        const totalMs = Date.now() - _mountTime.current;
        console.log(
          `[ChatLoad] DM | partner=${partnerId} | fetch=${fetchMs}ms | total=${totalMs}ms` +
          ` | msgs=${page.results.length} | withMedia=${mediaCount} | hasMore=${page.has_more}`,
        );
      }
    } catch {
      // On error, reveal the (empty) list so the screen isn't stuck on the spinner.
      if (!cached) { listRevealedRef.current = true; setListVisible(true); }
    }
  }, [partnerId, myId]);

  useEffect(() => { load(); }, [load]);

  // Load older messages when user scrolls to the top (onStartReached).
  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore || !oldestId) return;
    setLoadingMore(true);
    try {
      const page = await fetchDMMessages(partnerId, { before_id: oldestId });
      // Older messages prepend to the front of the list (above existing).
      setMessages(prev => [...page.results, ...prev]);
      setHasMore(page.has_more);
      setOldestId(page.oldest_id ?? null);
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, loadingMore, oldestId, partnerId]);

  const initialMountRef = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (initialMountRef.current) {
        initialMountRef.current = false;
        return;
      }
      fetchDMMessages(partnerId).then(page => {
        setMessages([...page.results]);
        setHasMore(page.has_more);
        setOldestId(page.oldest_id ?? null);
        newestIdRef.current = page.newest_id ?? null;
        const unread = page.results
          .filter(m => !m.is_read && String(m.sender) !== myId)
          .map(m => String(m.id));
        if (unread.length) markMessagesRead(unread).then(refreshUnread).catch(() => {});
      }).catch(() => {});
    }, [partnerId, myId]),
  );

  // ── WS: incoming messages ─────────────────────────────────────────────────

  useEffect(() => {
    const handler = (msg: Message) => {
      const isThisConversation =
        String(msg.sender) === String(partnerId) ||
        String(msg.dm_recipient_id) === String(partnerId);
      if (!isThisConversation) return;

      const nearBottom = isNearBottom();
      let appended = false;
      setMessages(prev => {
        if (msg.client_msg_id) {
          const pendingIdx = prev.findIndex(
            m => !('isDivider' in m) && m.id === msg.client_msg_id,
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
        if (prev.some(m => !('isDivider' in m) && String(m.id) === String(msg.id))) return prev;
        // Append new message to the end (newest = bottom).
        appended = true;
        return [...prev, msg];
      });

      // Auto-scroll to bottom when a genuinely new message arrives and user was already near bottom.
      if (appended && nearBottom) {
        requestAnimationFrame(() => flatRef.current?.scrollToEnd({ animated: true }));
      }

      newestIdRef.current = String(msg.id);

      if (String(msg.sender) !== myId) {
        markMessagesRead([String(msg.id)]).then(refreshUnread).catch(() => {});
      }
    };

    wsManager.on('new_message', handler);
    return () => wsManager.off('new_message', handler);
  }, [partnerId, myId, refreshUnread]);

  // ── WS: gap-sync on reconnect ─────────────────────────────────────────────

  useEffect(() => {
    const handler = () => {
      const nid = newestIdRef.current;
      if (!nid) return;
      fetchDMMessages(partnerId, { after_id: nid, limit: 50 }).then(page => {
        if (!page.results.length) return;
        newestIdRef.current = page.newest_id ?? nid;
        setMessages(prev => {
          const existingIds = new Set(
            prev.filter((m): m is Message => !('isDivider' in m)).map(m => String(m.id))
          );
          // page.results is already oldest-first; filter dupes and append to end.
          const fresh = page.results.filter(m => !existingIds.has(String(m.id)));
          if (!fresh.length) return prev;
          return [...prev, ...fresh];
        });
        const unread = page.results
          .filter(m => !m.is_read && String(m.sender) !== myId)
          .map(m => String(m.id));
        if (unread.length) markMessagesRead(unread).then(refreshUnread).catch(() => {});
      }).catch(() => {});
    };

    wsManager.on('connected', handler);
    return () => wsManager.off('connected', handler);
  }, [partnerId, myId]);

  // ── WS: send error ────────────────────────────────────────────────────────

  useEffect(() => {
    const handler = ({ client_msg_id }: { code: string; detail: string; client_msg_id?: string }) => {
      if (!client_msg_id) return;
      const timer = pendingTimers.current.get(client_msg_id);
      if (timer) {
        clearTimeout(timer);
        pendingTimers.current.delete(client_msg_id);
      }
      setMessages(prev =>
        prev.map(m =>
          !('isDivider' in m) && m.id === client_msg_id
            ? { ...m, status: 'failed' as const }
            : m,
        ),
      );
    };
    wsManager.on('send_error', handler);
    return () => wsManager.off('send_error', handler);
  }, []);

  // ── WS: queue item flushed ────────────────────────────────────────────────

  useEffect(() => {
    const handler = ({ client_msg_id }: { client_msg_id: string }) => {
      setMessages(prev =>
        prev.map(m =>
          !('isDivider' in m) && m.id === client_msg_id && m.status === 'waiting'
            ? { ...m, status: 'sending' as const }
            : m,
        ),
      );
      const timeout = setTimeout(() => {
        setMessages(prev =>
          prev.map(m =>
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

  // ── WS: reaction updates ──────────────────────────────────────────────────

  useEffect(() => {
    const handler = (data: EventMap['reaction_update']) => {
      setMessages(prev =>
        prev.map(m =>
          !('isDivider' in m) && String(m.id) === data.message_id
            ? {
                ...m,
                reactions: data.reactions.map(r => ({
                  emoji: r.emoji,
                  count: r.count,
                  user_reacted: r.reactor_ids.includes(myId),
                })),
              }
            : m,
        ),
      );
    };
    wsManager.on('reaction_update', handler);
    return () => wsManager.off('reaction_update', handler);
  }, [myId]);

  // ── Keyboard visibility + scroll-to-bottom ───────────────────────────────
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, () => {
      setKbVisible(true);
      const isNearBottom =
        contentHeightRef.current - scrollOffsetRef.current - listHeightRef.current < 150;
      if (isNearBottom) {
        requestAnimationFrame(() => {
          flatRef.current?.scrollToEnd({ animated: Platform.OS === 'ios' });
        });
      }
    });
    const hideSub = Keyboard.addListener(hideEvent, () => setKbVisible(false));
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  // ── Send helpers ──────────────────────────────────────────────────────────

  const _startSendTimer = (clientMsgId: string) => {
    const timeout = setTimeout(() => {
      setMessages(prev =>
        prev.map(m =>
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
    setPicking(true);
    let items;
    try {
      items = await pickMedia({ allowsMultiple: true });
    } finally {
      setPicking(false);
    }
    if (!items) return;
    const newAttachments: PendingAttachment[] = items.map(item => ({
      localId: genClientMsgId(),
      uri: item.uri,
      kind: item.kind,
      mimeType: item.mimeType,
      thumbUri: item.thumbnailUri ?? null,
      assetId: null,
      uploading: true,
      failed: false,
    }));
    setPendingAttachments(prev => [...prev, ...newAttachments]);
    await Promise.all(newAttachments.map(async (att) => {
      try {
        const uploaded = await uploadMedia(att.uri, att.kind, att.mimeType);
        setPendingAttachments(prev =>
          prev.map(a => a.localId === att.localId ? { ...a, assetId: uploaded.asset_id, uploading: false } : a)
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to upload media. Please try again.';
        Alert.alert('Upload failed', msg);
        setPendingAttachments(prev =>
          prev.map(a => a.localId === att.localId ? { ...a, uploading: false, failed: true } : a)
        );
      }
    }));
  };

  const handleSendMedia = async () => {
    const ready = pendingAttachments.filter(a => !!a.assetId && !a.uploading && !a.failed);
    if (!ready.length || sendingMedia) return;
    const content = text.trim();
    setPendingAttachments(prev => prev.filter(a => !ready.some(r => r.localId === a.localId)));
    setText('');
    setSendingMedia(true);

    await Promise.all(ready.map(async (att) => {
      const clientMsgId = genClientMsgId();
      const optimisticMsg: Message = {
        id: clientMsgId,
        sender: myId,
        sender_username: null,
        sender_avatar_url: null,
        content: '',
        media: [{ url: att.uri, kind: att.kind, thumbnail_url: att.thumbUri, width: null, height: null }],
        created_at: new Date().toISOString(),
        is_read: true,
        client_msg_id: clientMsgId,
        status: 'sending',
      };
      // Append optimistic message to end (newest = bottom).
      setMessages(prev => [...prev, optimisticMsg]);
      try {
        const msg = await sendDM(partnerId, '', att.assetId!);
        setMessages(prev => {
          if (prev.some(m => !('isDivider' in m) && String(m.id) === String(msg.id))) {
            return prev.filter(m => ('isDivider' in m) || m.id !== clientMsgId);
          }
          return prev.map(m =>
            !('isDivider' in m) && m.id === clientMsgId
              ? { ...msg, media: [{ url: att.uri, kind: att.kind, thumbnail_url: att.thumbUri, width: null, height: null }], status: 'sent' as const }
              : m,
          );
        });
      } catch {
        setMessages(prev =>
          prev.map(m => !('isDivider' in m) && m.id === clientMsgId ? { ...m, status: 'failed' as const } : m),
        );
      }
    }));

    if (content) {
      const clientMsgId = genClientMsgId();
      const optimisticMsg: Message = {
        id: clientMsgId,
        sender: myId,
        sender_username: null,
        sender_avatar_url: null,
        content,
        created_at: new Date().toISOString(),
        is_read: true,
        client_msg_id: clientMsgId,
        status: 'sending',
      };
      setMessages(prev => [...prev, optimisticMsg]);
      const result = wsManager.sendMessage({ type: 'send_message', content, recipient_id: partnerId, client_msg_id: clientMsgId });
      if (result === 'queued') {
        setMessages(prev => prev.map(m => !('isDivider' in m) && m.id === clientMsgId ? { ...m, status: 'waiting' as const } : m));
      } else {
        _startSendTimer(clientMsgId);
      }
    }

    setSendingMedia(false);
  };

  const handleSend = () => {
    if (hasReadyAttachment) {
      handleSendMedia();
      return;
    }
    const content = text.trim();
    if (!content) return;

    const clientMsgId = genClientMsgId();
    setText('');

    const optimisticMsg: Message = {
      id: clientMsgId,
      sender: myId,
      sender_username: null,
      sender_avatar_url: null,
      content,
      created_at: new Date().toISOString(),
      is_read: true,
      client_msg_id: clientMsgId,
      status: 'sending',
    };
    // Append to end — newest message shows at the bottom.
    setMessages(prev => [...prev, optimisticMsg]);

    const result = wsManager.sendMessage({
      type: 'send_message',
      content,
      recipient_id: partnerId,
      client_msg_id: clientMsgId,
    });

    if (result === 'queued') {
      setMessages(prev =>
        prev.map(m =>
          !('isDivider' in m) && m.id === clientMsgId
            ? { ...m, status: 'waiting' as const }
            : m,
        ),
      );
      return;
    }

    _startSendTimer(clientMsgId);
  };

  const handleRetry = useCallback((msg: Message) => {
    const clientMsgId = msg.client_msg_id;
    if (!clientMsgId || !msg.content || (msg.media && msg.media.length > 0)) return;

    const existing = pendingTimers.current.get(clientMsgId);
    if (existing) {
      clearTimeout(existing);
      pendingTimers.current.delete(clientMsgId);
    }

    wsManager.removeFromQueue(clientMsgId);

    const result = wsManager.sendMessage({
      type: 'send_message',
      content: msg.content,
      recipient_id: partnerId,
      client_msg_id: clientMsgId,
    });

    setMessages(prev =>
      prev.map(m =>
        !('isDivider' in m) && m.id === clientMsgId
          ? { ...m, status: result === 'queued' ? 'waiting' as const : 'sending' as const }
          : m,
      ),
    );

    if (result === 'sent') {
      _startSendTimer(clientMsgId);
    }
  }, [partnerId]);

  const handleLongPress = useCallback((msg: Message, pageY: number, height: number) => {
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
              setMessages(prev => prev.filter(m => m.id !== msg.id));
            },
          },
          { text: 'Cancel', style: 'cancel' as const },
        ],
      );
      return;
    }
    setContextMsg(msg);
    setContextPageY(pageY);
    setContextMsgHeight(height);
    setContextVisible(true);
  }, [handleRetry]);

  const handleReact = useCallback(async (emoji: string) => {
    const msg = contextMsg;
    if (!msg) return;
    setContextVisible(false);
    setContextMsg(null);
    try {
      const res = await reactToMessage(msg.id, emoji);
      setMessages(prev =>
        prev.map(m =>
          !('isDivider' in m) && String(m.id) === String(msg.id)
            ? { ...m, reactions: res.reactions }
            : m,
        ),
      );
    } catch {}
  }, [contextMsg]);

  const handleLongPressReaction = useCallback((msg: Message) => {
    setReactionDetailMsg(msg);
  }, []);

  const handleTapReaction = useCallback(async (msg: Message, emoji: string) => {
    try {
      const res = await reactToMessage(msg.id, emoji);
      setMessages(prev =>
        prev.map(m =>
          !('isDivider' in m) && String(m.id) === String(msg.id)
            ? { ...m, reactions: res.reactions }
            : m,
        ),
      );
    } catch {}
  }, []);

  const handleContextCopy = useCallback(() => {
    if (!contextMsg?.content) return;
    setContextVisible(false);
    setContextMsg(null);
    Clipboard.setStringAsync(contextMsg.content);
  }, [contextMsg]);

  const handleContextSave = useCallback(async () => {
    const msg = contextMsg;
    if (!msg?.media?.length) return;
    setContextVisible(false);
    setContextMsg(null);
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Allow camera roll access to save media.');
        return;
      }
      for (const m of msg.media) {
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
  }, [contextMsg]);

  // ── List helpers ──────────────────────────────────────────────────────────

  const handleNavigateToProfile = useCallback((_username: string | null) => {
    navigation.navigate('Profile', { username: partnerUsername });
  }, [navigation, partnerUsername]);

  const keyExtractor = useCallback((item: ListItem) => String(item.id), []);

  const ItemSeparator = useCallback(() => <View style={{ height: spacing.sm }} />, []);

  // Give FlashList accurate height hints per item type to avoid layout thrashing.
  const overrideItemLayout = useCallback((
    layout: { span?: number; size?: number },
    item: ListItem,
  ) => {
    if ('isDivider' in item) {
      layout.size = 36;
    } else if (item.is_system) {
      layout.size = 44;
    } else if (item.media && item.media.length > 0) {
      layout.size = 204; // 180px thumb + padding + separator
    } else {
      layout.size = 56;
    }
  }, []);

  const handleMentionPress = useCallback((username: string) => {
    navigation.navigate('Profile', { username });
  }, [navigation]);

  const renderItem = useCallback(({ item }: { item: ListItem }) => (
    <MessageRow
      item={item}
      myId={myId}
      isGroup={false}
      onNavigateToProfile={handleNavigateToProfile}
      onRetry={handleRetry}
      onLongPress={handleLongPress}
      onTapReaction={handleTapReaction}
      onLongPressReaction={handleLongPressReaction}
      onVideoPress={setVideoPlayerUrl}
      onImagePress={setImageViewerUrl}
      onMentionPress={handleMentionPress}
    />
  ), [myId, handleNavigateToProfile, handleRetry, handleLongPress, handleTapReaction, handleLongPressReaction, handleMentionPress]);

  // ── Render ────────────────────────────────────────────────────────────────

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

      <View style={{ flex: 1 }}>
        {!listVisible && (
          <View style={[StyleSheet.absoluteFill, styles.center]}>
            <ActivityIndicator color={colors.primary} />
          </View>
        )}
        <View style={{ flex: 1, opacity: listVisible ? 1 : 0 }}>
          <FlashList
            ref={flatRef}
            data={messages}
            keyExtractor={keyExtractor}
            renderItem={renderItem}
            estimatedItemSize={80}
            overrideItemLayout={overrideItemLayout}
            ItemSeparatorComponent={ItemSeparator}
            contentContainerStyle={{ padding: spacing.base, paddingBottom: 16 }}
            // Scroll to the bottom (newest messages) on first render, then reveal.
            onContentSizeChange={() => {
              if (!dataLoadedRef.current || listRevealedRef.current) return;
              // Re-scroll on every content size change while hidden — FlashList remeasures
              // items (especially media) multiple times, so we must keep chasing the real bottom.
              flatRef.current?.scrollToEnd({ animated: false });
              if (!initialScrollDone.current) {
                initialScrollDone.current = true;
                setTimeout(() => {
                  listRevealedRef.current = true;
                  setListVisible(true);
                }, 150);
              }
            }}
            // Track scroll position so the WS handler can decide whether to auto-scroll.
            onScroll={({ nativeEvent }) => {
              scrollOffsetRef.current = nativeEvent.contentOffset.y;
              contentHeightRef.current = nativeEvent.contentSize.height;
              listHeightRef.current = nativeEvent.layoutMeasurement.height;
            }}
            scrollEventThrottle={100}
            // Load older messages when user scrolls near the top.
            onStartReached={loadMore}
            onStartReachedThreshold={0.3}
            // Keep the scroll position anchored when older messages are prepended.
            // autoscrollToBottomThreshold is intentionally omitted — it misfires when
            // prepending items. New-message auto-scroll is handled explicitly in the WS handler.
            maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
            ListHeaderComponent={
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
        </View>
      </View>

      {/* Input bar */}
      <View style={[styles.inputArea, { paddingBottom: kbVisible ? spacing.sm : insets.bottom + spacing.sm }]}>
        {pendingAttachments.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.pendingMediaPreview}
            contentContainerStyle={{ gap: spacing.sm, paddingVertical: 4 }}
          >
            {pendingAttachments.map((att) => (
              <View key={att.localId} style={styles.pendingMediaWrap}>
                {att.kind === 'video' ? (
                  <VideoThumbnail
                    videoUrl={att.uri}
                    thumbnailUrl={att.thumbUri}
                    style={styles.pendingThumb}
                    iconSize={18}
                  />
                ) : (
                  <Image source={{ uri: att.uri }} style={styles.pendingThumb} contentFit="cover" />
                )}
                {att.uploading && (
                  <View style={styles.pendingUploadOverlay}>
                    <ActivityIndicator size="small" color="#fff" />
                  </View>
                )}
                {att.failed && (
                  <View style={styles.pendingUploadOverlay}>
                    <Feather name="alert-circle" size={16} color="#ff6b6b" />
                  </View>
                )}
                <Pressable
                  style={styles.pendingRemoveBtn}
                  onPress={() => setPendingAttachments(prev => prev.filter(a => a.localId !== att.localId))}
                >
                  <Feather name="x" size={12} color="#fff" />
                </Pressable>
              </View>
            ))}
          </ScrollView>
        )}
        {mentionQuery !== null && (
          <MentionAutocomplete
            query={mentionQuery}
            users={mentionableUsers}
            onSelect={handleMentionSelect}
          />
        )}
        <View style={styles.inputBar}>
          <Pressable style={styles.mediaPickBtn} onPress={handlePickMedia} disabled={sendingMedia || uploadingMedia || picking}>
            {picking
              ? <ActivityIndicator size="small" color={colors.textMuted} />
              : <Feather name="image" size={22} color={colors.textMuted} />
            }
          </Pressable>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={(v) => { detectMention(v); setText(v); }}
            placeholder="Message…"
            placeholderTextColor={colors.textMuted}
            multiline
            maxLength={2000}
            returnKeyType="default"
          />
          <Pressable
            style={[styles.sendBtn, (!text.trim() && !hasReadyAttachment) && styles.sendBtnDisabled]}
            onPress={handleSend}
            disabled={(!text.trim() && !hasReadyAttachment) || sendingMedia || uploadingMedia}
          >
            {sendingMedia || uploadingMedia ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Feather name="send" size={18} color="#fff" />
            )}
          </Pressable>
        </View>
      </View>

      {/* Long-press context menu — focused view */}
      {(() => {
        const SCREEN_H = Dimensions.get('window').height;
        const EMOJI_SECTION_H = 76; // emoji bar height + gap below it
        const ACTIONS_EST_H = 96;   // actions card + gap above it
        const rawTop = contextPageY - EMOJI_SECTION_H;
        const maxTop = SCREEN_H - EMOJI_SECTION_H - contextMsgHeight - ACTIONS_EST_H - 24;
        const clampedTop = Math.max(insets.top + 8, Math.min(rawTop, maxTop));
        const isOwn = contextMsg ? String(contextMsg.sender) === myId : false;
        return (
          <Modal
            visible={contextVisible}
            transparent
            animationType="fade"
            onRequestClose={() => setContextVisible(false)}
          >
            <BlurView intensity={55} tint="dark" style={StyleSheet.absoluteFill}>
              <Pressable style={styles.contextOverlay} onPress={() => setContextVisible(false)}>
                <View style={[styles.contextContent, {
                  top: clampedTop,
                  alignItems: isOwn ? 'flex-end' : 'flex-start',
                }]}>

                  {/* 1. Emoji reactions bar */}
                  <View style={styles.contextEmojiBar}>
                    {EMOJI_QUICK.map((e) => (
                      <Pressable key={e} style={styles.emojiBtn} onPress={() => handleReact(e)}>
                        <Text style={styles.emojiText}>{e}</Text>
                      </Pressable>
                    ))}
                  </View>

                  {/* 2. Message preview (lifted into focus) */}
                  {contextMsg && (
                    <View style={styles.contextMsgRow}>
                      {!isOwn && (
                        <Avatar
                          uri={contextMsg.sender_avatar_url}
                          name={contextMsg.sender_username ?? '?'}
                          size={28}
                        />
                      )}
                      <Pressable
                        style={[styles.contextPreviewWrap, { alignItems: isOwn ? 'flex-end' : 'flex-start' }]}
                        onPress={() => {}}
                      >
                        {!!contextMsg.media?.length && (
                          <View style={styles.contextMediaRow}>
                            {contextMsg.media.map((m, idx) =>
                              m.kind === 'video' ? (
                                <VideoThumbnail
                                  key={idx}
                                  videoUrl={m.url}
                                  thumbnailUrl={m.thumbnail_url}
                                  style={styles.contextMediaThumb}
                                  iconSize={32}
                                />
                              ) : (
                                <Image key={idx} source={{ uri: m.thumbnail_url ?? m.url }} style={styles.contextMediaThumb} contentFit="cover" />
                              )
                            )}
                          </View>
                        )}
                        {contextMsg.shared_post && (
                          <View style={styles.contextPostChip}>
                            <Feather name="file-text" size={16} color={colors.textMuted} />
                            <Text style={styles.contextPostChipText}>
                              {contextMsg.shared_post.author_username
                                ? `@${contextMsg.shared_post.author_username}'s post`
                                : 'Shared post'}
                            </Text>
                          </View>
                        )}
                        {!!contextMsg.content && (
                          <View style={[
                            styles.contextBubble,
                            isOwn ? styles.contextBubbleOwn : styles.contextBubbleOther,
                          ]}>
                            <Text
                              style={[styles.contextBubbleText,
                                isOwn ? styles.contextBubbleTextOwn : styles.contextBubbleTextOther,
                              ]}
                              numberOfLines={6}
                            >
                              {contextMsg.content}
                            </Text>
                          </View>
                        )}
                      </Pressable>
                    </View>
                  )}

                  {/* 3. Action buttons */}
                  {(!!contextMsg?.content && !contextMsg?.shared_post || !!(contextMsg?.media?.length)) && (
                    <Pressable style={[styles.contextActionsCard, { alignSelf: 'stretch' }]} onPress={() => {}}>
                      {!!contextMsg?.content && !contextMsg?.shared_post && (
                        <Pressable style={styles.contextAction} onPress={handleContextCopy}>
                          <Feather name="copy" size={16} color={colors.textPrimary} />
                          <Text style={styles.contextActionText}>Copy Text</Text>
                        </Pressable>
                      )}
                      {!!contextMsg?.content && !contextMsg?.shared_post && !!(contextMsg?.media?.length) && (
                        <View style={styles.contextDivider} />
                      )}
                      {!!(contextMsg?.media?.length) && (
                        <Pressable style={styles.contextAction} onPress={handleContextSave}>
                          <Feather name="download" size={16} color={colors.textPrimary} />
                          <Text style={styles.contextActionText}>Save to Camera Roll</Text>
                        </Pressable>
                      )}
                    </Pressable>
                  )}

                </View>
              </Pressable>
            </BlurView>
          </Modal>
        );
      })()}

      {videoPlayerUrl != null && (
        <VideoPlayerModal url={videoPlayerUrl} onClose={() => setVideoPlayerUrl(null)} />
      )}
      {imageViewerUrl != null && (
        <ImageViewerModal url={imageViewerUrl} onClose={() => setImageViewerUrl(null)} />
      )}
      <ReactionDetailModal
        visible={reactionDetailMsg != null}
        onClose={() => setReactionDetailMsg(null)}
        fetchDetails={() => fetchMessageReactionDetails(reactionDetailMsg!.id)}
      />
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
  },
  pendingMediaWrap: {
    position: 'relative',
  },
  pendingThumb: {
    width: 60,
    height: 60,
    borderRadius: 8,
  },
  pendingUploadOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 8,
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
  contextOverlay: {
    flex: 1,
  },
  contextContent: {
    position: 'absolute',
    left: 0,
    right: 0,
    paddingHorizontal: spacing.xl,
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
  emojiBtn: { padding: spacing.sm },
  emojiText: { fontSize: 28 },
  contextMsgRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.xs,
    width: '100%',
  },
  contextPreviewWrap: {
    flex: 1,
    alignItems: 'flex-start',
    gap: 4,
  },
  contextMediaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  contextMediaThumb: {
    width: 180,
    height: 180,
    borderRadius: 14,
    backgroundColor: '#111',
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  contextPostChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background.elevated,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  contextPostChipText: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },
  contextBubble: {
    borderRadius: 16,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    maxWidth: '100%',
  },
  contextBubbleOwn: { backgroundColor: colors.primary, borderBottomRightRadius: 4 },
  contextBubbleOther: { backgroundColor: colors.background.elevated, borderBottomLeftRadius: 4 },
  contextBubbleText: { fontSize: typography.size.sm, lineHeight: 20 },
  contextBubbleTextOwn: { color: '#fff' },
  contextBubbleTextOther: { color: colors.textPrimary },
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
  contextDivider: { height: 1, backgroundColor: colors.border.subtle },
  contextAction: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    gap: 12,
  },
  contextActionText: { fontSize: typography.size.sm, color: colors.textPrimary, fontWeight: '500' },
});
