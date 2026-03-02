import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import {
  BottomSheetModal,
  BottomSheetBackdrop,
  BottomSheetView,
  BottomSheetFlatList,
  BottomSheetFooter,
} from '@gorhom/bottom-sheet';
import { FeedItem, Comment } from '../../types/feed';
import CommentItem from './CommentItem';
import CommentInput from './CommentInput';
import { useComments } from '../../hooks/useComments';
import { useAuth } from '../../store/AuthContext';
import { colors, spacing, typography } from '../../theme';

interface CommentsSheetProps {
  item: FeedItem | null;
  onClose: () => void;
}

export default function CommentsSheet({ item, onClose }: CommentsSheetProps) {
  const sheetRef = useRef<BottomSheetModal>(null);
  const { user } = useAuth();
  const [replyingTo, setReplyingTo] = useState<{ commentId: number; username: string } | null>(null);
  const {
    comments,
    isLoading,
    loadComments,
    postComment,
    removeComment,
    likeComment,
    loadReplies,
    postReply,
  } = useComments();

  useEffect(() => {
    if (item) {
      loadComments(item);
      sheetRef.current?.present();
    } else {
      sheetRef.current?.dismiss();
    }
  }, [item, loadComments]);

  const handleDismiss = useCallback(() => {
    setReplyingTo(null);
    onClose();
  }, [onClose]);

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        opacity={0.5}
      />
    ),
    [],
  );

  const handlePostOrReply = useCallback(
    (text: string) => {
      if (!item) return;
      if (replyingTo) {
        postReply(replyingTo.commentId, text);
        setReplyingTo(null);
      } else {
        postComment(item, text);
      }
    },
    [item, replyingTo, postComment, postReply],
  );

  const handleStartReply = useCallback((commentId: number, username: string) => {
    setReplyingTo({ commentId, username });
  }, []);

  const renderFooter = useCallback(
    (props: any) => (
      <BottomSheetFooter {...props}>
        {replyingTo && (
          <View style={styles.replyBanner}>
            <Text style={styles.replyBannerText}>
              Replying to @{replyingTo.username}
            </Text>
            <Pressable onPress={() => setReplyingTo(null)} hitSlop={8}>
              <Text style={styles.cancelReply}>Cancel</Text>
            </Pressable>
          </View>
        )}
        <CommentInput
          placeholder={replyingTo ? `Reply to @${replyingTo.username}...` : 'Add a comment...'}
          onSubmit={handlePostOrReply}
        />
      </BottomSheetFooter>
    ),
    [handlePostOrReply, replyingTo],
  );

  const renderComment = useCallback(
    ({ item: comment }: { item: Comment }) => (
      <CommentItem
        comment={comment}
        currentUserId={user?.id}
        onLike={likeComment}
        onDelete={removeComment}
        onLoadReplies={loadReplies}
        onStartReply={handleStartReply}
      />
    ),
    [user?.id, likeComment, removeComment, loadReplies, handleStartReply],
  );

  return (
    <BottomSheetModal
      ref={sheetRef}
      snapPoints={['50%', '85%']}
      onDismiss={handleDismiss}
      backdropComponent={renderBackdrop}
      footerComponent={renderFooter}
      enablePanDownToClose
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      backgroundStyle={styles.background}
      handleIndicatorStyle={styles.handle}
    >
      <BottomSheetView style={styles.header}>
        <Text style={styles.title}>
          Comments{item ? ` (${item.comment_count})` : ''}
        </Text>
      </BottomSheetView>

      {isLoading ? (
        <BottomSheetView style={styles.loader}>
          <ActivityIndicator color={colors.primary} />
        </BottomSheetView>
      ) : (
        <BottomSheetFlatList
          data={comments}
          keyExtractor={(c) => String(c.id)}
          renderItem={renderComment}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>
                No comments yet. Be the first!
              </Text>
            </View>
          }
        />
      )}
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  background: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  handle: {
    backgroundColor: colors.border.default,
    width: 36,
  },
  header: {
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  title: {
    fontSize: typography.size.md,
    fontFamily: typography.family.semibold,
    color: colors.textPrimary,
  },
  list: {
    padding: spacing.base,
    paddingBottom: spacing['3xl'],
  },
  loader: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing['3xl'],
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
