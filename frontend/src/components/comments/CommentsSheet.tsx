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
import { Image } from 'expo-image';
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
import FeedCardVideo from '../feed/FeedCardVideo';
import { useComments } from '../../hooks/useComments';
import { useAuth } from '../../store/AuthContext';
import { colors, spacing, typography } from '../../theme';

const { height: SCREEN_H } = Dimensions.get('window');

// Sheet opens to this position (top edge of sheet from top of screen) and stays fixed
const SNAP_OPEN = SCREEN_H * 0.28;
// Drag past this → dismiss
const DISMISS_Y = SCREEN_H * 0.50;

interface CommentsSheetProps {
  item: FeedItem | null;
  onClose: () => void;
  onCommentCountChange?: (delta: number) => void;
}

export default function CommentsSheet({ item, onClose, onCommentCountChange }: CommentsSheetProps) {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  // Must match CustomTabBar wrapper height so the sheet stops above the nav bar
  const bottomNavHeight = 52 + Math.max(insets.bottom, 16);
  const [visible, setVisible] = useState(false);
  const [replyingTo, setReplyingTo] = useState<{ commentId: string; username: string } | null>(null);

  const itemRef = useRef<FeedItem | null>(null);
  useEffect(() => { itemRef.current = item; }, [item]);

  const sheetY        = useSharedValue(SCREEN_H);
  const dragStartY    = useSharedValue(SNAP_OPEN);
  const keyboardHeight = useSharedValue(0);

  const { comments, isLoading, loadComments, postComment, removeComment, likeComment, loadReplies, postReply } =
    useComments(onCommentCountChange);

  // ── Animate closed then call onClose ──────────────────────────────────────
  const animateClose = useCallback(() => {
    runOnJS(Keyboard.dismiss)();
    sheetY.value = withTiming(SCREEN_H, { duration: 280 }, (done) => {
      if (done) {
        runOnJS(setVisible)(false);
        runOnJS(onClose)();
      }
    });
  }, [onClose, sheetY]);

  // ── Keyboard listeners — animate sheet bottom above keyboard ──────────────
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
      sheetY.value = withTiming(SNAP_OPEN, { duration: 320, easing: Easing.out(Easing.cubic) });
    } else {
      animateClose();
    }
  }, [item]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Pan gesture — only drag down to dismiss, no snap up ───────────────────
  const panGesture = Gesture.Pan()
    .onStart(() => {
      dragStartY.value = sheetY.value;
    })
    .onUpdate((e) => {
      const next = dragStartY.value + e.translationY;
      // Clamp: can only drag downward from SNAP_OPEN
      sheetY.value = Math.max(SNAP_OPEN, next);
    })
    .onEnd((e) => {
      if (sheetY.value > DISMISS_Y || e.velocityY > 700) {
        runOnJS(animateClose)();
      } else {
        sheetY.value = withSpring(SNAP_OPEN, { damping: 22, stiffness: 180 });
      }
    });

  // ── Animated styles ────────────────────────────────────────────────────────
  const postAreaStyle = useAnimatedStyle(() => ({
    height: sheetY.value,
  }));

  const sheetStyle = useAnimatedStyle(() => ({
    top: sheetY.value,
    bottom: bottomNavHeight,
  }));

  // Grows to push CommentInput above the keyboard without moving the sheet
  const keyboardSpacerStyle = useAnimatedStyle(() => ({
    height: Math.max(0, keyboardHeight.value - bottomNavHeight),
  }));

  if (!visible) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">

      {/* ── Media preview (shrunk post, above sheet) ───────────────────── */}
      <Animated.View pointerEvents="auto" style={[styles.postArea, postAreaStyle]}>
        {item && (
          <View style={[styles.mediaContainer, { paddingTop: insets.top }]}>
            {item.video_url ? (
              <View style={styles.mediaFill}>
                <FeedCardVideo uri={item.video_url} />
              </View>
            ) : item.photo_url ? (
              <Image
                source={{ uri: item.photo_url }}
                style={styles.mediaFill}
                contentFit="cover"
              />
            ) : (
              <View style={[styles.mediaFill, styles.textOnlyPreview]}>
                <Text style={styles.textPreviewContent} numberOfLines={5}>
                  {item.description}
                </Text>
              </View>
            )}
          </View>
        )}
      </Animated.View>

      {/* ── Comments sheet ─────────────────────────────────────────────── */}
      <Animated.View pointerEvents="auto" style={[styles.sheet, sheetStyle]}>

        {/* Drag handle — only this area triggers the pan */}
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
  // ── Post preview area ─────────────────────────────────────────────────────
  postArea: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: '#000',
    overflow: 'hidden',
  },
  // Fills the full postArea height; paddingTop applied inline (insets.top)
  mediaContainer: {
    flex: 1,
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.sm,
  },
  // Media stretches to fill available height — eliminates top/bottom black gaps
  mediaFill: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },
  textOnlyPreview: {
    backgroundColor: colors.surface,
    padding: spacing.base,
    justifyContent: 'center',
  },
  textPreviewContent: {
    fontSize: typography.size.sm,
    fontFamily: typography.family.regular,
    color: colors.textPrimary,
    lineHeight: 20,
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
        shadowOpacity: 0.1,
        shadowRadius: 12,
      },
      android: { elevation: 8 },
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
