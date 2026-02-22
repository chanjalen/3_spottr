import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import Avatar from '../../components/common/Avatar';
import { useAuth } from '../../store/AuthContext';
import { fetchFollowers, fetchFollowing, fetchFriends, toggleFollow } from '../../api/accounts';
import { UserBrief } from '../../types/user';
import { colors, spacing, typography } from '../../theme';
import { RootStackParamList } from '../../navigation/types';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'UserList'>;
  route: RouteProp<RootStackParamList, 'UserList'>;
};

export default function UserListScreen({ navigation, route }: Props) {
  const { username, type, title } = route.params;
  const insets = useSafeAreaInsets();
  const { user: me } = useAuth();

  const [users, setUsers] = useState<UserBrief[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      let data: UserBrief[];
      if (type === 'followers') {
        data = await fetchFollowers(username);
      } else if (type === 'following') {
        data = await fetchFollowing(username);
      } else {
        data = await fetchFriends(username);
      }
      setUsers(data);
    } catch {
      // silently handle
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [username, type]);

  useEffect(() => {
    load();
  }, [load]);

  const handleUserPress = (u: UserBrief) => {
    navigation.navigate('Profile', { username: u.username });
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background.base }}>
      <View style={[styles.headerBar, { paddingTop: insets.top }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>{title}</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={users}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <UserRow user={item} onPress={() => handleUserPress(item)} isMe={me?.username === item.username} />
          )}
          contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); load(); }}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Feather name="users" size={40} color={colors.textMuted} />
              <Text style={styles.emptyText}>No {title.toLowerCase()} yet</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

// ─── User Row ─────────────────────────────────────────────────────────────────

function UserRow({
  user,
  onPress,
  isMe,
}: {
  user: UserBrief;
  onPress: () => void;
  isMe: boolean;
}) {
  const [following, setFollowing] = useState<boolean | null>(null);
  const [followLoading, setFollowLoading] = useState(false);

  const handleFollow = async (e: any) => {
    e.stopPropagation?.();
    setFollowLoading(true);
    try {
      const res = await toggleFollow(user.username);
      setFollowing(res.following);
    } finally {
      setFollowLoading(false);
    }
  };

  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      onPress={onPress}
    >
      <Avatar uri={user.avatar_url} name={user.display_name} size={44} />
      <View style={styles.rowInfo}>
        <Text style={styles.rowName} numberOfLines={1}>{user.display_name}</Text>
        <Text style={styles.rowUsername} numberOfLines={1}>@{user.username}</Text>
      </View>
      {!isMe && (
        <Pressable
          style={[
            styles.followBtn,
            (following === true) && styles.followBtnOutline,
          ]}
          onPress={handleFollow}
          disabled={followLoading}
        >
          {followLoading ? (
            <ActivityIndicator size="small" color={following ? colors.textPrimary : colors.textOnPrimary} />
          ) : (
            <Text style={[styles.followBtnText, (following === true) && styles.followBtnTextOutline]}>
              {following === true ? 'Following' : 'Follow'}
            </Text>
          )}
        </Pressable>
      )}
    </Pressable>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.sm,
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: typography.size.base,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingTop: spacing['2xl'],
  },
  emptyText: {
    fontSize: typography.size.base,
    color: colors.textMuted,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  rowPressed: {
    opacity: 0.7,
  },
  rowInfo: {
    flex: 1,
  },
  rowName: {
    fontSize: typography.size.base,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  rowUsername: {
    fontSize: typography.size.sm,
    color: colors.textMuted,
    marginTop: 1,
  },
  followBtn: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    minWidth: 84,
    alignItems: 'center',
    justifyContent: 'center',
  },
  followBtnOutline: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: colors.borderColor,
  },
  followBtnText: {
    fontSize: typography.size.sm,
    fontWeight: '600',
    color: colors.textOnPrimary,
  },
  followBtnTextOutline: {
    color: colors.textPrimary,
  },
});