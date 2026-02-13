import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import Avatar from '../common/Avatar';
import ReplyItem from './ReplyItem';
import CommentInput from './CommentInput';
import { Comment } from '../../types/feed';
import { timeAgo } from '../../utils/timeAgo';
import { colors, spacing, typography } from '../../theme';

interface CommentItemProps {
  comment: Comment;
  currentUserId?: number;
  onLike: (id: number) => void;
  onDelete: (id: number) => void;
  onLoadReplies: (id: number) => void;
  onReply: (commentId: number, text: string) => void;
}

export default function CommentItem({
  comment,
  currentUserId,
  onLike,
  onDelete,
  onLoadReplies,
  onReply,
}: CommentItemProps) {
  const [showReplies, setShowReplies] = useState(false);
  const [showReplyInput, setShowReplyInput] = useState(false);
  const isOwn = currentUserId === comment.user.id;

  const handleToggleReplies = () => {
    if (!showReplies && (!comment.replies || comment.replies.length === 0)) {
      onLoadReplies(comment.id);
    }
    setShowReplies(!showReplies);
  };

  const handleReply = (text: string) => {
    onReply(comment.id, text);
    setShowReplyInput(false);
    setShowReplies(true);
  };

  return (
    <View style={styles.container}>
      <View style={styles.main}>
        <Avatar
          uri={comment.user.avatar_url}
          name={comment.user.display_name}
          size={34}
        />
        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={styles.name}>{comment.user.display_name}</Text>
            <Text style={styles.time}>{timeAgo(comment.created_at)}</Text>
          </View>
          <Text style={styles.text}>{comment.description}</Text>
          <View style={styles.actions}>
            <Pressable
              style={styles.actionBtn}
              onPress={() => onLike(comment.id)}
            >
              <Feather
                name="heart"
                size={14}
                color={
                  comment.user_liked ? colors.semantic.like : colors.text.muted
                }
              />
              {comment.like_count > 0 && (
                <Text
                  style={[
                    styles.actionText,
                    comment.user_liked && { color: colors.semantic.like },
                  ]}
                >
                  {comment.like_count}
                </Text>
              )}
            </Pressable>
            <Pressable
              style={styles.actionBtn}
              onPress={() => setShowReplyInput(!showReplyInput)}
            >
              <Feather
                name="corner-down-right"
                size={14}
                color={colors.text.muted}
              />
              <Text style={styles.actionText}>Reply</Text>
            </Pressable>
            {isOwn && (
              <Pressable
                style={styles.actionBtn}
                onPress={() => onDelete(comment.id)}
              >
                <Feather name="trash-2" size={14} color={colors.text.muted} />
              </Pressable>
            )}
          </View>
        </View>
      </View>

      {comment.reply_count > 0 && (
        <Pressable style={styles.toggleReplies} onPress={handleToggleReplies}>
          <View style={styles.replyLine} />
          <Text style={styles.toggleText}>
            {showReplies
              ? 'Hide replies'
              : `View ${comment.reply_count} ${comment.reply_count === 1 ? 'reply' : 'replies'}`}
          </Text>
        </Pressable>
      )}

      {showReplies &&
        comment.replies?.map((reply) => (
          <ReplyItem
            key={reply.id}
            reply={reply}
            currentUserId={currentUserId}
            onLike={onLike}
            onDelete={onDelete}
          />
        ))}

      {showReplyInput && (
        <View style={styles.replyInputWrap}>
          <CommentInput placeholder="Reply..." onSubmit={handleReply} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.base,
  },
  main: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  content: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: 2,
  },
  name: {
    fontSize: typography.size.sm,
    fontFamily: typography.family.semibold,
    color: colors.text.primary,
  },
  time: {
    fontSize: typography.size.xs,
    fontFamily: typography.family.regular,
    color: colors.text.muted,
  },
  text: {
    fontSize: typography.size.sm,
    fontFamily: typography.family.regular,
    color: colors.text.primary,
    lineHeight: 20,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.base,
    marginTop: spacing.xs,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 2,
  },
  actionText: {
    fontSize: typography.size.xs,
    fontFamily: typography.family.medium,
    color: colors.text.muted,
  },
  toggleReplies: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingLeft: spacing['2xl'] + spacing.sm,
    marginTop: spacing.sm,
  },
  replyLine: {
    width: 20,
    height: 1,
    backgroundColor: colors.border.default,
  },
  toggleText: {
    fontSize: typography.size.xs,
    fontFamily: typography.family.medium,
    color: colors.brand.primary,
  },
  replyInputWrap: {
    paddingLeft: spacing['2xl'],
    marginTop: spacing.sm,
  },
});
