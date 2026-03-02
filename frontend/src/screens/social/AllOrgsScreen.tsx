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
import { listMyOrgs, OrgListItem, LatestAnnouncement } from '../../api/organizations';
import { colors, spacing, typography } from '../../theme';
import { RootStackParamList } from '../../navigation/types';
import { useUnreadCount } from '../../store/UnreadCountContext';
import { timeAgo } from '../../utils/timeAgo';
import { staleCache } from '../../utils/staleCache';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'AllOrgs'>;
};

const annPreviewText = (ann: LatestAnnouncement): string => {
  if (ann.content) return ann.content;
  if (ann.has_poll) return 'Poll';
  if (ann.has_media) return 'Photo';
  return '';
};

export default function AllOrgsScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { optimisticDecrement } = useUnreadCount();
  const [orgs, setOrgs] = useState<OrgListItem[]>(() => staleCache.getSync<OrgListItem[]>('social:orgs') ?? []);
  const [loading, setLoading] = useState(() => staleCache.getSync<OrgListItem[]>('social:orgs') === null);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    const cached = await staleCache.get<OrgListItem[]>('social:orgs');
    if (cached) {
      setOrgs(cached);
      setLoading(false);
    }

    try {
      const data = await listMyOrgs();
      staleCache.set('social:orgs', data, 2 * 60 * 1000);
      setOrgs(data);
    } catch {
      if (!cached) setOrgs([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = query.trim()
    ? orgs.filter(o => o.name.toLowerCase().includes(query.toLowerCase()))
    : orgs;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.title}>All Organizations</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Search */}
      <View style={styles.searchWrap}>
        <Feather name="search" size={16} color={colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search organizations..."
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

      {loading && orgs.length === 0 ? (
        <ConversationSkeleton />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
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
              <Feather name="award" size={40} color={colors.textMuted} />
              <Text style={styles.emptyText}>{query ? 'No results' : 'No organizations yet'}</Text>
            </View>
          }
          renderItem={({ item }) => {
            const ann = item.latest_announcement;
            const roleBg = item.user_role === 'creator'
              ? 'rgba(234,179,8,0.15)'
              : item.user_role === 'admin'
              ? 'rgba(79,195,224,0.15)'
              : 'rgba(0,0,0,0.06)';
            return (
              <Pressable
                style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                onPress={() => {
                  if (item.unread_count > 0) {
                    optimisticDecrement(item.unread_count, 'org');
                    setOrgs(prev => prev.map(o =>
                      o.id === item.id ? { ...o, unread_count: 0 } : o,
                    ));
                  }
                  navigation.navigate('OrgAnnouncements', {
                    orgId: item.id,
                    orgName: item.name,
                    orgAvatar: item.avatar_url,
                  });
                }}
              >
                <Avatar uri={item.avatar_url} name={item.name} size={48} />
                <View style={styles.rowInfo}>
                  <View style={styles.rowTop}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 }}>
                      <Text style={styles.rowName} numberOfLines={1}>{item.name}</Text>
                      {item.privacy === 'private' && (
                        <Feather name="lock" size={12} color={colors.textMuted} />
                      )}
                    </View>
                    {ann
                      ? <Text style={styles.rowTime}>{timeAgo(ann.created_at)}</Text>
                      : <Text style={styles.memberCount}>{item.member_count} members</Text>
                    }
                  </View>
                  {ann ? (
                    <Text style={styles.rowLast} numberOfLines={1}>
                      {ann.author_display_name}: {annPreviewText(ann)}
                    </Text>
                  ) : !!item.description && (
                    <Text style={styles.rowLast} numberOfLines={1}>{item.description}</Text>
                  )}
                </View>
                {item.unread_count > 0 ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{item.unread_count}</Text>
                  </View>
                ) : item.user_role ? (
                  <View style={[styles.roleBadge, { backgroundColor: roleBg }]}>
                    <Text style={styles.roleBadgeText}>{item.user_role}</Text>
                  </View>
                ) : null}
              </Pressable>
            );
          }}
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
  memberCount: { fontSize: typography.size.xs, color: colors.textMuted },
  rowLast: { fontSize: typography.size.sm, color: colors.textSecondary },
  badge: {
    minWidth: 20, height: 20, borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4,
  },
  badgeText: { fontSize: 11, fontWeight: '700', color: '#fff' },
  roleBadge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  roleBadgeText: { fontSize: 11, fontWeight: '600', color: colors.textSecondary },
});
