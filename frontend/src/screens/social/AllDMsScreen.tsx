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
import { fetchDMConversations, sendZap } from '../../api/messaging';
import { Conversation } from '../../types/messaging';
import { colors, spacing, typography } from '../../theme';
import { RootStackParamList } from '../../navigation/types';
import { useUnreadCount } from '../../store/UnreadCountContext';
import { timeAgo } from '../../utils/timeAgo';
import { Message } from '../../types/messaging';

function msgPreview(msg: Message | null | undefined): string {
  if (!msg) return 'No messages yet';
  if (msg.content) return msg.content;
  if (msg.media?.length) return msg.media.some(m => m.kind === 'video') ? 'Video' : 'Photo';
  if (msg.shared_post) return 'Shared a post';
  return '';
}

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'AllDMs'>;
};

export default function AllDMsScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { optimisticDecrement } = useUnreadCount();
  const [dms, setDms] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [zapping, setZapping] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await fetchDMConversations();
      setDms(data);
    } catch {
      setDms([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = query.trim()
    ? dms.filter(d =>
        d.partner_display_name.toLowerCase().includes(query.toLowerCase()) ||
        d.partner_username.toLowerCase().includes(query.toLowerCase()),
      )
    : dms;

  const handleZap = async (partnerId: string) => {
    if (zapping) return;
    setZapping(partnerId);
    try { await sendZap(partnerId); } catch {} finally { setZapping(null); }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.title}>All Messages</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Search */}
      <View style={styles.searchWrap}>
        <Feather name="search" size={16} color={colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search conversations..."
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

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.partner_id}
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
              <Feather name="message-circle" size={40} color={colors.textMuted} />
              <Text style={styles.emptyText}>{query ? 'No results' : 'No conversations yet'}</Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              onPress={() => {
                if (item.unread_count > 0) {
                  optimisticDecrement(item.unread_count, 'dm');
                  setDms(prev => prev.map(d =>
                    d.partner_id === item.partner_id ? { ...d, unread_count: 0 } : d,
                  ));
                }
                navigation.navigate('Chat', {
                  partnerId: item.partner_id,
                  partnerName: item.partner_display_name,
                  partnerUsername: item.partner_username,
                  partnerAvatar: item.partner_avatar_url,
                });
              }}
            >
              <Avatar uri={item.partner_avatar_url} name={item.partner_display_name} size={48} />
              <View style={styles.rowInfo}>
                <View style={styles.rowTop}>
                  <Text style={styles.rowName} numberOfLines={1}>{item.partner_display_name}</Text>
                  {!!item.latest_message?.created_at && (
                    <Text style={styles.rowTime}>{timeAgo(item.latest_message.created_at)}</Text>
                  )}
                </View>
                <Text style={styles.rowLast} numberOfLines={1}>
                  {msgPreview(item.latest_message)}
                </Text>
              </View>
              {item.unread_count > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{item.unread_count}</Text>
                </View>
              )}
              {!item.partner_has_activity_today && (
                <Pressable
                  style={[styles.zapBtn, zapping === item.partner_id && styles.zapBtnDisabled]}
                  onPress={() => handleZap(item.partner_id)}
                  disabled={zapping !== null}
                  hitSlop={8}
                >
                  {zapping === item.partner_id
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Feather name="zap" size={15} color="#fff" />}
                </Pressable>
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
  rowName: { fontSize: typography.size.base, fontWeight: '600', color: colors.textPrimary, flexShrink: 1, marginRight: spacing.xs },
  rowTime: { fontSize: typography.size.xs, color: colors.textMuted },
  rowLast: { fontSize: typography.size.sm, color: colors.textSecondary },
  badge: {
    minWidth: 20, height: 20, borderRadius: 10,
    backgroundColor: '#E53935',
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4,
  },
  badgeText: { fontSize: 11, fontWeight: '700', color: '#fff' },
  zapBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: '#F97316',
    alignItems: 'center', justifyContent: 'center',
  },
  zapBtnDisabled: { opacity: 0.5 },
});
