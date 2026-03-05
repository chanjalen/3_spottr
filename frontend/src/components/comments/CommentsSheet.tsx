import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  FlatList,
  Platform,
  Dimensions,
  Keyboard,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FeedItem } from '../../types/feed';
import CommentItem from './CommentItem';
import CommentInput from './CommentInput';
import { MentionableUser } from '../messages/MentionAutocomplete';
import { useComments } from '../../hooks/useComments';
import { useAuth } from '../../store/AuthContext';
import { fetchFriends, searchUsers } from '../../api/accounts';
import { colors, spacing, typography } from '../../theme';

const { height: SCREEN_H } = Dimensions.get('window');

// Sheet opens to this position (top edge of sheet from top of screen)
const SNAP_OPEN = SCREEN_H * 0.28;
// Drag past this → dismiss
const DISMISS_Y = SCREEN_H * 0.52;

interface CommentsSheetProps {
  item: FeedItem | null;
  onClose: () => void;
  onCommentCountChange?: (delta: number) => void;
  /** Override the default bottom offset (nav bar height). Pass insets.bottom when there is no tab bar. */
  bottomOffset?: number;
}

export default function CommentsSheet({ item, onClose, onCommentCountChange, bottomOffset }: CommentsSheetProps) {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  // When bottomOffset is passed (no tab bar), sheet extends to screen edge and
  // uses internal padding for the safe area instead.
  const noTabBar = bottomOffset !== undefined;
  const bottomNavHeight = noTabBar ? 0 : 52 + Math.max(insets.bottom, 16);
  const contentBottomPad = noTabBar ? Math.max(insets.bottom, 8) : 0;
  const [visible, setVisible] = useState(false);
  const [replyingTo, setReplyingTo] = useState<{ commentId: string; username: string } | null>(null);
  const [baseMentionUsers, setBaseMentionUsers] = useState<MentionableUser[]>([]);
  const [searchedMentionUsers, setSearchedMentionUsers] = useState<MentionableUser[]>([]);
  const mentionSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const itemRef = useRef<FeedItem | null>(null);
  useEffect(() => { itemRef.current = item; }, [item]);

  // ── Load mentionable users when a post's comments open ────────────────────
  useEffect(() => {
    if (!item) return;
    const postAuthor = item.user;
    const myId = String(user?.id ?? '');
    fetchFriends().then((friends) => {
      const seen = new Set<string>();
      const list: MentionableUser[] = [];
      // Post author first (if not self)
      if (postAuthor && String(postAuthor.id) !== myId) {
        seen.add(String(postAuthor.id));
        list.push({
          id: String(postAuthor.id),
          username: postAuthor.username,
          display_name: postAuthor.display_name,
          avatar_url: postAuthor.avatar_url,
        });
      }
      // Then mutual friends
      for (const f of friends) {
        if (String(f.id) !== myId && !seen.has(String(f.id))) {
          seen.add(String(f.id));
          list.push({
            id: String(f.id),
            username: f.username,
            display_name: f.display_name,
            avatar_url: f.avatar_url,
          });
        }
      }
      setBaseMentionUsers(list);
    }).catch(() => {});
  }, [item]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleMentionQueryChange = useCallback((query: string | null) => {
    if (mentionSearchTimer.current) clearTimeout(mentionSearchTimer.current);
    if (!query) {
      setSearchedMentionUsers([]);
      return;
    }
    mentionSearchTimer.current = setTimeout(async () => {
      try {
        const results = await searchUsers(query);
        const myId = String(user?.id ?? '');
        const baseIds = new Set(baseMentionUsers.map((u) => u.id));
        setSearchedMentionUsers(
          results
            .filter((u) => String(u.id) !== myId && !baseIds.has(String(u.id)))
            .map((u) => ({
              id: String(u.id),
              username: u.username,
              display_name: u.display_name,
              avatar_url: u.avatar_url,
            })),
        );
      } catch {
        // ignore
      }
    }, 300);
  }, [baseMentionUsers, user]);

  const sheetY        = useSharedValue(SCREEN_H);
  const dragStartY    = useSharedValue(SNAP_OPEN);
  const keyboardHeight = useSharedValue(0);
  const backdropOpacity = useSharedValue(0);

  const { comments, isLoading, loadComments, postComment, removeComment, likeComment, loadReplies, postReply } =
    useComments(onCommentCountChange);

  // ── Animate closed then call onClose ──────────────────────────────────────
  const animateClose = useCallback(() => {
    runOnJS(Keyboard.dismiss)();
    backdropOpacity.value = withTiming(0, { duration: 240 });
    sheetY.value = withTiming(SCREEN_H, { duration: 280 }, (done) => {
      if (done) {
        runOnJS(setVisible)(false);
        runOnJS(onClose)();
      }
    });
  }, [onClose, sheetY, backdropOpacity]);

  // ── Keyboard listeners ─────────────────────────────────────────────────────
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const show = Keyboard.addListener(showEvent, (e) => {
      keyboardHeight.value = withTiming(e.endCoordinates.height, {
        duration: Platform.OS === 'ios' ? e.duration : 200,
      });
    });
    const hide = Keyboard.addListener(hideEvent, (e) => {
      keyboardHeight.value = withTiming(0, {
        duration: Platform.OS === 'ios' ? e.duration : 200,
      });
    });

    return () => { show.remove(); hide.remove(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Open / close on item change ────────────────────────────────────────────
  useEffect(() => {
    if (item) {
      loadComments(item);
      setVisible(true);
      sheetY.value = SCREEN_H;
      backdropOpacity.value = 0;
      sheetY.value = withTiming(SNAP_OPEN, { duration: 320, easing: Easing.out(Easing.cubic) });
      backdropOpacity.value = withTiming(1, { duration: 280 });
    } else {
      animateClose();
    }
  }, [item]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Pan gesture ────────────────────────────────────────────────────────────
  const panGesture = Gesture.Pan()
    .onStart(() => {
      dragStartY.value = sheetY.value;
    })
    .onUpdate((e) => {
      const next = dragStartY.value + e.translationY;
      sheetY.value = Math.max(SNAP_OPEN, next);
      // Fade backdrop as user drags down
      const progress = Math.max(0, Math.min(1, 1 - (sheetY.value - SNAP_OPEN) / (DISMISS_Y - SNAP_OPEN)));
      backdropOpacity.value = progress;
    })
    .onEnd((e) => {
      if (sheetY.value > DISMISS_Y || e.velocityY > 700) {
        runOnJS(animateClose)();
      } else {
        sheetY.value = withSpring(SNAP_OPEN, { damping: 22, stiffness: 180 });
        backdropOpacity.value = withTiming(1, { duration: 200 });
      }
    });

  // ── Animated styles ────────────────────────────────────────────────────────
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value * 0.5,
  }));

  const sheetStyle = useAnimatedStyle(() => ({
    top: sheetY.value,
    bottom: bottomNavHeight,
  }));

  const keyboardSpacerStyle = useAnimatedStyle(() => ({
    height: Math.max(0, keyboardHeight.value - bottomNavHeight),
  }));

  if (!visible) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">

      {/* ── Dark backdrop ────────────────────────────────────────────────── */}
      <Animated.View pointerEvents="auto" style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={animateClose} />
      </Animated.View>

      {/* ── Comments sheet ─────────────────────────────────────────────── */}
      <Animated.View pointerEvents="auto" style={[styles.sheet, sheetStyle]}>

        {/* Drag handle + header */}
        <GestureDetector gesture={panGesture}>
          <View style={styles.handleArea}>
            <View style={styles.handle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>
                Comments{item ? ` (${item.comment_count})` : ''}
              </Text>
              <Pressable onPress={animateClose} hitSlop={12}>
                <Feather name="x" size={20} color={colors.textMuted} />
              </Pressable>
            </View>
          </View>
        </GestureDetector>

        {/* Comments list + input */}
        <View style={{ flex: 1 }}>
          {isLoading ? (
            <View style={styles.loader}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : (
            <FlatList
              style={{ flex: 1 }}
              data={comments}
              keyExtractor={(c) => String(c.id)}
              renderItem={({ item: comment }) => (
                <CommentItem
                  comment={comment}
                  currentUserId={user?.id}
                  onLike={likeComment}
                  onDelete={removeComment}
                  onLoadReplies={loadReplies}
                  onStartReply={(id, username) => setReplyingTo({ commentId: id, username })}
                />
              )}
              contentContainerStyle={styles.commentsList}
              ListEmptyComponent={
                <View style={styles.empty}>
                  <Text style={styles.emptyText}>No comments yet. Be the first!</Text>
                </View>
              }
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            />
          )}

          {replyingTo && (
            <View style={styles.replyBanner}>
              <Text style={styles.replyBannerText}>Replying to @{replyingTo.username}</Text>
              <Pressable onPress={() => setReplyingTo(null)} hitSlop={8}>
                <Text style={styles.cancelReply}>Cancel</Text>
              </Pressable>
            </View>
          )}

          <CommentInput
            placeholder="Add a comment..."
            prefill={replyingTo ? `@${replyingTo.username} ` : ''}
            onSubmit={(text, photo) => {
              const currentItem = itemRef.current;
              if (!currentItem) return;
              if (replyingTo) {
                postReply(replyingTo.commentId, text, photo);
                setReplyingTo(null);
              } else {
                postComment(currentItem, text, photo);
              }
            }}
            mentionableUsers={[...baseMentionUsers, ...searchedMentionUsers]}
            onMentionQueryChange={handleMentionQueryChange}
          />
          {contentBottomPad > 0 && <View style={{ height: contentBottomPad }} />}
          <Animated.View style={keyboardSpacerStyle} />
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: '#000',
  },

  // ── Comments sheet ────────────────────────────────────────────────────────
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -3 },
        shadowOpacity: 0.12,
        shadowRadius: 16,
      },
      android: { elevation: 10 },
    }),
  },
  handleArea: {
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.base,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: colors.border.default,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: spacing.sm,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: spacing.md,
  },
  sheetTitle: {
    fontSize: typography.size.md,
    fontFamily: typography.family.semibold,
    color: colors.textPrimary,
  },
  loader: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing['3xl'],
  },
  commentsList: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  empty: {
    alignItems: 'center',
    paddingVertical: spacing['3xl'],
  },
  emptyText: {
    fontSize: typography.size.sm,
    fontFamily: typography.family.regular,
    color: colors.textMuted,
  },
  replyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
    paddingBottom: 2,
    backgroundColor: colors.surface,
  },
  replyBannerText: {
    fontSize: typography.size.xs,
    fontFamily: typography.family.medium,
    color: colors.textMuted,
  },
  cancelReply: {
    fontSize: typography.size.xs,
    fontFamily: typography.family.semibold,
    color: colors.primary,
  },
});
