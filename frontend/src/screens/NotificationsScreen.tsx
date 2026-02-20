import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Avatar from '../components/common/Avatar';
import { fetchNotifications, markAllRead } from '../api/notifications';
import { Notification } from '../types/notification';
import { colors, spacing, typography } from '../theme';
import { RootStackParamList } from '../navigation/types';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Notifications'>;
};

const TYPE_ICONS: Record<string, React.ComponentProps<typeof Feather>['name']> = {
  like_post: 'heart',
  comment: 'message-circle',
  follow: 'user-plus',
  pr: 'award',
  group_invite: 'users',
  workout_invite: 'activity',
  join_request: 'user-check',
};

export default function NotificationsScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await fetchNotifications();
      setNotifications(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleMarkAll = async () => {
    await markAllRead();
    setNotifications((ns) => ns.map((n) => ({ ...n, is_read: true })));
  };

  const renderItem = ({ item }: { item: Notification }) => {
    const icon = TYPE_ICONS[item.type] ?? 'bell';
    return (
      <Pressable style={[styles.notifRow, !item.is_read && styles.notifRowUnread]}>
        <View style={styles.avatarWrap}>
          <Avatar uri={item.actor?.avatar_url ?? null} name={item.actor?.display_name ?? ''} size={44} />
          <View style={styles.typeIcon}>
            <Feather name={icon} size={12} color="#fff" />
          </View>
        </View>
        <View style={styles.notifContent}>
          <Text style={styles.notifMessage} numberOfLines={2}>{item.message}</Text>
          <Text style={styles.notifTime}>{item.time_ago}</Text>
        </View>
        {!item.is_read && <View style={styles.unreadDot} />}
      </Pressable>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background.base }}>
      {/* Header */}
      <View style={[styles.headerBar, { paddingTop: insets.top }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Notifications</Text>
        <Pressable onPress={handleMarkAll} style={styles.markAllBtn}>
          <Text style={styles.markAllText}>Mark all read</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Feather name="bell" size={40} color={colors.textMuted} />
              <Text style={styles.emptyText}>No notifications yet</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: typography.size.lg, fontWeight: '700', color: colors.textPrimary },
  markAllBtn: { paddingHorizontal: spacing.sm },
  markAllText: { fontSize: typography.size.xs, color: colors.primary, fontWeight: '600' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, paddingTop: spacing['2xl'] },
  emptyText: { fontSize: typography.size.base, color: colors.textMuted },
  notifRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  notifRowUnread: { backgroundColor: 'rgba(79,195,224,0.04)' },
  avatarWrap: { position: 'relative' },
  typeIcon: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.surface,
  },
  notifContent: { flex: 1, gap: 2 },
  notifMessage: { fontSize: typography.size.sm, color: colors.textPrimary, lineHeight: 18 },
  notifTime: { fontSize: typography.size.xs, color: colors.textMuted },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
});
