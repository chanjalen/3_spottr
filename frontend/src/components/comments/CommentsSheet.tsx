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
import { useComments } from '../../hooks/useComments';
import { useAuth } from '../../store/AuthContext';
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
}

export default function CommentsSheet({ item, onClose, onCommentCountChange }: CommentsSheetProps) {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const bottomNavHeight = 52 + Math.max(insets.bottom, 16);
  const [visible, setVisible] = useState(false);
  const [replyingTo, setReplyingTo] = useState<{ commentId: string; username: string } | null>(null);

  const itemRef = useRef<FeedItem | null>(null);
  useEffect(() => { itemRef.current = item; }, [item]);

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
            placeholder={replyingTo ? `Reply to @${replyingTo.username}...` : 'Add a comment...'}
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
          />
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
