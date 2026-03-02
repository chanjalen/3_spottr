import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Avatar from '../../components/common/Avatar';
import ConversationSkeleton from '../../components/common/ConversationSkeleton';
import { fetchGroupConversations } from '../../api/messaging';
import { GroupConversation } from '../../types/messaging';
import { colors, spacing, typography } from '../../theme';
import { RootStackParamList } from '../../navigation/types';
import { useUnreadCount } from '../../store/UnreadCountContext';
import { timeAgo } from '../../utils/timeAgo';
import { Message } from '../../types/messaging';
import { staleCache } from '../../utils/staleCache';

function groupMsgPreview(msg: Message | null | undefined): string {
  if (!msg) return 'No messages yet';
  const sender = msg.sender_username ? `${msg.sender_username}: ` : '';
  if (msg.content) return `${sender}${msg.content}`;
  if (msg.media?.length) return `${sender}${msg.media.some(m => m.kind === 'video') ? 'Video' : 'Photo'}`;
  if (msg.shared_post) return `${sender}Shared a post`;
  return '';
}

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'AllGroupChats'>;
};

export default function AllGroupChatsScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { optimisticDecrement } = useUnreadCount();
  const [groups, setGroups] = useState<GroupConversation[]>(() => staleCache.getSync<GroupConversation[]>('social:messages:groups') ?? []);
  const [loading, setLoading] = useState(() => staleCache.getSync<GroupConversation[]>('social:messages:groups') === null);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    const cached = await staleCache.get<GroupConversation[]>('social:messages:groups');
    if (cached) {
      setGroups(cached);
      setLoading(false);
    }

    try {
      const data = await fetchGroupConversations();
      staleCache.set('social:messages:groups', data, 2 * 60 * 1000);
      setGroups(data);
    } catch {
      if (!cached) setGroups([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = query.trim()
    ? groups.filter(g =>
        g.group_name.toLowerCase().includes(query.toLowerCase()),
      )
    : groups;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.title}>All Group Chats</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Search */}
      <View style={styles.searchWrap}>
        <Feather name="search" size={16} color={colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search group chats..."
          placeholderTextColor={colors.textMuted}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
        />
        {!!query && (
          <Pressable onPress={() => setQuery('')} hitSlop={8}>
            <Feather name="x" size={16} color={colors.textMuted} />
          </Pressable>
        )}
      </View>

      {loading && groups.length === 0 ? (
        <ConversationSkeleton />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.group_id}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); load(); }}
              tintColor={colors.primary}
            />
          }
          contentContainerStyle={{ flexGrow: 1, paddingBottom: insets.bottom + 40 }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Feather name="users" size={40} color={colors.textMuted} />
              <Text style={styles.emptyText}>{query ? 'No results' : 'No group chats yet'}</Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              onPress={() => {
                if (item.unread_count > 0) {
                  optimisticDecrement(item.unread_count, 'group');
                  setGroups(prev => prev.map(g =>
                    g.group_id === item.group_id ? { ...g, unread_count: 0 } : g,
                  ));
                }
                navigation.navigate('GroupChat', {
                  groupId: item.group_id,
                  groupName: item.group_name,
                  groupAvatar: item.avatar_url,
                });
              }}
            >
              <Avatar uri={item.avatar_url} name={item.group_name} size={48} />
              <View style={styles.rowInfo}>
                <View style={styles.rowTop}>
                  <View style={styles.nameStreakRow}>
                    <Text style={styles.rowName} numberOfLines={1}>{item.group_name}</Text>
                    {item.group_streak > 0 && (
                      <View style={styles.streakBadge}>
                        <Text style={styles.streakText}>🔥 {item.group_streak}</Text>
                      </View>
                    )}
                  </View>
                  {!!item.latest_message?.created_at && (
                    <Text style={styles.rowTime}>{timeAgo(item.latest_message.created_at)}</Text>
                  )}
                </View>
                <Text style={styles.rowLast} numberOfLines={1}>
                  {groupMsgPreview(item.latest_message)}
                </Text>
              </View>
              {item.unread_count > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{item.unread_count}</Text>
                </View>
              )}
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background.base },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: typography.size.base,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    margin: spacing.base,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.background.elevated,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  searchInput: { flex: 1, fontSize: typography.size.sm, color: colors.textPrimary },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingTop: 60 },
  emptyText: { fontSize: typography.size.sm, color: colors.textMuted },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  rowPressed: { backgroundColor: colors.background.elevated },
  rowInfo: { flex: 1, gap: 2 },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  nameStreakRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  rowName: { fontSize: typography.size.base, fontWeight: '600', color: colors.textPrimary, flexShrink: 1 },
  streakBadge: {
    backgroundColor: 'rgba(249,115,22,0.12)',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  streakText: { fontSize: 11, fontWeight: '600', color: '#F97316' },
  rowTime: { fontSize: typography.size.xs, color: colors.textMuted },
  rowLast: { fontSize: typography.size.sm, color: colors.textSecondary },
  badge: {
    minWidth: 20, height: 20, borderRadius: 10,
    backgroundColor: '#E53935',
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4,
  },
  badgeText: { fontSize: 11, fontWeight: '700', color: '#fff' },
});
