import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Image,
  Animated,
  PanResponder,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import Avatar from '../components/common/Avatar';
import {
  fetchNotifications,
  markAllRead,
  markRead,
  clearAllNotifications,
  dismissNotification,
  acceptWorkoutInvite,
  declineWorkoutInvite,
  acceptGroupJoinRequest,
  denyGroupJoinRequest,
  acceptWorkoutJoinRequest,
  denyWorkoutJoinRequest,
} from '../api/notifications';
import { followBack } from '../api/accounts';
import { Notification, NotificationActor } from '../types/notification';
import { colors, spacing, typography } from '../theme';
import { RootStackParamList } from '../navigation/types';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Notifications'>;
};

const SCREEN_WIDTH = Dimensions.get('window').width;
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.35;

// ─── Avatar Stack ─────────────────────────────────────────────────────────────

function AvatarStack({ actors }: { actors: NotificationActor[] }) {
  const shown = actors.slice(0, 3);
  const isSingle = shown.length === 1;
  return (
    <View style={[styles.avatarStack, isSingle && styles.avatarStackSingle]}>
      {shown.map((actor, i) => (
        <View
          key={actor.id}
          style={[
            styles.stackedAvatarWrap,
            !isSingle && { marginLeft: i === 0 ? 0 : -10, zIndex: shown.length - i },
          ]}
        >
          <Avatar uri={actor.avatar_url} name={actor.display_name} size={isSingle ? 44 : 36} />
        </View>
      ))}
    </View>
  );
}

// ─── Description box ──────────────────────────────────────────────────────────

