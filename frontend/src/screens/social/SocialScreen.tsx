import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import Avatar from '../../components/common/Avatar';
import { fetchDMConversations, fetchGroupConversations } from '../../api/messaging';
import { Conversation, GroupConversation } from '../../types/messaging';
import { colors, spacing, typography } from '../../theme';
import { SocialStackParamList } from '../../navigation/types';
import AppHeader from '../../components/navigation/AppHeader';
import { timeAgo } from '../../utils/timeAgo';

type Props = {
  navigation: NativeStackNavigationProp<SocialStackParamList, 'SocialHome'>;
};

type SocialTab = 'Chats' | 'Groups';

export default function SocialScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<SocialTab>('Chats');
  const [dms, setDms] = useState<Conversation[]>([]);
  const [groups, setGroups] = useState<GroupConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [dmData, groupData] = await Promise.all([
        fetchDMConversations().catch(() => []),
        fetchGroupConversations().catch(() => []),
      ]);
      setDms(dmData);
      setGroups(groupData);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const renderDM = ({ item }: { item: Conversation }) => {
    if (!item.partner) return null;
    return (
    <Pressable
      style={({ pressed }) => [styles.convoRow, pressed && styles.convoRowPressed]}
      onPress={() => navigation.navigate('Chat', {
        partnerId: item.partner.id,
        partnerName: item.partner.display_name,
        partnerAvatar: item.partner.avatar_url,
      })}
    >
      <Avatar uri={item.partner.avatar_url} name={item.partner.display_name} size={48} />
      <View style={styles.convoInfo}>
        <View style={styles.convoTopRow}>
          <Text style={styles.convoName} numberOfLines={1}>{item.partner.display_name}</Text>
          {item.last_message_at && <Text style={styles.convoTime}>{timeAgo(item.last_message_at)}</Text>}
        </View>
        <Text style={styles.convoLast} numberOfLines={1}>{item.last_message ?? 'No messages yet'}</Text>
      </View>
      {item.unread_count > 0 && (
        <View style={styles.unreadBadge}>
          <Text style={styles.unreadBadgeText}>{item.unread_count}</Text>
        </View>
      )}
    </Pressable>
    );
  };

  const renderGroup = ({ item }: { item: GroupConversation }) => (
    <Pressable
      style={({ pressed }) => [styles.convoRow, pressed && styles.convoRowPressed]}
      onPress={() => navigation.navigate('GroupChat', { groupId: item.id, groupName: item.name })}
    >
      <Avatar uri={item.avatar_url} name={item.name} size={48} />
      <View style={styles.convoInfo}>
        <View style={styles.convoTopRow}>
          <Text style={styles.convoName} numberOfLines={1}>{item.name}</Text>
          {item.last_message_at && <Text style={styles.convoTime}>{timeAgo(item.last_message_at)}</Text>}
        </View>
        <Text style={styles.convoLast} numberOfLines={1}>{item.last_message ?? 'No messages yet'}</Text>
      </View>
      {item.unread_count > 0 && (
        <View style={styles.unreadBadge}>
          <Text style={styles.unreadBadgeText}>{item.unread_count}</Text>
        </View>
      )}
    </Pressable>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background.base }}>
      <AppHeader />

      {/* Tab row */}
      <View style={styles.tabRow}>
        {(['Chats', 'Groups'] as SocialTab[]).map((tab) => (
          <Pressable key={tab} style={styles.tab} onPress={() => setActiveTab(tab)}>
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>{tab}</Text>
            {activeTab === tab && <View style={styles.tabIndicator} />}
          </Pressable>
        ))}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : activeTab === 'Chats' ? (
        <FlatList
          data={dms}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderDM}
          contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Feather name="message-circle" size={40} color={colors.textMuted} />
              <Text style={styles.emptyText}>No conversations yet</Text>
            </View>
          }
        />
      ) : (
        <FlatList
          data={groups}
          keyExtractor={(item) => item.id}
          renderItem={renderGroup}
          contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Feather name="users" size={40} color={colors.textMuted} />
              <Text style={styles.emptyText}>No groups yet</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tabRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.border.default,
  },
  tab: { flex: 1, alignItems: 'center', paddingVertical: spacing.md },
  tabText: { fontSize: typography.size.sm, fontWeight: '500', color: colors.textSecondary },
  tabTextActive: { fontWeight: '700', color: colors.textPrimary },
  tabIndicator: {
    position: 'absolute',
    bottom: 0,
    left: '25%',
    right: '25%',
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.primary,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, paddingTop: spacing['2xl'] },
  emptyText: { fontSize: typography.size.base, color: colors.textMuted },
  convoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  convoRowPressed: { backgroundColor: colors.background.elevated },
  convoInfo: { flex: 1, gap: 2 },
  convoTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  convoName: { fontSize: typography.size.base, fontWeight: '600', color: colors.textPrimary },
  convoTime: { fontSize: typography.size.xs, color: colors.textMuted },
  convoLast: { fontSize: typography.size.sm, color: colors.textSecondary },
  unreadBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  unreadBadgeText: { fontSize: 11, fontWeight: '700', color: '#fff' },
});
