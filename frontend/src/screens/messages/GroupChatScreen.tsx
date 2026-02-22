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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import Avatar from '../../components/common/Avatar';
import { fetchGroupMessages, sendGroupMessage, markMessagesRead } from '../../api/messaging';
import { Message } from '../../types/messaging';
import { useAuth } from '../../store/AuthContext';
import { useUnreadCount } from '../../store/UnreadCountContext';
import { colors, spacing, typography } from '../../theme';
import { RootStackParamList } from '../../navigation/types';
import { fetchGroupDetail, acceptJoinRequest, denyJoinRequest } from '../../api/groups';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'GroupChat'>;
  route: RouteProp<RootStackParamList, 'GroupChat'>;
};

export default function GroupChatScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { user: me } = useAuth();
  const { refresh: refreshUnread } = useUnreadCount();
  const { groupId, groupName, groupAvatar } = route.params;

  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [userRole, setUserRole] = useState<'creator' | 'admin' | 'member' | null>(null);
  const [actingOnRequest, setActingOnRequest] = useState<string | null>(null); // requestId being acted on
  const flatRef = useRef<FlatList>(null);

  const load = useCallback(async () => {
    try {
      const [page, detail] = await Promise.all([
        fetchGroupMessages(groupId),
        fetchGroupDetail(groupId).catch(() => null),
      ]);
      // results are oldest-first from the backend; display oldest at top
      setMessages(page.results);
      if (detail) setUserRole(detail.user_role);
      // Mark unread messages as read
      const unread = page.results
        .filter((m) => !m.is_read && String(m.sender) !== String(me?.id))
        .map((m) => String(m.id));
      if (unread.length) markMessagesRead(unread).then(refreshUnread).catch(() => {});
    } finally {
      setLoading(false);
    }
  }, [groupId, me?.id]);

  useEffect(() => { load(); }, [load]);

  const handleSend = async () => {
    const content = text.trim();
    if (!content || sending) return;
    setSending(true);
    setText('');
    try {
      const msg = await sendGroupMessage(groupId, content);
      setMessages((prev) => [...prev, msg]);
      flatRef.current?.scrollToEnd({ animated: true });
    } finally {
      setSending(false);
    }
  };

  const handleAccept = async (requestId: string) => {
    if (actingOnRequest) return;
    setActingOnRequest(requestId);
    try {
      await acceptJoinRequest(groupId, requestId);
      setMessages((prev) =>
        prev.map((m) =>
          m.join_request_id === requestId
            ? { ...m, join_request_status: 'accepted' }
            : m,
        ),
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
        prev.map((m) =>
          m.join_request_id === requestId
            ? { ...m, join_request_status: 'denied' }
            : m,
        ),
      );
    } finally {
      setActingOnRequest(null);
    }
  };

  const canManageRequests = userRole === 'creator' || userRole === 'admin';

  const renderMessage = ({ item }: { item: Message }) => {
    const isOwn = String(item.sender) === String(me?.id);
    const isSystem = item.is_system;

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
        <View style={styles.msgContent}>
          {!isOwn && (
            <Text style={styles.senderName}>{item.sender_username ?? ''}</Text>
          )}
          <View style={[styles.bubble, isOwn ? styles.bubbleOwn : styles.bubbleOther]}>
            <Text style={[styles.bubbleText, isOwn ? styles.bubbleTextOwn : styles.bubbleTextOther]}>
              {item.content}
            </Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background.base }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View style={[styles.headerBar, { paddingTop: insets.top }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.textPrimary} />
        </Pressable>
        <Pressable
          style={styles.headerInfo}
          onPress={() => navigation.navigate('GroupProfile', { groupId })}
        >
          <Avatar uri={groupAvatar} name={groupName} size={32} />
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

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          ref={flatRef}
          data={messages}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderMessage}
          contentContainerStyle={{ padding: spacing.base, gap: spacing.sm, paddingBottom: 16 }}
          onContentSizeChange={() => flatRef.current?.scrollToEnd({ animated: false })}
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
  infoBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  headerTitle: {
    fontSize: typography.size.base,
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
  msgContent: { maxWidth: '75%', gap: 2 },
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
