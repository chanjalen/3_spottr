import React, { useCallback, useEffect, useRef, useState } from 'react';
import { wsManager } from '../../services/websocket';
import { Message as MessageType } from '../../types/messaging';
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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp, useFocusEffect } from '@react-navigation/native';
import Avatar from '../../components/common/Avatar';
import { fetchDMMessages, sendDM, markMessagesRead } from '../../api/messaging';
import { Message } from '../../types/messaging';
import { useAuth } from '../../store/AuthContext';
import { useUnreadCount } from '../../store/UnreadCountContext';
import { colors, spacing, typography } from '../../theme';
import { RootStackParamList } from '../../navigation/types';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Chat'>;
  route: RouteProp<RootStackParamList, 'Chat'>;
};

export default function ChatScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { user: me } = useAuth();
  const { refresh: refreshUnread } = useUnreadCount();
  const { partnerId, partnerName, partnerUsername, partnerAvatar } = route.params;

  // Stored newest-first so inverted FlatList shows newest at the bottom naturally.
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [oldestId, setOldestId] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const flatRef = useRef<FlatList>(null);

  const load = useCallback(async () => {
    try {
      const page = await fetchDMMessages(partnerId);
      // Backend returns oldest-first; reverse so index 0 = newest (required for inverted list).
      setMessages([...page.results].reverse());
      setHasMore(page.has_more);
      setOldestId(page.oldest_id ?? null);
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
      // Append to the end of the newest-first array (visually: top of the chat).
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
        const unread = page.results
          .filter((m) => !m.is_read && String(m.sender) !== String(me?.id))
          .map((m) => String(m.id));
        if (unread.length) markMessagesRead(unread).then(refreshUnread).catch(() => {});
      }).catch(() => {});
    }, [partnerId, me?.id]),
  );

  // Prepend incoming WS messages so they appear at the visual bottom (index 0 in newest-first).
  useEffect(() => {
    const handler = (msg: MessageType) => {
      const isFromPartner = String(msg.sender) === String(partnerId);
      if (!isFromPartner) return;
      if (String(msg.sender) === String(me?.id)) return;

      setMessages((prev) => {
        if (prev.some((m) => String(m.id) === String(msg.id))) return prev;
        return [msg, ...prev];
      });
    };

    wsManager.on('new_message', handler);
    return () => wsManager.off('new_message', handler);
  }, [partnerId, me?.id]);

  const handleSend = async () => {
    const content = text.trim();
    if (!content || sending) return;
    setSending(true);
    setText('');
    try {
      const msg = await sendDM(partnerId, content);
      // Prepend so the new message appears at the visual bottom.
      setMessages((prev) => [msg, ...prev]);
    } finally {
      setSending(false);
    }
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const isOwn = String(item.sender) === String(me?.id);
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
        <View style={[styles.bubble, isOwn ? styles.bubbleOwn : styles.bubbleOther]}>
          <Text style={[styles.bubbleText, isOwn ? styles.bubbleTextOwn : styles.bubbleTextOther]}>
            {item.content}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background.base }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      {/* Header */}
      <View style={[styles.headerBar, { paddingTop: insets.top }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.textPrimary} />
        </Pressable>
        <Pressable
          style={styles.headerInfo}
          onPress={() => navigation.navigate('Profile', { username: partnerUsername })}
        >
          <Avatar uri={partnerAvatar} name={partnerName} size={32} />
          <Text style={styles.headerTitle} numberOfLines={1}>{partnerName}</Text>
        </Pressable>
        <View style={{ width: 40 }} />
      </View>

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
          renderItem={renderMessage}
          contentContainerStyle={{ padding: spacing.base, gap: spacing.sm, paddingTop: 16 }}
          onEndReached={loadMore}
          onEndReachedThreshold={0.2}
          // In inverted mode, ListFooterComponent renders at the visual top (oldest messages).
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
      <View style={[styles.inputBar, { paddingBottom: insets.bottom + spacing.sm }]}>
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
          style={[styles.sendBtn, (!text.trim() || sending) && styles.sendBtnDisabled]}
          onPress={handleSend}
          disabled={!text.trim() || sending}
        >
          {sending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Feather name="send" size={18} color="#fff" />
          )}
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
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  headerTitle: {
    fontSize: typography.size.base,
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
    maxWidth: '75%',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 16,
  },
  bubbleOwn: { backgroundColor: colors.primary, borderBottomRightRadius: 4 },
  bubbleOther: { backgroundColor: colors.background.elevated, borderBottomLeftRadius: 4 },
  bubbleText: { fontSize: typography.size.sm, lineHeight: 20 },
  bubbleTextOwn: { color: '#fff' },
  bubbleTextOther: { color: colors.textPrimary },
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
});
