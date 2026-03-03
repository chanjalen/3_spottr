import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  FlatList,
  ScrollView,
  Platform,
  Dimensions,
  KeyboardAvoidingView,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FeedItem, Comment } from '../../types/feed';
import CommentItem from './CommentItem';
import CommentInput from './CommentInput';
import FeedCardHeader from '../feed/FeedCardHeader';
import FeedCardBody from '../feed/FeedCardBody';
import { useComments } from '../../hooks/useComments';
import { useAuth } from '../../store/AuthContext';
import { colors, spacing, typography } from '../../theme';

const { height: SCREEN_H } = Dimensions.get('window');

// translateY = position of the sheet's top edge (from top of screen)
const SNAP_HALF = SCREEN_H * 0.52;   // half screen open
const SNAP_FULL = SCREEN_H * 0.08;   // almost full screen
const DISMISS_Y  = SCREEN_H * 0.75;  // drag below here → dismiss

interface CommentsSheetProps {
  item: FeedItem | null;
  onClose: () => void;
  onCommentCountChange?: (delta: number) => void;
}

export default function CommentsSheet({ item, onClose, onCommentCountChange }: CommentsSheetProps) {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [visible, setVisible] = useState(false);
  const [replyingTo, setReplyingTo] = useState<{ commentId: number; username: string } | null>(null);

  // Shared value: top edge of sheet in screen coordinates
  const sheetY = useSharedValue(SCREEN_H);
  const dragStartY = useSharedValue(SNAP_HALF);

  const { comments, isLoading, loadComments, postComment, removeComment, likeComment, loadReplies, postReply } =
    useComments(onCommentCountChange);

  // ── Animate closed then call onClose ──────────────────────────────────────
  const animateClose = useCallback(() => {
    sheetY.value = withTiming(SCREEN_H, { duration: 280 }, (done) => {
      if (done) {
        runOnJS(setVisible)(false);
        runOnJS(onClose)();
      }
    });
  }, [onClose, sheetY]);

  // ── Open / close on item change ────────────────────────────────────────────
  useEffect(() => {
    if (item) {
      loadComments(item);
      setVisible(true);
      sheetY.value = SCREEN_H;
      sheetY.value = withSpring(SNAP_HALF, { damping: 22, stiffness: 180 });
    } else {
      animateClose();
    }
  }, [item]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Pan gesture on the drag handle ────────────────────────────────────────
  const panGesture = Gesture.Pan()
    .onStart(() => {
      dragStartY.value = sheetY.value;
    })
    .onUpdate((e) => {
      const next = dragStartY.value + e.translationY;
      sheetY.value = Math.max(SNAP_FULL, next);
    })
    .onEnd((e) => {
      const y = sheetY.value;
      const vy = e.velocityY;

      if (y > DISMISS_Y || vy > 700) {
        runOnJS(animateClose)();
      } else if (y < (SNAP_FULL + SNAP_HALF) / 2 || vy < -600) {
        sheetY.value = withSpring(SNAP_FULL, { damping: 22, stiffness: 180 });
      } else {
        sheetY.value = withSpring(SNAP_HALF, { damping: 22, stiffness: 180 });
      }
    });

  // ── Animated styles ────────────────────────────────────────────────────────
  // Post area: height = sheetY (top edge of sheet) so content fills the space above
  const postAreaStyle = useAnimatedStyle(() => ({
    height: sheetY.value,
    overflow: 'hidden' as const,
  }));

  // Sheet: sits at sheetY and stretches to bottom of screen
  const sheetStyle = useAnimatedStyle(() => ({
    top: sheetY.value,
  }));

  if (!visible) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">

      {/* ── Post content (shrinks as sheet rises) ─────────────────────── */}
      <Animated.View pointerEvents="auto" style={[styles.postArea, postAreaStyle]}>
        {item && (
          <ScrollView
            contentContainerStyle={[styles.postScroll, { paddingTop: insets.top + spacing.sm }]}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            <FeedCardHeader
              user={item.user}
              createdAt={item.created_at}
              locationName={item.location_name}
              workoutType={item.workout_type}
              sharedContext={item.shared_context}
            />
            <FeedCardBody item={item} onPollVote={() => {}} />
          </ScrollView>
        )}
      </Animated.View>

      {/* ── Comments sheet ─────────────────────────────────────────────── */}
      <Animated.View pointerEvents="auto" style={[styles.sheet, sheetStyle]}>

        {/* Drag handle + header — only this area triggers the pan */}
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
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          {isLoading ? (
            <View style={styles.loader}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : (
            <FlatList
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
              if (!item) return;
              if (replyingTo) {
                postReply(replyingTo.commentId, text, photo);
                setReplyingTo(null);
              } else {
                postComment(item, text, photo);
              }
            }}
          />
          <View style={{ height: insets.bottom || 8 }} />
        </KeyboardAvoidingView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Post preview area — sits at the top, height driven by sheetY
  postArea: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.background.base,
  },
  postScroll: {
    padding: spacing.base,
    paddingBottom: spacing.md,
  },

  // Comments sheet — sits below the post area
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -3 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
      },
      android: { elevation: 8 },
    }),
  },

  // Drag handle area (the pannable zone)
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

  // Comments content
  loader: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing['3xl'],
  },
  commentsList: {
    padding: spacing.base,
    paddingBottom: spacing.md,
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
