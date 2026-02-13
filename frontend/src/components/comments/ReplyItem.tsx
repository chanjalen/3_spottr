import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import Avatar from '../common/Avatar';
import { Comment } from '../../types/feed';
import { timeAgo } from '../../utils/timeAgo';
import { colors, spacing, typography } from '../../theme';

interface ReplyItemProps {
  reply: Comment;
  currentUserId?: number;
  onLike: (id: number) => void;
  onDelete: (id: number) => void;
}

export default function ReplyItem({
  reply,
  currentUserId,
  onLike,
  onDelete,
}: ReplyItemProps) {
  const isOwn = currentUserId === reply.user.id;

  return (
    <View style={styles.container}>
      <Avatar uri={reply.user.avatar_url} name={reply.user.display_name} size={28} />
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.name}>{reply.user.display_name}</Text>
          <Text style={styles.time}>{timeAgo(reply.created_at)}</Text>
        </View>
        <Text style={styles.text}>{reply.description}</Text>
        <View style={styles.actions}>
          <Pressable style={styles.actionBtn} onPress={() => onLike(reply.id)}>
            <Feather
              name="heart"
              size={12}
              color={reply.user_liked ? colors.semantic.like : colors.text.muted}
            />
            {reply.like_count > 0 && (
              <Text
                style={[
                  styles.actionText,
                  reply.user_liked && { color: colors.semantic.like },
                ]}
              >
                {reply.like_count}
              </Text>
            )}
          </Pressable>
          {isOwn && (
            <Pressable
              style={styles.actionBtn}
              onPress={() => onDelete(reply.id)}
            >
              <Feather name="trash-2" size={12} color={colors.text.muted} />
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingLeft: spacing['2xl'] + spacing.sm,
    marginTop: spacing.sm,
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
    fontSize: typography.size.xs,
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
    lineHeight: 18,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.base,
    marginTop: 4,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingVertical: 2,
  },
  actionText: {
    fontSize: typography.size.xs,
    fontFamily: typography.family.medium,
    color: colors.text.muted,
  },
});
