import React, { useState } from 'react';
import { View, Text, Pressable, Image, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Avatar from '../common/Avatar';
import ReplyItem from './ReplyItem';
import MentionText from '../common/MentionText';
import { Comment } from '../../types/feed';
import { RootStackParamList } from '../../navigation/types';
import { timeAgo } from '../../utils/timeAgo';
import { colors, spacing, typography } from '../../theme';

interface CommentItemProps {
  comment: Comment;
  currentUserId?: string;
  onLike: (id: string) => void;
  onDelete: (id: string) => void;
  onLoadReplies: (id: string) => void;
  onStartReply: (commentId: string, username: string) => void;
}

export default function CommentItem({
  comment,
  currentUserId,
  onLike,
  onDelete,
  onLoadReplies,
  onStartReply,
}: CommentItemProps) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [showReplies, setShowReplies] = useState(false);

  if (!comment?.user) return null;

  const isOwn = currentUserId === comment.user.id;
  const goToProfile = () => navigation.navigate('Profile', { username: comment.user.username });

  const handleToggleReplies = () => {
    if (!showReplies && (!comment.replies || comment.replies.length === 0)) {
      onLoadReplies(comment.id);
    }
    setShowReplies(!showReplies);
  };

  return (
    <View style={styles.container}>
      {/* ── Main comment row ────────────────────────────────────────── */}
      <View style={styles.row}>
        <Avatar
          uri={comment.user.avatar_url}
          name={comment.user.display_name}
          size={34}
          onPress={goToProfile}
        />

        {/* Content + like button */}
        <View style={styles.bodyWrap}>
          <View style={styles.textWrap}>
            {/* Inline: bold username then comment text */}
            <Text style={styles.inlineText}>
              <Text style={styles.username} onPress={goToProfile}>{comment.user.display_name}</Text>
              {!!comment.description && (
                <MentionText
                  content={` ${comment.description}`}
                  textStyle={styles.commentText}
                />
              )}
            </Text>

            {/* Photo (if any) */}
            {!!comment.photo_url && (
              <Image
                source={{ uri: comment.photo_url }}
                style={styles.photo}
                resizeMode="cover"
              />
            )}

            {/* Sub-row: time · Reply · Delete */}
            <View style={styles.metaRow}>
              <Text style={styles.timeText}>{timeAgo(comment.created_at)}</Text>
              <Pressable
                onPress={() => onStartReply(comment.id, comment.user.username)}
                hitSlop={8}
              >
                <Text style={styles.replyText}>Reply</Text>
              </Pressable>
              {isOwn && (
                <Pressable onPress={() => onDelete(comment.id)} hitSlop={8}>
                  <Feather name="trash-2" size={12} color={colors.textMuted} />
                </Pressable>
              )}
            </View>
          </View>

          {/* Heart — right side */}
          <Pressable
            style={styles.likeBtn}
            onPress={() => onLike(comment.id)}
            hitSlop={8}
          >
            <Feather
              name="heart"
              size={14}
              color={comment.user_liked ? colors.semantic.like : colors.textMuted}
            />
            {comment.like_count > 0 && (
              <Text
                style={[
                  styles.likeCount,
                  comment.user_liked && { color: colors.semantic.like },
                ]}
              >
                {comment.like_count}
              </Text>
            )}
          </Pressable>
        </View>
      </View>

      {/* ── View / hide replies ─────────────────────────────────────── */}
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
            onStartReply={(username) => onStartReply(comment.id, username)}
          />
        ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.md,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  bodyWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  textWrap: {
    flex: 1,
  },
  inlineText: {
    lineHeight: 20,
  },
  username: {
    fontSize: typography.size.sm,
    fontFamily: typography.family.semibold,
    color: colors.textPrimary,
  },
  commentText: {
    fontSize: typography.size.sm,
    fontFamily: typography.family.regular,
    color: colors.textPrimary,
  },
  photo: {
    width: '100%',
    height: 160,
    borderRadius: 10,
    marginTop: spacing.xs,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.base,
    marginTop: 4,
  },
  timeText: {
    fontSize: typography.size.xs,
    fontFamily: typography.family.regular,
    color: colors.textMuted,
  },
  replyText: {
    fontSize: typography.size.xs,
    fontFamily: typography.family.semibold,
    color: colors.textMuted,
  },
  likeBtn: {
    alignItems: 'center',
    paddingTop: 2,
    minWidth: 24,
  },
  likeCount: {
    fontSize: typography.size.xs,
    fontFamily: typography.family.regular,
    color: colors.textMuted,
    marginTop: 2,
    textAlign: 'center',
  },
  toggleReplies: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingLeft: 34 + spacing.sm, // align with comment text (avatar width + gap)
    marginTop: spacing.xs,
  },
  replyLine: {
    width: 20,
    height: 1,
    backgroundColor: colors.border.default,
  },
  toggleText: {
    fontSize: typography.size.xs,
    fontFamily: typography.family.semibold,
    color: colors.textMuted,
  },
});
