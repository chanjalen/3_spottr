import React, { useCallback, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import BottomSheet, { BottomSheetBackdrop, BottomSheetView, BottomSheetFlatList } from '@gorhom/bottom-sheet';
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
  const sheetRef = useRef<BottomSheet>(null);
  const { user } = useAuth();
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
      sheetRef.current?.snapToIndex(0);
    } else {
      sheetRef.current?.close();
    }
  }, [item, loadComments]);

  const handleSheetChange = useCallback(
    (index: number) => {
      if (index === -1) onClose();
    },
    [onClose],
  );

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

  const renderComment = useCallback(
    ({ item: comment }: { item: Comment }) => (
      <CommentItem
        comment={comment}
        currentUserId={user?.id}
        onLike={likeComment}
        onDelete={removeComment}
        onLoadReplies={loadReplies}
        onReply={postReply}
      />
    ),
    [user?.id, likeComment, removeComment, loadReplies, postReply],
  );

  const handlePostComment = useCallback(
    (text: string) => {
      if (item) postComment(item, text);
    },
    [item, postComment],
  );

  return (
    <BottomSheet
      ref={sheetRef}
      index={-1}
      snapPoints={['50%', '85%']}
      onChange={handleSheetChange}
      backdropComponent={renderBackdrop}
      enablePanDownToClose
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

      <CommentInput onSubmit={handlePostComment} />
    </BottomSheet>
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
});