function DescriptionBox({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > 80;
  return (
    <View style={styles.descBox}>
      <Text style={styles.descText} numberOfLines={expanded ? undefined : 2}>
        {text}
      </Text>
      {isLong && (
        <Pressable onPress={() => setExpanded((v) => !v)}>
          <Text style={styles.descToggle}>{expanded ? 'show less' : 'show more'}</Text>
        </Pressable>
      )}
    </View>
  );
}

// ─── Action Buttons ───────────────────────────────────────────────────────────

type ActionState = 'pending' | 'accepted' | 'declined' | 'loading';

function ActionButtons({ notification, onDone }: { notification: Notification; onDone: (id: string, remove?: boolean) => void }) {
  const [state, setState] = useState<ActionState>(notification.action_status ?? 'pending');
  const { type, target_type, target_id, context_id, actors } = notification;

  if (type === 'follow') {
    const actor = actors[0];
    if (!actor) return null;
    if (state === 'accepted') {
      return <View style={styles.actions}><Text style={styles.actionDone}>Following</Text></View>;
    }
    return (
      <View style={styles.actions}>
        <Pressable
          style={[styles.actionBtn, styles.actionAccept, state === 'loading' && styles.actionDisabled]}
          disabled={state === 'loading'}
          onPress={async () => {
            setState('loading');
            try {
              const res = await followBack(actor.id);
              if (res.action === 'followed') setState('accepted');
              else setState('pending');
            } catch {
              setState('pending');
            }
          }}
        >
          <Text style={styles.actionAcceptText}>
            {state === 'loading' ? '...' : 'Follow Back'}
          </Text>
        </Pressable>
      </View>
    );
  }

  if (type === 'workout_invite' && target_id) {
    if (state === 'accepted') {
      return <View style={styles.actions}><Text style={styles.actionDone}>Accepted</Text></View>;
    }
    return (
      <View style={styles.actions}>
        <Pressable
          style={[styles.actionBtn, styles.actionAccept, state === 'loading' && styles.actionDisabled]}
          disabled={state === 'loading'}
          onPress={async () => {
            setState('loading');
            try {
              await acceptWorkoutInvite(target_id);
              setState('accepted');
              onDone(notification.id);
            } catch { setState('pending'); }
          }}
        >
          <Text style={styles.actionAcceptText}>{state === 'loading' ? '...' : 'Accept'}</Text>
        </Pressable>
        <Pressable
          style={[styles.actionBtn, styles.actionDecline, state === 'loading' && styles.actionDisabled]}
          disabled={state === 'loading'}
          onPress={async () => {
            setState('loading');
            try {
              await declineWorkoutInvite(target_id);
              onDone(notification.id, true);
            } catch { setState('pending'); }
          }}
        >
          <Text style={styles.actionDeclineText}>Decline</Text>
        </Pressable>
      </View>
    );
  }

  if (type === 'join_request' && target_type === 'group' && target_id && context_id) {
    if (state === 'accepted') {
      return <View style={styles.actions}><Text style={styles.actionDone}>Accepted</Text></View>;
    }
    return (
      <View style={styles.actions}>
        <Pressable
          style={[styles.actionBtn, styles.actionAccept, state === 'loading' && styles.actionDisabled]}
          disabled={state === 'loading'}
          onPress={async () => {
            setState('loading');
            try {
              await acceptGroupJoinRequest(target_id, context_id);
              setState('accepted');
              onDone(notification.id);
            } catch { setState('pending'); }
          }}
        >
          <Text style={styles.actionAcceptText}>{state === 'loading' ? '...' : 'Accept'}</Text>
        </Pressable>
        <Pressable
          style={[styles.actionBtn, styles.actionDecline, state === 'loading' && styles.actionDisabled]}
          disabled={state === 'loading'}
          onPress={async () => {
            setState('loading');
            try {
              await denyGroupJoinRequest(target_id, context_id);
              onDone(notification.id, true);
            } catch { setState('pending'); }
          }}
        >
          <Text style={styles.actionDeclineText}>Decline</Text>
        </Pressable>
      </View>
    );
  }

  if (type === 'join_request' && target_type === 'workout_invite' && context_id) {
    if (state === 'accepted') {
      return <View style={styles.actions}><Text style={styles.actionDone}>Accepted</Text></View>;
    }
    return (
      <View style={styles.actions}>
        <Pressable
          style={[styles.actionBtn, styles.actionAccept, state === 'loading' && styles.actionDisabled]}
          disabled={state === 'loading'}
          onPress={async () => {
            setState('loading');
            try {
              await acceptWorkoutJoinRequest(context_id);
              setState('accepted');
              onDone(notification.id);
            } catch { setState('pending'); }
          }}
        >
          <Text style={styles.actionAcceptText}>{state === 'loading' ? '...' : 'Accept'}</Text>
        </Pressable>
        <Pressable
          style={[styles.actionBtn, styles.actionDecline, state === 'loading' && styles.actionDisabled]}
          disabled={state === 'loading'}
          onPress={async () => {
            setState('loading');
            try {
              await denyWorkoutJoinRequest(context_id);
              onDone(notification.id, true);
            } catch { setState('pending'); }
          }}
        >
          <Text style={styles.actionDeclineText}>Decline</Text>
        </Pressable>
      </View>
    );
  }

  return null;
}

// ─── Notification Row (inner content) ────────────────────────────────────────

function NotifRow({
  item,
  onPress,
  onActionDone,
}: {
  item: Notification;
  onPress: (n: Notification) => void;
  onActionDone: (id: string, remove?: boolean) => void;
}) {
  return (
    <Pressable
      style={[styles.notifRow, !item.is_read && styles.notifRowUnread]}
      onPress={() => onPress(item)}
    >
      <AvatarStack actors={item.actors} />

      <View style={styles.notifContent}>
        <Text style={styles.notifMessage}>{item.message}</Text>
        <Text style={styles.notifTime}>{item.time_ago}</Text>
        {!!item.description && <DescriptionBox text={item.description} />}
        <ActionButtons notification={item} onDone={onActionDone} />
      </View>

      <View style={styles.notifRight}>
        {item.thumbnail ? (
          <Image source={{ uri: item.thumbnail }} style={styles.thumbnail} />
        ) : !item.is_read ? (
          <View style={styles.unreadDot} />
        ) : null}
      </View>
    </Pressable>
  );
}

// ─── Swipable Row (swipe-left-to-delete wrapper) ──────────────────────────────

function SwipableNotifRow({
  item,
  onPress,
  onActionDone,
  onDismiss,
}: {
  item: Notification;
  onPress: (n: Notification) => void;
  onActionDone: (id: string, remove?: boolean) => void;
  onDismiss: (ids: string[]) => void;
}) {
  const translateX = useRef(new Animated.Value(0)).current;
  // Track the current animated value so we can read it on release
  // without accessing the private _value property
  const currentX = useRef(0);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      // Activate when clearly swiping left (horizontal dominates)
      onMoveShouldSetPanResponder: (_, gs) =>
        gs.dx < -8 && Math.abs(gs.dx) > Math.abs(gs.dy) * 1.5,
      onPanResponderGrant: () => {
        // Stop any in-progress spring/timing before a new gesture begins,
        // and capture the current position as the new offset so the row
        // doesn't jump to 0 on re-capture.
        translateX.stopAnimation();
        translateX.setOffset(currentX.current);
        translateX.setValue(0);
      },
      onPanResponderMove: (_, gs) => {
        // Only allow leftward movement
        translateX.setValue(Math.min(0, gs.dx));
      },
      onPanResponderRelease: () => {
        // flattenOffset folds the offset into the base value so currentX
        // correctly reflects the true position after this point.
        translateX.flattenOffset();
        if (currentX.current < -SWIPE_THRESHOLD) {
          // Swipe far enough — fly off then delete
          Animated.timing(translateX, {
            toValue: -SCREEN_WIDTH,
            duration: 220,
            useNativeDriver: true,
          }).start(() => {
            const ids = item.ids?.length ? item.ids : [item.id];
            onDismiss(ids);
          });
        } else {
          // Not far enough — spring back
          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
            overshootClamping: true,
          }).start();
        }
      },
      // Critical: don't let the FlatList (ScrollView) steal the gesture
      // once we've captured it — this was causing the freeze.
      onPanResponderTerminationRequest: () => false,
      onPanResponderTerminate: () => {
        // Safety net: if somehow terminated, spring back cleanly
        translateX.flattenOffset();
        currentX.current = 0;
        Animated.spring(translateX, {
          toValue: 0,
          useNativeDriver: true,
          overshootClamping: true,
        }).start();
      },
    })
  ).current;

  // Keep currentX in sync via listener (set up once on mount)
  useRef((() => {
    const id = translateX.addListener(({ value }) => {
      currentX.current = value;
    });
    return id;
  })());

  // Red bg fades in as you drag left
  const deleteOpacity = translateX.interpolate({
    inputRange: [-SCREEN_WIDTH, -SWIPE_THRESHOLD * 0.3, 0],
    outputRange: [1, 0.7, 0],
    extrapolate: 'clamp',
  });

  // Trash icon scales up as you approach / pass the threshold
  const iconScale = translateX.interpolate({
    inputRange: [-SCREEN_WIDTH, -SWIPE_THRESHOLD, 0],
    outputRange: [1.2, 1.0, 0.7],
    extrapolate: 'clamp',
  });

  return (
    <View style={styles.swipeContainer}>
      {/* Red delete background — revealed as row slides left */}
      <Animated.View style={[styles.swipeDeleteBg, { opacity: deleteOpacity }]}>
        <Animated.View style={{ transform: [{ scale: iconScale }] }}>
          <Feather name="trash-2" size={22} color="#fff" />
        </Animated.View>
      </Animated.View>

      {/* Row content that slides */}
      <Animated.View
        style={[styles.swipeRowContent, { transform: [{ translateX }] }]}
        {...panResponder.panHandlers}
      >
        <NotifRow item={item} onPress={onPress} onActionDone={onActionDone} />
      </Animated.View>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

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

  // Auto-read: when screen comes into focus, load notifications so the user
  // briefly sees which ones are new (bold/unread styling), then after 1.5s
  // mark them all as read so the unread indicator clears.
  useFocusEffect(useCallback(() => {
    load();
    const timer = setTimeout(async () => {
      try {
        await markAllRead();
        setNotifications(ns => ns.map(n => ({ ...n, is_read: true })));
      } catch {}
    }, 1500);
    return () => clearTimeout(timer);
  }, [load]));

  const handleMarkAll = async () => {
    await markAllRead();
    setNotifications((ns) => ns.map((n) => ({ ...n, is_read: true })));
  };

  const handleClearAll = () => {
    Alert.alert(
      'Clear Notifications',
      'Are you sure you want to delete all notifications?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            await clearAllNotifications();
            setNotifications([]);
          },
        },
      ],
    );
  };

  const handleDismiss = useCallback(async (ids: string[]) => {
    // Optimistically remove from list immediately
    setNotifications(ns => ns.filter(n => n.id !== ids[0]));
    try {
      await dismissNotification(ids);
    } catch {
      // Silent fail — row is already gone from view
    }
  }, []);

  const handlePress = async (item: Notification) => {
    const ids = item.ids?.length ? item.ids : [item.id];
    if (!item.is_read) {
      markRead(ids).catch(() => {});
      setNotifications((ns) =>
        ns.map((n) => (n.id === item.id ? { ...n, is_read: true } : n))
      );
    }

    const actor = item.actors[0];
    const { type, target_type, target_id, context_id, context_type } = item;

    if (type === 'like_post' && target_id) {
      navigation.navigate('PostDetail', { postId: target_id, itemType: 'post' });
    } else if (type === 'like_checkin' && target_id) {
      navigation.navigate('PostDetail', { postId: target_id, itemType: 'checkin' });
    } else if (type === 'like_comment' && target_id && context_id) {
      const itemType = context_type === 'post' ? 'post' : 'checkin';
      navigation.navigate('PostDetail', { postId: context_id, itemType, commentId: target_id });
    } else if (type === 'comment' && (context_type === 'comment_reply') && target_id) {
      const itemType = target_type === 'post' ? 'post' : 'checkin';
      navigation.navigate('PostDetail', { postId: target_id, itemType, commentId: context_id || undefined });
    } else if (type === 'comment' && target_type === 'post' && target_id) {
      navigation.navigate('PostDetail', { postId: target_id, itemType: 'post', commentId: context_id || undefined });
    } else if (type === 'comment' && target_type === 'quick_workout' && target_id) {
      navigation.navigate('PostDetail', { postId: target_id, itemType: 'checkin', commentId: context_id || undefined });
    } else if (type === 'mention' && target_type === 'comment' && context_id) {
      const itemType = context_type === 'post' ? 'post' : 'checkin';
      navigation.navigate('PostDetail', { postId: context_id, itemType, commentId: target_id || undefined });
    } else if (type === 'mention' && target_type === 'post' && target_id) {
      navigation.navigate('PostDetail', { postId: target_id, itemType: 'post' });
    } else if (type === 'mention' && target_type === 'quick_workout' && target_id) {
      navigation.navigate('PostDetail', { postId: target_id, itemType: 'checkin' });
    } else if (type === 'follow' && actor) {
      navigation.navigate('Profile', { username: actor.username });
    } else if (type === 'pr' && actor) {
      navigation.navigate('Profile', { username: actor.username });
    } else if (type === 'join_request' && target_type === 'group' && target_id) {
      navigation.navigate('GroupProfile', { groupId: target_id });
    } else if (type === 'workout_invite' && item.gym_id && item.gym_name) {
      navigation.navigate('GymDetail', { gymId: item.gym_id, gymName: item.gym_name });
    } else if (type === 'join_request' && target_type === 'workout_invite' && item.gym_id && item.gym_name) {
      navigation.navigate('GymDetail', { gymId: item.gym_id, gymName: item.gym_name });
    } else if (actor) {
      navigation.navigate('Profile', { username: actor.username });
    }
  };

  const handleActionDone = (id: string, remove = false) => {
    if (remove) {
      setNotifications((ns) => ns.filter((n) => n.id !== id));
    } else {
      setNotifications((ns) =>
        ns.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      );
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background.base }}>
      <LinearGradient
        colors={['#4FC3E0', '#6DCFE8', '#A8E2F4', '#D6F2FB', '#FFFFFF']}
        locations={[0, 0.2, 0.5, 0.75, 1]}
        style={{ paddingBottom: spacing.lg }}
      >
        <View style={[styles.headerBar, { paddingTop: insets.top + 8 }]}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Feather name="arrow-left" size={22} color={colors.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>Notifications</Text>
          <View style={styles.headerActions}>
            <Pressable onPress={handleMarkAll}>
              <Text style={styles.markAllText}>Mark all read</Text>
            </Pressable>
            <Pressable onPress={handleClearAll}>
              <Text style={styles.clearText}>Clear</Text>
            </Pressable>
          </View>
        </View>
      </LinearGradient>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <SwipableNotifRow
              item={item}
              onPress={handlePress}
              onActionDone={handleActionDone}
              onDismiss={handleDismiss}
            />
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
              <Feather name="bell" size={40} color={colors.textMuted} />
              <Text style={styles.emptyText}>No notifications yet</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.base,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: typography.size.xl, fontWeight: '700', color: colors.textPrimary },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  markAllText: { fontSize: typography.size.sm, color: colors.primary, fontWeight: '600' },
  clearText: { fontSize: typography.size.sm, color: colors.error, fontWeight: '600' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, paddingTop: spacing['2xl'] },
  emptyText: { fontSize: typography.size.base, color: colors.textMuted },

  // Swipe container
  swipeContainer: {
    position: 'relative',
    overflow: 'hidden',
  },
  swipeDeleteBg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#ef4444',
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingRight: spacing.xl,
  },
  swipeRowContent: {
    backgroundColor: colors.background.base,
  },

  // Row
  notifRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  notifRowUnread: { backgroundColor: 'rgba(79,195,224,0.04)' },

  // Avatar stack
  avatarStack: { flexDirection: 'row', alignItems: 'center' },
  avatarStackSingle: {},
  stackedAvatarWrap: {},

  // Content
  notifContent: { flex: 1, gap: 3 },
  notifMessage: { fontSize: typography.size.sm, color: colors.textPrimary, lineHeight: 18 },
  notifTime: { fontSize: typography.size.xs, color: colors.textMuted },

  // Description
  descBox: { marginTop: spacing.xs, backgroundColor: colors.background.elevated, borderRadius: 8, padding: spacing.sm },
  descText: { fontSize: typography.size.xs, color: colors.textSecondary, lineHeight: 16 },
  descToggle: { fontSize: typography.size.xs, color: colors.primary, marginTop: 2 },

  // Actions
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  actionBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 8,
  },
  actionAccept: { backgroundColor: colors.primary },
  actionDecline: { backgroundColor: colors.background.elevated, borderWidth: 1, borderColor: colors.border.subtle },
  actionDisabled: { opacity: 0.5 },
  actionAcceptText: { fontSize: typography.size.xs, fontWeight: '700', color: '#000' },
  actionDeclineText: { fontSize: typography.size.xs, fontWeight: '600', color: colors.textSecondary },
  actionDone: { fontSize: typography.size.xs, color: colors.textMuted, paddingVertical: spacing.xs },

  // Right side
  notifRight: { alignItems: 'center', justifyContent: 'center', minWidth: 20 },
  thumbnail: { width: 44, height: 44, borderRadius: 6, backgroundColor: colors.background.elevated },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary },
});
