import React, { useCallback, useEffect, useRef, useState } from 'react';
import { wsManager } from '../../services/websocket';
import {
  Alert,
  View,
  Text,
  FlatList,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp, useFocusEffect } from '@react-navigation/native';
import Avatar from '../../components/common/Avatar';
import { fetchGroupMessages, markMessagesRead } from '../../api/messaging';
import { Message } from '../../types/messaging';
import { useAuth } from '../../store/AuthContext';
import { useUnreadCount } from '../../store/UnreadCountContext';
import { colors, spacing, typography } from '../../theme';
import { RootStackParamList } from '../../navigation/types';
import { fetchGroupDetail, acceptJoinRequest, denyJoinRequest } from '../../api/groups';

// ── Helpers ──────────────────────────────────────────────────────────────────

const genClientMsgId = (): string =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;

const SEND_TIMEOUT_MS = 12_000;

// ── Types ────────────────────────────────────────────────────────────────────

type NewDivider = { id: '__new_divider__'; isDivider: true };
type ListItem = Message | NewDivider;

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'GroupChat'>;
  route: RouteProp<RootStackParamList, 'GroupChat'>;
};

// ── Status icon ───────────────────────────────────────────────────────────────

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

export default function GroupChatScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { user: me } = useAuth();
  const { refresh: refreshUnread } = useUnreadCount();
  const { groupId, groupName, groupAvatar } = route.params;

  const [messages, setMessages] = useState<ListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [oldestId, setOldestId] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [text, setText] = useState('');
  const [userRole, setUserRole] = useState<'creator' | 'admin' | 'member' | null>(null);
  const [actingOnRequest, setActingOnRequest] = useState<string | null>(null);
  const flatRef = useRef<FlatList>(null);
  const newestIdRef = useRef<string | null>(null);
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
      const [page, detail] = await Promise.all([
        fetchGroupMessages(groupId),
        fetchGroupDetail(groupId).catch(() => null),
      ]);
      const reversed = [...page.results].reverse();
      const firstReadIdx = reversed.findIndex((m) => m.is_read);
      const listItems: ListItem[] = firstReadIdx > 0
        ? [...reversed.slice(0, firstReadIdx), { id: '__new_divider__', isDivider: true as const }, ...reversed.slice(firstReadIdx)]
        : reversed;
      setMessages(listItems);
      setHasMore(page.has_more);
      setOldestId(page.oldest_id ?? null);
      newestIdRef.current = page.newest_id ?? null;
      if (detail) setUserRole(detail.user_role);
      const unread = page.results
        .filter((m) => !m.is_read && String(m.sender) !== String(me?.id))
        .map((m) => String(m.id));
      if (unread.length) markMessagesRead(unread).then(refreshUnread).catch(() => {});
    } finally {
      setLoading(false);
    }
  }, [groupId, me?.id]);

  useEffect(() => { load(); }, [load]);

  // Subscribe to the group's WS channel.
  useEffect(() => {
    wsManager.subscribeGroup(groupId);
    const handler = () => wsManager.subscribeGroup(groupId);
    wsManager.on('connected', handler);
    return () => wsManager.off('connected', handler);
  }, [groupId]);

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore || !oldestId) return;
    setLoadingMore(true);
    try {
      const page = await fetchGroupMessages(groupId, { before_id: oldestId });
      setMessages((prev) => [...prev, ...[...page.results].reverse()]);
      setHasMore(page.has_more);
      setOldestId(page.oldest_id ?? null);
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, loadingMore, oldestId, groupId]);

  // Silently refresh on focus (e.g. after zap from InactiveStreakSheet).
  const initialMountRef = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (initialMountRef.current) {
        initialMountRef.current = false;
        return;
      }
      fetchGroupMessages(groupId).then((page) => {
        setMessages([...page.results].reverse());
        setHasMore(page.has_more);
        setOldestId(page.oldest_id ?? null);
        newestIdRef.current = page.newest_id ?? null;
        const unread = page.results
          .filter((m) => !m.is_read && String(m.sender) !== String(me?.id))
          .map((m) => String(m.id));
        if (unread.length) markMessagesRead(unread).then(refreshUnread).catch(() => {});
      }).catch(() => {});
    }, [groupId, me?.id]),
  );

  // ── WS: incoming messages ─────────────────────────────────────────────────

  useEffect(() => {
    const handler = (msg: Message) => {
      if (String(msg.group_id) !== String(groupId)) return;

      setMessages((prev) => {
        // Reconcile optimistic message by client_msg_id.
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
  }, [groupId, me?.id, refreshUnread]);

  // ── WS: gap-sync on reconnect ─────────────────────────────────────────────

  useEffect(() => {
    const handler = () => {
      const nid = newestIdRef.current;
      if (!nid) return;
      fetchGroupMessages(groupId, { after_id: nid, limit: 50 }).then((page) => {
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
  }, [groupId, me?.id, refreshUnread]);

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

  // ── WS: queue item flushed ────────────────────────────────────────────────

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

  const handleSend = () => {
    const content = text.trim();
    if (!content) return;

    const clientMsgId = genClientMsgId();
    setText('');

    const optimisticMsg: Message = {
      id: clientMsgId,
      sender: String(me?.id ?? ''),
      sender_username: null,
      sender_avatar_url: null,
      content,
      created_at: new Date().toISOString(),
      is_read: true,
      group_id: groupId,
      client_msg_id: clientMsgId,
      status: 'sending',
    };
    setMessages((prev) => [optimisticMsg, ...prev]);

    const result = wsManager.sendMessage({
      type: 'send_message',
      content,
      group_id: groupId,
      client_msg_id: clientMsgId,
    });

    if (result === 'queued') {
      setMessages((prev) =>
        prev.map((m) =>
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
    if (!clientMsgId || !msg.content) return;

    const existing = pendingTimers.current.get(clientMsgId);
    if (existing) {
      clearTimeout(existing);
      pendingTimers.current.delete(clientMsgId);
    }

    wsManager.removeFromQueue(clientMsgId);

    const result = wsManager.sendMessage({
      type: 'send_message',
      content: msg.content,
      group_id: groupId,
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
  }, [groupId]);

  const handleLongPress = useCallback((msg: Message) => {
    if (msg.status !== 'failed') return;
    Alert.alert(
      'Message Options',
      undefined,
      [
        {
          text: 'Retry',
          onPress: () => handleRetry(msg),
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            if (msg.client_msg_id) wsManager.removeFromQueue(msg.client_msg_id);
            setMessages((prev) => prev.filter((m) => m.id !== msg.id));
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  }, [handleRetry]);

  // ── Join request handlers ─────────────────────────────────────────────────

  const handleAccept = async (requestId: string) => {
    if (actingOnRequest) return;
    setActingOnRequest(requestId);
    try {
      await acceptJoinRequest(groupId, requestId);
      setMessages((prev) =>
        prev.map((m) => {
          if ('isDivider' in m) return m;
          return m.join_request_id === requestId
            ? { ...m, join_request_status: 'accepted' }
            : m;
        }),
      );
    } finally {
      setActingOnRequest(null);
    }
  };

  const handleDeny = async (requestId: string) => {
    if (actingOnRequest) return;
    setActingOnRequest(requestId);
    try {
      await denyJoinRequest(groupId, requestId);
      setMessages((prev) =>
        prev.map((m) => {
          if ('isDivider' in m) return m;
          return m.join_request_id === requestId
            ? { ...m, join_request_status: 'denied' }
            : m;
        }),
      );
    } finally {
      setActingOnRequest(null);
    }
  };

  const canManageRequests = userRole === 'creator' || userRole === 'admin';

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
    const isSystem = item.is_system;
    const isFailed = item.status === 'failed';

    if (isSystem) {
      const hasRequest = !!item.join_request_id;
      const isPending = item.join_request_status === 'pending';
      const isActing = actingOnRequest === item.join_request_id;

      return (
        <View style={styles.systemMsg}>
          <Text style={styles.systemMsgText}>{item.content}</Text>
          {hasRequest && canManageRequests && isPending && (
            <View style={styles.requestActions}>
              <Pressable
                style={[styles.acceptBtn, isActing && styles.actionBtnDisabled]}
                onPress={() => handleAccept(item.join_request_id!)}
                disabled={!!actingOnRequest}
              >
                {isActing ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.acceptBtnText}>Accept</Text>
                )}
              </Pressable>
              <Pressable
                style={[styles.denyBtn, isActing && styles.actionBtnDisabled]}
                onPress={() => handleDeny(item.join_request_id!)}
                disabled={!!actingOnRequest}
              >
                <Text style={styles.denyBtnText}>Deny</Text>
              </Pressable>
            </View>
          )}
          {hasRequest && !isPending && (
            <Text style={styles.requestStatusText}>
              {item.join_request_status === 'accepted' ? 'Accepted' : 'Denied'}
            </Text>
          )}
        </View>
      );
    }

    return (
      <View style={[styles.msgWrap, isOwn ? styles.msgWrapOwn : styles.msgWrapOther]}>
        {!isOwn && (
          <Pressable
            onPress={() => {
              if (item.sender_username) {
                navigation.navigate('Profile', { username: item.sender_username });
              }
            }}
          >
            <Avatar
              uri={item.sender_avatar_url}
              name={item.sender_username ?? '?'}
              size={28}
            />
          </Pressable>
        )}
        {isFailed ? (
          <Pressable
            style={{ maxWidth: '75%' }}
            onPress={() => handleRetry(item)}
            onLongPress={() => handleLongPress(item)}
            delayLongPress={400}
          >
            <View style={styles.msgContent}>
              {!isOwn && (
                <Text style={styles.senderName}>{item.sender_username ?? ''}</Text>
              )}
              <View style={[styles.bubble, isOwn ? styles.bubbleOwn : styles.bubbleOther, styles.bubbleFailed]}>
                <Text style={[styles.bubbleText, isOwn ? styles.bubbleTextOwn : styles.bubbleTextOther]}>
                  {item.content}
                </Text>
              </View>
              {isOwn && item.status != null && (
                <View style={styles.msgStatus}>
                  <MsgStatusIcon status={item.status} />
                </View>
              )}
            </View>
          </Pressable>
        ) : (
          <View style={{ maxWidth: '75%' }}>
            <View style={styles.msgContent}>
              {!isOwn && (
                <Text style={styles.senderName}>{item.sender_username ?? ''}</Text>
              )}
              <View style={[styles.bubble, isOwn ? styles.bubbleOwn : styles.bubbleOther]}>
                <Text style={[styles.bubbleText, isOwn ? styles.bubbleTextOwn : styles.bubbleTextOther]}>
                  {item.content}
                </Text>
              </View>
              {isOwn && item.status != null && (
                <View style={styles.msgStatus}>
                  <MsgStatusIcon status={item.status} />
                </View>
              )}
            </View>
          </View>
        )}
      </View>
    );
  }, [me?.id, actingOnRequest, canManageRequests, navigation, handleRetry, handleLongPress]);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background.base }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
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
            onPress={() => navigation.navigate('GroupProfile', { groupId })}
          >
            <Avatar uri={groupAvatar} name={groupName} size={42} />
            <Text style={styles.headerTitle} numberOfLines={1}>{groupName}</Text>
          </Pressable>
          <Pressable
            style={styles.infoBtn}
            onPress={() => navigation.navigate('GroupProfile', { groupId })}
            accessibilityLabel="Group info"
            accessibilityRole="button"
          >
            <Feather name="info" size={20} color={colors.textPrimary} />
          </Pressable>
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
              <Text style={styles.emptyText}>No messages yet</Text>
            </View>
          }
        />
      )}

      {/* Input bar */}
      <View style={[styles.inputBar, { paddingBottom: insets.bottom + spacing.sm }]}>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder="Message group…"
          placeholderTextColor={colors.textMuted}
          multiline
          maxLength={2000}
        />
        <Pressable
          style={[styles.sendBtn, !text.trim() && styles.sendBtnDisabled]}
          onPress={handleSend}
          disabled={!text.trim()}
        >
          <Feather name="send" size={18} color="#fff" />
        </Pressable>
      </View>
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
  infoBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  headerTitle: {
    fontSize: typography.size.lg,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  emptyText: { fontSize: typography.size.sm, color: colors.textMuted, textAlign: 'center' },
  systemMsg: {
    alignSelf: 'center',
    backgroundColor: colors.background.elevated,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginVertical: spacing.xs,
    alignItems: 'center',
    gap: spacing.sm,
    maxWidth: '85%',
  },
  systemMsgText: { fontSize: typography.size.xs, color: colors.textMuted, textAlign: 'center' },
  requestActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  acceptBtn: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    minWidth: 72,
    alignItems: 'center',
  },
  denyBtn: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: colors.border.default,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    minWidth: 72,
    alignItems: 'center',
  },
  actionBtnDisabled: { opacity: 0.5 },
  acceptBtnText: { fontSize: typography.size.xs, fontWeight: '700', color: '#fff' },
  denyBtnText: { fontSize: typography.size.xs, fontWeight: '600', color: colors.textSecondary },
  requestStatusText: {
    fontSize: typography.size.xs,
    fontWeight: '600',
    color: colors.textMuted,
    fontStyle: 'italic',
  },
  msgWrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  msgWrapOwn: { justifyContent: 'flex-end' },
  msgWrapOther: { justifyContent: 'flex-start' },
  msgContent: { gap: 2 },
  senderName: {
    fontSize: typography.size.xs,
    color: colors.textSecondary,
    marginLeft: spacing.xs,
  },
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
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border.subtle,
    backgroundColor: colors.surface,
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
});
